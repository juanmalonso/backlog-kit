#!/usr/bin/env node
// Lo invoca .githooks/prepare-commit-msg: si la rama es de una historia, el mensaje empieza con su
// id ("HU-012: …"). No toca merges, squash ni mensajes que ya traen un id.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../lib/config.mjs';
import { createPm } from '../lib/pm.mjs';
import { currentBranch, storyOfBranch } from '../lib/insights.mjs';

const [file, source] = process.argv.slice(2);
if (!file || ['merge', 'squash', 'commit'].includes(source)) process.exit(0);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
try {
  const cfg = loadConfig(root);
  if (cfg.commitPrefix === false) process.exit(0);
  const pm = createPm(root, cfg);
  const story = storyOfBranch(pm, currentBranch(root));
  if (!story) process.exit(0);
  const text = readFileSync(file, 'utf8');
  if (new RegExp(`^\\[?${cfg.idPattern}`).test(text)) process.exit(0);
  writeFileSync(file, `${story.v.id}: ${text}`);
} catch {
  // un hook de mensaje nunca frena un commit
}
