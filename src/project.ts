// Acceso al proyecto abierto: raíz, lectura de .pm/ con la misma librería que usan los scripts, y
// ejecución de los scripts del proyecto (las escrituras de estado pasan siempre por ellos).
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import * as vscode from 'vscode';
import { createPm, section, toggleChecklist } from '../kit/scripts/lib/pm.mjs';
import { createGh } from '../kit/scripts/lib/gh.mjs';
import { ROLES } from '../kit/scripts/lib/config.mjs';
import { blockedReason, dependencyIndex, storyOfBranch as ofBranch } from '../kit/scripts/lib/insights.mjs';

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

export type CiState = 'pass' | 'fail' | 'pending' | 'none';
export interface PrInfo {
  number: number;
  url: string;
  draft: boolean;
  ci: CiState;
}

/** Resume los checks de un PR en un semáforo. */
export function ciState(rollup: any[] | null | undefined): CiState {
  if (!rollup?.length) return 'none';
  const v = rollup.map((c) => String(c.conclusion || c.state || c.status || '').toUpperCase());
  if (v.some((x) => ['FAILURE', 'CANCELLED', 'TIMED_OUT', 'ACTION_REQUIRED', 'STARTUP_FAILURE', 'ERROR'].includes(x))) return 'fail';
  if (v.some((x) => ['', 'PENDING', 'QUEUED', 'IN_PROGRESS', 'EXPECTED', 'WAITING', 'REQUESTED'].includes(x))) return 'pending';
  return 'pass';
}

// Los PR se piden a GitHub como mucho cada 60 s: el tablero se repinta seguido.
const prCache = new Map<string, { at: number; data: Map<string, PrInfo> }>();
export async function openPrs(root: string, force = false): Promise<Map<string, PrInfo>> {
  const hit = prCache.get(root);
  if (hit && !force && Date.now() - hit.at < 60_000) return hit.data;
  const r = await run(root, 'gh', ['pr', 'list', '--state', 'open', '--limit', '200', '--json', 'number,headRefName,url,isDraft,statusCheckRollup']);
  const data = new Map<string, PrInfo>();
  if (r.ok) {
    try {
      for (const p of JSON.parse(r.out))
        data.set(p.headRefName, { number: p.number, url: p.url, draft: p.isDraft, ci: ciState(p.statusCheckRollup) });
    } catch {
      // salida inesperada de gh: sin datos de PR
    }
  }
  prCache.set(root, { at: Date.now(), data });
  return data;
}

/** Todo lo que el tablero necesita para pintarse. */
export async function boardData(root: string, { refreshPrs = false } = {}) {
  const pm = createPm(root);
  const { cfg } = pm;
  let repoUrl: string | null = null;
  try {
    if (cfg.github?.enabled) repoUrl = `https://github.com/${createGh(root, cfg).repo()}`;
  } catch {
    // sin remote de GitHub: las tarjetas no enlazan el issue
  }
  const raw = pm.loadStories();
  const views = raw.filter((s: any) => s.data).map((s: any) => pm.view(s));
  const idx = dependencyIndex(views, cfg);
  const prs = cfg.github?.enabled ? await openPrs(root, refreshPrs) : new Map<string, PrInfo>();
  const stories = raw.map((s: any) => {
    const v = pm.view(s);
    return {
      ...v,
      file: undefined,
      path: v.file,
      pendingDeps: idx.pending.get(v.id) ?? [],
      dependents: idx.dependents.get(v.id) ?? [],
      unlocks: idx.unlocks.get(v.id) ?? 0,
      blockedReason: v.status === cfg.states.blocked ? blockedReason(s, cfg) : null,
      pr: (v.branch && prs.get(v.branch)) || null,
    };
  });
  return {
    language: cfg.language,
    states: ROLES.map((role: string) => ({ role, name: cfg.states[role] })),
    transitions: cfg.transitions,
    priorities: cfg.priorities,
    types: cfg.types,
    fields: cfg.fields,
    epics: pm.loadEpics().map((e: any) => ({ id: e.id, title: e.title })),
    stories,
    branch: await currentBranch(root),
    repoUrl,
    github: Boolean(cfg.github?.enabled),
  };
}

/** Lo que muestra el panel de detalle de una historia. */
export function storyDetail(root: string, id: string) {
  const pm = createPm(root);
  const { cfg } = pm;
  const story = pm.findStory(id);
  const criteria = section(story.body, cfg.sections.criteria)
    .split('\n')
    .filter((l: string) => /^\s*- \[[ xX]\]/.test(l))
    .map((l: string, index: number) => ({ index, checked: /^\s*- \[[xX]\]/.test(l), text: l.replace(/^\s*- \[[ xX]\]\s*/, ''), nested: /^\s{2,}/.test(l) }));
  const log = section(story.body, cfg.sections.log)
    .split('\n')
    .filter((l: string) => l.startsWith('- '))
    .map((l: string) => l.slice(2));
  return {
    id: pm.view(story).id,
    story: section(story.body, cfg.sections.story),
    criteria,
    criteriaTitle: cfg.sections.criteria,
    log: log.slice(-12).reverse(),
    questions: section(story.body, cfg.sections.questions),
  };
}

export function toggleCriterion(root: string, id: string, index: number, checked: boolean) {
  const pm = createPm(root);
  const story = pm.findStory(id);
  toggleChecklist(story.file, pm.cfg.sections.criteria, index, checked);
}

export function storyByBranch(root: string, branch: string) {
  return ofBranch(createPm(root), branch)?.v;
}

export function configOf(root: string) {
  return createPm(root).cfg;
}
