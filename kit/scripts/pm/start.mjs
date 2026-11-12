#!/usr/bin/env node
// Empezar una historia en un paso: la pasa a en curso (si no lo está) y crea su rama desde la
// rama principal remota, o se cambia a ella si ya existe.
//   npm run pm:start -- HU-012 [--sin-github]
import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { project } from '../lib/project.mjs';

const args = process.argv.slice(2);
const id = args.find((a) => !a.startsWith('--'));
const pm = project();
const { cfg, t } = pm;
const K = cfg.keys;
const git = (...a) => execFileSync('git', a, { cwd: pm.root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

try {
  if (!id) throw new Error(t.startUsage);
  let story = pm.findStory(id);
  if (story.data[K.status] !== cfg.states.inProgress) {
    const r = spawnSync('node', [path.join(pm.root, 'scripts/pm/advance.mjs'), story.data[K.id], cfg.states.inProgress, ...args.filter((a) => a.startsWith('--'))], {
      cwd: pm.root,
      encoding: 'utf8',
    });
    process.stdout.write((r.stdout ?? '').split('\n').filter((l) => !l.startsWith('→')).join('\n'));
    if (r.status !== 0) {
      process.stderr.write(r.stderr ?? '');
      process.exit(r.status ?? 1);
    }
    story = pm.findStory(id);
  }
  const branch = story.data[K.branch];
  const exists = (ref) => {
    try {
      git('rev-parse', '--verify', '--quiet', ref);
      return true;
    } catch {
      return false;
    }
  };
  if (git('branch', '--show-current') === branch) console.log(t.alreadyOn(branch));
  else if (exists(`refs/heads/${branch}`)) {
    git('switch', branch);
    console.log(t.switched(branch));
  } else {
    try {
      git('fetch', '--quiet', 'origin', cfg.mainBranch);
    } catch {
      console.error(t.fetchFailed);
    }
    const base = exists(`refs/remotes/origin/${cfg.mainBranch}`) ? `origin/${cfg.mainBranch}` : cfg.mainBranch;
    git('switch', '-c', branch, base);
    console.log(t.created_branch(branch, base));
  }
} catch (err) {
  console.error(`✗ ${(err.stderr || err.message).toString().trim()}`);
  process.exit(1);
}
