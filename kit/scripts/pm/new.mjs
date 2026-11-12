#!/usr/bin/env node
// Crea una historia desde la plantilla de .pm/templates/ con el próximo id libre.
//   npm run pm:new -- --epic E00 --title "Login con Google" [--type feature] [--priority media]
//                     [--status REFINANDO] [--sin-github]
// Imprime el id y la ruta. Si queda fuera del backlog y GitHub está activo, crea el issue.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { setFields, today } from '../lib/pm.mjs';
import { githubOff, project } from '../lib/project.mjs';
import { backlogFile, renderBacklog } from './backlog.mjs';

const args = process.argv.slice(2);
const value = (...n) => {
  const i = args.findIndex((a) => n.includes(a));
  return i >= 0 ? args[i + 1] : undefined;
};
const pm = project();
const { cfg, t } = pm;
const K = cfg.keys;

export function slugify(s) {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50)
    .replace(/-$/, '');
}

try {
  const epicId = value('--epic', '--epica');
  const title = value('--title', '--nombre');
  if (!epicId || !title) throw new Error(t.newUsage);
  const epic = pm.loadEpics().find((e) => e.id === epicId.toUpperCase());
  if (!epic) throw new Error(t.newNoEpic(epicId, pm.loadEpics().map((e) => e.id).join(', ')));
  const status = value('--status', '--estado') ?? cfg.states.refining;
  if (![cfg.states.backlog, cfg.states.refining].includes(status)) throw new Error(t.newStatus(cfg.states.backlog, cfg.states.refining));
  const type = value('--type', '--tipo') ?? cfg.types[0];
  const priority = value('--priority', '--prioridad') ?? cfg.priorities[Math.min(2, cfg.priorities.length - 1)];
  if (!cfg.types.includes(type)) throw new Error(t.badValue(K.type, type, cfg.types.join(', ')));
  if (!cfg.priorities.includes(priority)) throw new Error(t.badValue(K.priority, priority, cfg.priorities.join(', ')));

  const tplDir = path.join(pm.PM, 'templates');
  const tplName = existsSync(tplDir) ? readdirSync(tplDir).find((f) => f.endsWith('.md')) : null;
  if (!tplName) throw new Error(t.newNoTemplate);
  const nextArgs = [path.join(pm.root, 'scripts/pm/next-id.mjs'), ...(githubOff(args, cfg) ? ['--sin-github'] : [])];
  const id = execFileSync('node', nextArgs, { cwd: pm.root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  const folder = path.join(pm.PM, epic.folder, `${id}-${slugify(title)}`);
  const file = path.join(folder, 'README.md');
  const text = readFileSync(path.join(tplDir, tplName), 'utf8')
    .replaceAll(`${cfg.storyPrefix}-NNN`, id)
    .replaceAll('YYYY-MM-DD', today())
    .replace(/^(# \S+ — ).*$/m, `$1${title}`)
    .replace(new RegExp(`\\(${cfg.states.refining}\\)\\s*$`, 'm'), `(${status})`);
  mkdirSync(folder, { recursive: true });
  writeFileSync(file, text);
  setFields(file, { [K.epic]: epic.id, [K.title]: title, [K.type]: type, [K.priority]: priority, [K.status]: status, [K.updated]: today() });
  writeFileSync(backlogFile(pm), renderBacklog(pm, t));
  console.log(t.newCreated(id, pm.rel(file)));
  if (!githubOff(args, cfg) && status !== cfg.states.backlog) {
    const { syncOne } = await import('./sync-issue.mjs');
    syncOne(pm, id);
  }
} catch (err) {
  console.error(`✗ ${err.message}`);
  process.exit(1);
}
