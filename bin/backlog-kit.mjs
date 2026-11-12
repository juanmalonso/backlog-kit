#!/usr/bin/env node
// CLI de backlog-kit: el mismo init que la extensión, sin VS Code.
//
//   npx backlog-kit init [--dir .] [--lang es|en] [--prefix HU] [--main main] [--check "npm test"]
//                        [--fields phase,stage,requirements,spec] [--epic "Nombre"]
//                        [--no-skills] [--no-github] [--no-git-guard] [--no-ci] [--dry-run] [--force]
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyInit, planInit } from '../src/init/scaffold.mjs';

const KIT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'kit');
const [cmd, ...args] = process.argv.slice(2);
const value = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const has = (name) => args.includes(name);

if (cmd !== 'init') {
  console.log('Uso / usage: backlog-kit init [--lang es|en] [--prefix HU] [--fields phase,stage] [--no-github] [--dry-run] …');
  process.exit(cmd ? 1 : 0);
}

const root = path.resolve(value('--dir') ?? process.cwd());
const plan = planInit(
  root,
  {
    language: value('--lang') ?? 'es',
    storyPrefix: value('--prefix'),
    mainBranch: value('--main') ?? 'main',
    checkCommand: value('--check'),
    fields: (value('--fields') ?? '').split(',').filter(Boolean),
    epicTitle: value('--epic'),
    skills: !has('--no-skills'),
    github: !has('--no-github'),
    gitGuard: !has('--no-git-guard'),
    ci: !has('--no-ci'),
  },
  KIT,
);

if (has('--dry-run')) {
  for (const a of plan.actions) console.log(`${a.op.padEnd(6)} ${a.path}${a.reason ? ` (${a.reason})` : ''}`);
  process.exit(0);
}
let notes;
try {
  ({ notes } = applyInit(root, plan, { log: (l) => console.log(l), force: has('--force') }));
} catch (err) {
  console.error(`✗ ${err.message}\n\nRevisalos o usá --force para pisarlos / review them or use --force to overwrite.`);
  process.exit(1);
}
console.log(`\n✓ backlog-kit listo en ${root}`);
for (const n of notes) console.log(`  · corré a mano / run manually: ${n}`);
if (plan.config.github.enabled) console.log('  · labels y milestones / labels and milestones: npm run pm:setup-github');
