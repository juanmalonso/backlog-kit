// Ids clicables en cualquier archivo: HU-NNN (o el prefijo del proyecto), ADR-NNN y hallazgos,
// con hover que muestra título, estado y criterios.
import * as vscode from 'vscode';
import type { ProjectIndex } from './index';

function* matches(text: string, re: RegExp) {
  re.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) yield m;
}

export function registerLinks(index: () => ProjectIndex | undefined): vscode.Disposable {
  const selector: vscode.DocumentSelector = [{ scheme: 'file' }, { scheme: 'untitled' }, { scheme: 'vscode-scm' }];
  const links = vscode.languages.registerDocumentLinkProvider(selector, {
    provideDocumentLinks(doc) {
      const ix = index();
      if (!ix) return [];
      const text = doc.getText();
      if (text.length > 2_000_000) return [];
      const out: vscode.DocumentLink[] = [];
      for (const m of matches(text, ix.storyRe)) {
        const s = ix.stories.get(m[0]);
        if (!s || doc.uri.fsPath === s.path) continue;
        const range = new vscode.Range(doc.positionAt(m.index), doc.positionAt(m.index + m[0].length));
        const link = new vscode.DocumentLink(range, vscode.Uri.file(s.path));
        link.tooltip = `${s.id} — ${s.title} (${s.status})`;
        out.push(link);
      }
      for (const m of matches(text, ix.docRe)) {
        const file = ix.docs.get(m[0]);
        if (!file || doc.uri.fsPath === file) continue;
        out.push(new vscode.DocumentLink(new vscode.Range(doc.positionAt(m.index), doc.positionAt(m.index + m[0].length)), vscode.Uri.file(file)));
      }
      return out;
    },
  });
  const hover = vscode.languages.registerHoverProvider(selector, {
    provideHover(doc, pos) {
      const ix = index();
      if (!ix) return;
      const range = doc.getWordRangeAtPosition(pos, new RegExp(`${ix.cfg.storyPrefix}-\\d+`));
      if (!range) return;
      const s = ix.stories.get(doc.getText(range));
      if (!s) return;
      const md = new vscode.MarkdownString(
        [
          `**${s.id}** — ${s.title}`,
          '',
          `\`${s.status}\` · ${s.priority ?? '—'} · ${s.epic} ${s.epicTitle}`,
          s.criteria.total ? `\n☑ ${s.criteria.done}/${s.criteria.total}` : '',
          s.pendingDeps.length ? `\n⧗ ${s.pendingDeps.join(', ')}` : '',
          '',
          `[README](${vscode.Uri.file(s.path)}) · [${ix.cfg.language === 'en' ? 'Board' : 'Tablero'}](command:backlogKit.openStory?${encodeURIComponent(JSON.stringify([s.id]))})`,
        ].join('\n'),
      );
      md.isTrusted = { enabledCommands: ['backlogKit.openStory'] };
      return new vscode.Hover(md, range);
    },
  });
  return vscode.Disposable.from(links, hover);
}
