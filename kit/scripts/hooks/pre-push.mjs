#!/usr/bin/env node
// Lo invoca .githooks/pre-push. git pasa por stdin una línea por ref que se va a pushear.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../lib/config.mjs';
import { prePushProblem } from '../lib/git-rules.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let opts = {};
try {
  const cfg = loadConfig(root);
  if (cfg.gitGuard?.enabled === false) process.exit(0);
  opts = { protectedBranch: cfg.mainBranch, lang: cfg.language };
} catch {
  // sin config: protege main
}
let input = '';
for await (const chunk of process.stdin) input += chunk;
const problem = prePushProblem(input, opts);
if (problem) {
  console.error(`✗ ${problem}`);
  process.exit(1);
}
