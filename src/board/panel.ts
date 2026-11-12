// Tablero kanban en un webview. Lee .pm/ para pintar; mover una tarjeta corre `pm:advance` del
// proyecto, así las reglas (transiciones, criterios tildados, nota al bloquear, issue) son las
// mismas que en la terminal y en los skills. Si el script rechaza, la tarjeta vuelve a su lugar.
import { randomBytes } from 'node:crypto';
import * as vscode from 'vscode';
import { workWithClaude } from '../claude';
import { changed, logStory, moveStory, openPr, openReadme, pickAndMove, startStory } from '../actions';
import { boardData, configOf, storyDetail, toggleCriterion } from '../project';
import { createStory } from './create';

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
    this.panel = vscode.window.createWebviewPanel('backlogKit.board', this.title, vscode.ViewColumn.Active, {
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
    this.disposables.push(watcher, head, changed.event(() => this.scheduleRefresh()));
  }

  private get title() {
    try {
      return configOf(this.root).language === 'en' ? 'Board' : 'Tablero';
    } catch {
      return 'Tablero';
    }
  }

  /** Abre el detalle de una historia (desde el panel lateral o un enlace). */
  select(id: string) {
    this.panel.reveal();
    void this.panel.webview.postMessage({ type: 'select', id });
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
      await logStory(this.root, m.id);
      return this.panel.webview.postMessage({ type: 'detail', detail: storyDetail(this.root, m.id) });
    }
    if (m.type === 'start') return startStory(this.root, m.id);
    if (m.type === 'pr') return openPr(this.root, m.id);
    if (m.type === 'claude') return workWithClaude(this.root, m.id, m.status);
    if (m.type === 'new') {
      const id = await createStory(this.root);
      if (id) {
        await this.refresh();
        return this.panel.webview.postMessage({ type: 'select', id });
      }
      return;
    }
    if (m.type === 'open') return openReadme(m.path);
    if (m.type === 'link') return vscode.env.openExternal(vscode.Uri.parse(m.url));
    if (m.type === 'move') return moveStory(this.root, m.id, m.from, m.to);
    if (m.type === 'pick') return pickAndMove(this.root, m.id, m.from);
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
