// Tablero kanban en un webview. Lee .pm/ para pintar; mover una tarjeta corre `pm:advance` del
// proyecto, así las reglas (transiciones, criterios tildados, nota al bloquear, issue) son las
// mismas que en la terminal y en los skills. Si el script rechaza, la tarjeta vuelve a su lugar.
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import * as vscode from 'vscode';
import { boardData, configOf, run, storyDetail, toggleCriterion } from '../project';
import { createStory } from './create';

const TEXT = {
  es: {
    title: 'Tablero',
    moving: (id: string, to: string) => `Moviendo ${id} a ${to}…`,
    note: (to: string) => `Nota para ${to} (qué falta y de quién depende)`,
    force: 'Forzar con nota',
    forceNote: 'Por qué pasa a review con criterios sin tildar',
    branch: 'Crear rama',
    pick: (id: string) => `Mover ${id} a…`,
    noTargets: (id: string, from: string) => `${id} no tiene transiciones válidas desde ${from}.`,
    logPrompt: (id: string) => `Qué avanzó en ${id} (artefactos y qué falta)`,
    working: (what: string) => `${what}…`,
    openPr: 'Abrir PR',
  },
  en: {
    title: 'Board',
    moving: (id: string, to: string) => `Moving ${id} to ${to}…`,
    note: (to: string) => `Note for ${to} (what is missing and who it depends on)`,
    force: 'Force with a note',
    forceNote: 'Why it goes to review with unticked criteria',
    branch: 'Create branch',
    pick: (id: string) => `Move ${id} to…`,
    noTargets: (id: string, from: string) => `${id} has no valid transitions from ${from}.`,
    logPrompt: (id: string) => `What moved forward in ${id} (artifacts and what is left)`,
    working: (what: string) => `${what}…`,
    openPr: 'Open PR',
  },
};

export class BoardPanel {
  static current: BoardPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private readonly disposables: vscode.Disposable[] = [];
  private timer: NodeJS.Timeout | undefined;
  private disposed = false;

  static show(context: vscode.ExtensionContext, root: string) {
    if (BoardPanel.current && BoardPanel.current.root === root) {
      BoardPanel.current.panel.reveal();
      return BoardPanel.current;
    }
    BoardPanel.current?.dispose();
    BoardPanel.current = new BoardPanel(context, root);
    return BoardPanel.current;
  }

  private constructor(
    private readonly context: vscode.ExtensionContext,
    readonly root: string,
  ) {
    const media = vscode.Uri.joinPath(context.extensionUri, 'media');
    this.panel = vscode.window.createWebviewPanel('backlogKit.board', this.t.title, vscode.ViewColumn.Active, {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [media],
    });
    this.panel.webview.html = this.html(media);
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    this.panel.webview.onDidReceiveMessage((m) => this.onMessage(m), null, this.disposables);

    // Cualquier cambio en .pm/ (a mano, por Claude, por git) repinta el tablero.
    const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(root, '.pm/**'));
    const schedule = () => this.scheduleRefresh();
    watcher.onDidChange(schedule);
    watcher.onDidCreate(schedule);
    watcher.onDidDelete(schedule);
    const head = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(root, '.git/HEAD'));
    head.onDidChange(schedule);
    this.disposables.push(watcher, head);
  }

  private get t() {
    try {
      return configOf(this.root).language === 'en' ? TEXT.en : TEXT.es;
    } catch {
      return TEXT.es;
    }
  }

  scheduleRefresh() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.refresh(), 250);
  }

  async refresh(refreshPrs = false) {
    try {
      await this.panel.webview.postMessage({ type: 'data', data: await boardData(this.root, { refreshPrs }) });
    } catch (err) {
      await this.panel.webview.postMessage({ type: 'error', message: (err as Error).message });
    }
  }

  private async script(name: string, args: string[], label: string) {
    const result = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: this.t.working(label) }, () =>
      run(this.root, 'node', [path.join('scripts', 'pm', `${name}.mjs`), ...args]),
    );
    await this.refresh(true);
    if (!result.ok) {
      vscode.window.showErrorMessage(result.out.replace(/^✗\s*/, ''));
      return null;
    }
    return result.out;
  }

  private async onMessage(m: any) {
    if (m.type === 'ready') return this.refresh();
    if (m.type === 'refresh') return this.refresh(true);
    if (m.type === 'detail') {
      try {
        return this.panel.webview.postMessage({ type: 'detail', detail: storyDetail(this.root, m.id) });
      } catch (err) {
        return vscode.window.showErrorMessage((err as Error).message);
      }
    }
    if (m.type === 'toggle') {
      try {
        toggleCriterion(this.root, m.id, m.index, m.checked);
      } catch (err) {
        vscode.window.showErrorMessage((err as Error).message);
      }
      await this.panel.webview.postMessage({ type: 'detail', detail: storyDetail(this.root, m.id) });
      return this.refresh();
    }
    if (m.type === 'log') {
      const text = await vscode.window.showInputBox({ prompt: this.t.logPrompt(m.id), ignoreFocusOut: true });
      if (!text) return;
      const out = await this.script('log', [m.id, text], `pm:log ${m.id}`);
      if (out) vscode.window.setStatusBarMessage(out.split('\n')[0], 4000);
      return this.panel.webview.postMessage({ type: 'detail', detail: storyDetail(this.root, m.id) });
    }
    if (m.type === 'start') {
      const out = await this.script('start', [m.id], `pm:start ${m.id}`);
      if (out) vscode.window.showInformationMessage(out.split('\n').filter(Boolean).pop() ?? out);
      return;
    }
    if (m.type === 'pr') {
      const out = await this.script('pr', [m.id], `pm:pr ${m.id}`);
      const url = out?.match(/https:\/\/\S+/)?.[0];
      if (url) {
        const choice = await vscode.window.showInformationMessage(out!.split('\n').pop()!, this.t.openPr);
        if (choice) vscode.env.openExternal(vscode.Uri.parse(url));
      }
      return;
    }
    if (m.type === 'new') {
      const id = await createStory(this.root);
      if (id) {
        await this.refresh();
        return this.panel.webview.postMessage({ type: 'select', id });
      }
      return;
    }
    if (m.type === 'open') {
      const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(m.path));
      return vscode.window.showTextDocument(doc, { preview: true, viewColumn: vscode.ViewColumn.Beside });
    }
    if (m.type === 'link') return vscode.env.openExternal(vscode.Uri.parse(m.url));
    if (m.type === 'move') return this.move(m.id, m.from, m.to);
    if (m.type === 'pick') {
      const targets: string[] = configOf(this.root).transitions[m.from] ?? [];
      if (!targets.length) return vscode.window.showInformationMessage(this.t.noTargets(m.id, m.from));
      const to = await vscode.window.showQuickPick(targets, { title: this.t.pick(m.id) });
      if (to) return this.move(m.id, m.from, to);
    }
  }

  private async move(id: string, from: string, to: string, extra: string[] = []): Promise<unknown> {
    const cfg = configOf(this.root);
    const role = cfg.roleOf(to);
    const args = [path.join('scripts', 'pm', 'advance.mjs'), id, to, ...extra];
    if (role === 'blocked' && !extra.length) {
      const note = await vscode.window.showInputBox({ prompt: this.t.note(to), ignoreFocusOut: true });
      if (!note) return this.refresh();
      args.push(cfg.language === 'en' ? '--note' : '--nota', note);
    }
    const result = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: this.t.moving(id, to) },
      () => run(this.root, 'node', args),
    );
    await this.refresh();
    if (!result.ok) {
      // Review con criterios sin tildar: se puede forzar, pero con una nota que lo explique.
      if (role === 'review' && !extra.length) {
        const choice = await vscode.window.showErrorMessage(result.out.split('\n')[0], { modal: false }, this.t.force);
        if (choice === this.t.force) {
          const note = await vscode.window.showInputBox({ prompt: this.t.forceNote, ignoreFocusOut: true });
          if (note) {
            const en = cfg.language === 'en';
            return this.move(id, from, to, [en ? '--force' : '--forzar', en ? '--note' : '--nota', note]);
          }
        }
        return;
      }
      return vscode.window.showErrorMessage(result.out.replace(/^✗\s*/, ''));
    }
    const lines = result.out.split('\n');
    const branchLine = lines.find((l) => l.startsWith('→'));
    const command = branchLine?.split(': ').slice(1).join(': ');
    if (command) {
      const choice = await vscode.window.showInformationMessage(lines[0], this.t.branch);
      if (choice === this.t.branch) {
        const term = vscode.window.createTerminal({ name: 'Backlog Kit', cwd: this.root });
        term.show();
        term.sendText(`git fetch && ${command}`);
      }
    } else vscode.window.setStatusBarMessage(lines[0], 4000);
  }

  private html(media: vscode.Uri) {
    const w = this.panel.webview;
    const nonce = randomBytes(16).toString('base64');
    const css = w.asWebviewUri(vscode.Uri.joinPath(media, 'board.css'));
    const js = w.asWebviewUri(vscode.Uri.joinPath(media, 'board.js'));
    return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${w.cspSource}; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="${css}">
<title>Backlog</title>
</head>
<body>
<header class="toolbar" id="toolbar"></header>
<div class="layout">
<main id="board" class="board-wrap" aria-live="polite"></main>
<aside id="detail" class="detail" hidden aria-label="Detalle"></aside>
</div>
<script nonce="${nonce}" src="${js}"></script>
</body>
</html>`;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    BoardPanel.current = undefined;
    clearTimeout(this.timer);
    this.panel.dispose();
    while (this.disposables.length) this.disposables.pop()?.dispose();
  }
}
