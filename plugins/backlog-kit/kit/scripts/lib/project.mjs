// El proyecto donde viven estos scripts: la raíz es dos niveles arriba de scripts/lib/.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPm } from './pm.mjs';
import { messages } from './messages.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

let cached;
export function project() {
  if (!cached) {
    const pm = createPm(ROOT);
    cached = { ...pm, t: messages(pm.cfg.language) };
  }
  return cached;
}

/** `--sin-github` y `--no-github` son lo mismo; también si el config lo apaga. */
export function githubOff(args, cfg) {
  return !cfg.github?.enabled || args.includes('--sin-github') || args.includes('--no-github');
}

export function isMain(metaUrl) {
  return process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(metaUrl);
}
