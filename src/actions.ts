// Acciones sobre una historia que comparten el tablero, el panel lateral y los comandos: siempre
// corren los scripts del proyecto, así las reglas son las mismas que en la terminal y en los skills.
import path from 'node:path';
import * as vscode from 'vscode';
import { configOf, run } from './project';

const TEXT = {
  es: {
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

/** Avisa a tablero y panel lateral que algo cambió (además del watcher de .pm/). */
export const changed = new vscode.EventEmitter<void>();

export function text(root: string) {
  try {
    return configOf(root).language === 'en' ? TEXT.en : TEXT.es;
  } catch {
    return TEXT.es;
  }
}

async function script(root: string, name: string, args: string[], label: string) {
  const result = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: text(root).working(label) }, () =>
    run(root, 'node', [path.join('scripts', 'pm', `${name}.mjs`), ...args]),
  );
  changed.fire();
  if (!result.ok) {
    vscode.window.showErrorMessage(result.out.replace(/^✗\s*/, ''));
    return null;
  }
  return result.out;
}

export async function pickAndMove(root: string, id: string, from: string) {
  const t = text(root);
  const targets: string[] = configOf(root).transitions[from] ?? [];
  if (!targets.length) return vscode.window.showInformationMessage(t.noTargets(id, from));
  const to = await vscode.window.showQuickPick(targets, { title: t.pick(id) });
  if (to) return moveStory(root, id, from, to);
}

export async function moveStory(root: string, id: string, from: string, to: string, extra: string[] = []): Promise<unknown> {
  const t = text(root);
  const cfg = configOf(root);
  const role = cfg.roleOf(to);
  const en = cfg.language === 'en';
  const args = [path.join('scripts', 'pm', 'advance.mjs'), id, to, ...extra];
  if (role === 'blocked' && !extra.length) {
    const note = await vscode.window.showInputBox({ prompt: t.note(to), ignoreFocusOut: true });
    if (!note) return changed.fire();
    args.push(en ? '--note' : '--nota', note);
  }
  const result = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: t.moving(id, to) }, () =>
    run(root, 'node', args),
  );
  changed.fire();
  if (!result.ok) {
    // Review con criterios sin tildar: se puede forzar, pero con una nota que lo explique.
    if (role === 'review' && !extra.length) {
      const choice = await vscode.window.showErrorMessage(result.out.split('\n')[0], t.force);
      if (choice === t.force) {
        const note = await vscode.window.showInputBox({ prompt: t.forceNote, ignoreFocusOut: true });
        if (note) return moveStory(root, id, from, to, [en ? '--force' : '--forzar', en ? '--note' : '--nota', note]);
      }
      return;
    }
    return vscode.window.showErrorMessage(result.out.replace(/^✗\s*/, ''));
  }
  const lines = result.out.split('\n');
  if (lines.some((l) => l.startsWith('→'))) {
    const choice = await vscode.window.showInformationMessage(lines[0], t.branch);
    if (choice === t.branch) return startStory(root, id);
  } else vscode.window.setStatusBarMessage(lines[0], 4000);
}

export async function logStory(root: string, id: string) {
  const textIn = await vscode.window.showInputBox({ prompt: text(root).logPrompt(id), ignoreFocusOut: true });
  if (!textIn) return;
  const out = await script(root, 'log', [id, textIn], `pm:log ${id}`);
  if (out) vscode.window.setStatusBarMessage(out.split('\n')[0], 4000);
}

export async function startStory(root: string, id: string) {
  const out = await script(root, 'start', [id], `pm:start ${id}`);
  if (out) vscode.window.showInformationMessage(out.split('\n').filter(Boolean).pop() ?? out);
}

export async function openPr(root: string, id: string) {
  const out = await script(root, 'pr', [id], `pm:pr ${id}`);
  const url = out?.match(/https:\/\/\S+/)?.[0];
  if (url) {
    const choice = await vscode.window.showInformationMessage(out!.split('\n').pop()!, text(root).openPr);
    if (choice) vscode.env.openExternal(vscode.Uri.parse(url));
  }
}

export async function openReadme(file: string, beside = true) {
  const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(file));
  return vscode.window.showTextDocument(doc, { preview: true, viewColumn: beside ? vscode.ViewColumn.Beside : undefined });
}
