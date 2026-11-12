// Utilidades de los hooks de Claude Code: raíz del proyecto, entrada por stdin y salida de contexto.
// La raíz sale de CLAUDE_PROJECT_DIR o del cwd del hook, no de dónde vive el script: así sirven
// igual copiados en el proyecto que desde el plugin.
import { existsSync } from 'node:fs';
import path from 'node:path';

export async function readInput() {
  let raw = '';
  for await (const chunk of process.stdin) raw += chunk;
  try {
    return JSON.parse(raw || '{}');
  } catch {
    return {};
  }
}

export function projectRoot(input = {}) {
  const candidates = [process.env.CLAUDE_PROJECT_DIR, input.cwd, process.cwd()].filter(Boolean);
  for (const start of candidates) {
    let dir = path.resolve(start);
    for (;;) {
      if (existsSync(path.join(dir, '.pm', 'config.json'))) return dir;
      const up = path.dirname(dir);
      if (up === dir) break;
      dir = up;
    }
  }
  return null;
}

/** Contexto extra para Claude en SessionStart / UserPromptSubmit. */
export function addContext(event, text) {
  if (!text) return;
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: event, additionalContext: text } }));
}

export function clip(text, max = 6000) {
  return text.length > max ? `${text.slice(0, max)}\n…` : text;
}
