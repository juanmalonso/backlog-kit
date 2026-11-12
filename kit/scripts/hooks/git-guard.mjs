#!/usr/bin/env node
// Hook PreToolUse de Claude Code (Bash): aplica las reglas de scripts/lib/git-rules.mjs antes de
// que corra el comando. Si bloquea, sale con 2 y el motivo vuelve al modelo.
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../lib/config.mjs';
import { checksProblem, evaluate } from '../lib/git-rules.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let input = '';
for await (const chunk of process.stdin) input += chunk;

let command = '';
let cwd = root;
try {
  const parsed = JSON.parse(input);
  command = parsed?.tool_input?.command ?? '';
  cwd = parsed?.cwd ?? root;
} catch {
  process.exit(0);
}
if (!/\b(git|gh)\b/.test(command)) process.exit(0);

let opts = { protectedBranch: 'main', lang: 'es' };
try {
  const cfg = loadConfig(root);
  if (cfg.gitGuard?.enabled === false) process.exit(0);
  opts = { protectedBranch: cfg.mainBranch, lang: cfg.language };
} catch {
  // sin config: protege main con los textos por defecto
}

const sh = (cmd, args, dir) =>
  execFileSync(cmd, args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();

// La rama se lee en el directorio de cada segmento (cd, git -C), no en la raíz: si no, un worktree
// en una rama de historia queda bloqueado cuando el checkout principal está en la rama protegida.
const branches = new Map();
const branchOf = (dir) => {
  if (!branches.has(dir)) {
    let branch = '';
    try {
      branch = sh('git', ['branch', '--show-current'], dir);
    } catch {
      // fuera de un repo: las reglas de rama no aplican
    }
    branches.set(dir, branch);
  }
  return branches.get(dir);
};

const verdict = evaluate(command, branchOf, cwd, opts);
if (verdict.block) {
  process.stderr.write(`git-guard: ${verdict.reason}\n`);
  process.exit(2);
}
if (verdict.needsChecks) {
  let problem;
  try {
    const args = ['pr', 'view', ...(verdict.needsChecks.pr ? [verdict.needsChecks.pr] : [])];
    const rollup = JSON.parse(sh('gh', [...args, '--json', 'statusCheckRollup'], verdict.needsChecks.dir)).statusCheckRollup;
    problem = checksProblem(rollup, opts.lang);
  } catch (err) {
    problem = `gh pr view: ${err.message.split('\n')[0]}`;
  }
  if (problem) {
    process.stderr.write(`git-guard: CI ✗ — ${problem}\n`);
    process.exit(2);
  }
}
