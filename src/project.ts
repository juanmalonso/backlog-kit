// Acceso al proyecto abierto: raíz, lectura de .pm/ con la misma librería que usan los scripts, y
// ejecución de los scripts del proyecto (las escrituras pasan siempre por ellos).
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import * as vscode from 'vscode';
import { createPm } from '../kit/scripts/lib/pm.mjs';
import { createGh } from '../kit/scripts/lib/gh.mjs';
import { ROLES } from '../kit/scripts/lib/config.mjs';

export function findRoot(): string | undefined {
  const folders = vscode.workspace.workspaceFolders ?? [];
  return folders.map((f) => f.uri.fsPath).find((p) => existsSync(path.join(p, '.pm', 'config.json')));
}

export function run(root: string, cmd: string, args: string[]): Promise<{ ok: boolean; out: string }> {
  return new Promise((resolve) => {
    execFile(cmd, args, { cwd: root, encoding: 'utf8', timeout: 120_000 }, (err, stdout, stderr) => {
      resolve({ ok: !err, out: `${stdout ?? ''}${stderr ?? ''}`.trim() });
    });
  });
}

export async function currentBranch(root: string): Promise<string> {
  const r = await run(root, 'git', ['branch', '--show-current']);
  return r.ok ? r.out : '';
}

/** Todo lo que el tablero necesita para pintarse. */
export async function boardData(root: string) {
  const pm = createPm(root);
  const { cfg } = pm;
  let repoUrl: string | null = null;
  try {
    if (cfg.github?.enabled) repoUrl = `https://github.com/${createGh(root, cfg).repo()}`;
  } catch {
    // sin remote de GitHub: las tarjetas no enlazan el issue
  }
  const stories = pm
    .loadStories()
    .map((s: any) => pm.view(s))
    .map((v: any) => ({ ...v, file: undefined, path: v.file }));
  return {
    language: cfg.language,
    states: ROLES.map((role: string) => ({ role, name: cfg.states[role] })),
    transitions: cfg.transitions,
    priorities: cfg.priorities,
    fields: cfg.fields,
    epics: pm.loadEpics().map((e: any) => ({ id: e.id, title: e.title })),
    stories,
    branch: await currentBranch(root),
    repoUrl,
  };
}

export function storyByBranch(root: string, branch: string) {
  if (!branch) return undefined;
  const pm = createPm(root);
  return pm
    .loadStories()
    .map((s: any) => pm.view(s))
    .find((v: any) => v.branch === branch);
}

export function configOf(root: string) {
  return createPm(root).cfg;
}
