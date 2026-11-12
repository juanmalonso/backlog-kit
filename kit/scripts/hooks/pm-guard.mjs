#!/usr/bin/env node
// Hook PostToolUse de Claude Code (Write|Edit): si se tocó algo de .pm/ (o una migración, si el
// config las declara), regenera el backlog y corre el guard. Si falla, sale con 2 y el error
// vuelve al modelo en el acto.
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../lib/config.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let input = '';
for await (const chunk of process.stdin) input += chunk;

let file = '';
try {
  file = JSON.parse(input)?.tool_input?.file_path ?? '';
} catch {
  process.exit(0);
}
let cfg;
try {
  cfg = loadConfig(root);
} catch {
  process.exit(0);
}
const relPath = path.relative(root, path.resolve(root, file)).split(path.sep).join('/');
const touchesPm =
  relPath.startsWith('.pm/') && !relPath.startsWith('.pm/templates/') && relPath !== '.pm/backlog.md';
const touchesMigration = Boolean(cfg.migrations?.dir) && relPath.startsWith(`${cfg.migrations.dir.replace(/\/$/, '')}/`);
if (!touchesPm && !touchesMigration) process.exit(0);

try {
  if (touchesPm) execFileSync('node', [path.join(root, 'scripts/pm/backlog.mjs'), '--quiet'], { stdio: 'pipe' });
  execFileSync('node', [path.join(root, 'scripts/pm/check.mjs'), '--hook', '--quiet'], { stdio: 'pipe' });
} catch (err) {
  process.stderr.write((err.stderr || err.stdout || err.message).toString());
  process.exit(2);
}
