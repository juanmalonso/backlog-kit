#!/usr/bin/env node
// Hook UserPromptSubmit: si el mensaje nombra una historia ("seguí con HU-044"), le agrega a Claude
// su README, así la lee antes de hacer nada. Hasta tres historias por mensaje.
import { readFileSync } from 'node:fs';
import { createPm } from '../lib/pm.mjs';
import { addContext, clip, projectRoot, readInput } from './common.mjs';

const input = await readInput();
const root = projectRoot(input);
const prompt = String(input.prompt ?? '');
if (!root || !prompt) process.exit(0);
try {
  const pm = createPm(root);
  const ids = [...new Set(prompt.match(new RegExp(`\\b${pm.cfg.storyPrefix}-\\d+\\b`, 'gi')) ?? [])].slice(0, 3);
  const parts = [];
  for (const raw of ids) {
    try {
      const s = pm.findStory(raw);
      parts.push(`backlog-kit — ${pm.rel(s.file)}:\n\n${clip(readFileSync(s.file, 'utf8'), 8000)}`);
    } catch {
      // id que no existe: nada que agregar
    }
  }
  addContext('UserPromptSubmit', parts.join('\n\n---\n\n'));
} catch {
  // nunca frena el mensaje
}
