#!/usr/bin/env node
// Próximo id libre de historia (o de migración con --migracion), mirando todo lo que puede chocar:
// el working tree, todas las ramas remotas y los títulos de los issues. El guard solo ve la rama
// actual; este script evita que dos sesiones en paralelo elijan el mismo número.
//
//   npm run pm:next-id                  → HU-037
//   npm run pm:next-id -- --migracion   → 0003 (si el config declara migraciones)
//   npm run pm:next-id -- --sin-github  (no consulta la API)
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { createGh } from '../lib/gh.mjs';
import { githubOff, project } from '../lib/project.mjs';

const args = process.argv.slice(2);
const pm = project();
const { cfg, t } = pm;
const migration = args.includes('--migracion') || args.includes('--migration');
const width = cfg.migrations?.digits ?? 4;
const git = (...a) => execFileSync('git', a, { cwd: pm.root, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
const found = new Map();
const note = (n, where) => {
  if (!found.has(n)) found.set(n, where);
};
const storyRe = new RegExp(`(?:^|/)${cfg.storyPrefix}-(\\d+)-`);
const migRe = new RegExp(`^(\\d{${width}})_`);

if (migration) {
  if (!cfg.migrations?.dir) throw new Error('migrations.dir no está en .pm/config.json');
  const dir = path.join(pm.root, cfg.migrations.dir);
  if (existsSync(dir))
    for (const f of readdirSync(dir)) {
      const m = f.match(migRe);
      if (m) note(Number(m[1]), 'working tree');
    }
} else {
  for (const s of pm.loadStories()) {
    const m = s.folder.match(storyRe);
    if (m) note(Number(m[1]), 'working tree');
  }
}

let refs = [];
try {
  try {
    git('fetch', '--quiet', 'origin');
  } catch {
    console.error(t.fetchFailed);
  }
  refs = git('for-each-ref', '--format=%(refname:short)', 'refs/remotes').split('\n').filter((r) => r && !r.endsWith('/HEAD'));
} catch {
  // sin git o sin remotes: alcanza con el working tree
}
for (const ref of refs) {
  for (const p of git('ls-tree', '-r', '--name-only', ref, '--', migration ? cfg.migrations.dir : '.pm').split('\n')) {
    const m = migration ? path.basename(p).match(migRe) : p.match(storyRe);
    if (m) note(Number(m[1]), ref);
  }
}

if (!migration && !githubOff(args, cfg)) {
  try {
    for (const i of createGh(pm.root, cfg).storyIssues())
      if (i.story) note(Number(i.story.slice(cfg.storyPrefix.length + 1)), `issue #${i.number}`);
  } catch (err) {
    console.error(t.ghFailed(err.message.split('\n')[0]));
  }
}

const max = Math.max(0, ...found.keys());
console.log(migration ? String(max + 1).padStart(width, '0') : cfg.formatId(max + 1));
if (args.includes('--verbose') && max) console.error(`(${max}: ${found.get(max)})`);
