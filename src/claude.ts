// Puente con Claude Code: abrir una sesión con la historia cargada y detectar sesiones activas por
// rama (leyendo el final de los transcripts recientes de ~/.claude/projects).
import { existsSync, openSync, readSync, closeSync, readdirSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as vscode from 'vscode';
import { configOf, run } from './project';

let available: boolean | undefined;
export async function claudeAvailable(root: string) {
  if (available === undefined) available = (await run(root, 'claude', ['--version'])).ok;
  return available;
}

/** El encargo según el estado: refinar, arrancar, seguir, revisar o destrabar. */
export function promptFor(root: string, id: string, status: string): string {
  const cfg = configOf(root);
  const role = cfg.roleOf(status);
  const en = cfg.language === 'en';
  const prefix = cfg.claude?.mode === 'plugin' ? `/backlog-kit${en ? '-en' : ''}:` : '/';
  const skill = (es: string, enName: string) => `${prefix}${en ? enName : es}`;
  const reviewer = en ? 'criteria-reviewer' : 'revisor-criterios';
  switch (role) {
    case 'backlog':
    case 'refining':
      return `${skill('hu-refinar', 'story-refine')} ${id}`;
    case 'ready':
      return en
        ? `Start ${id}: run npm run pm:start -- ${id}, read the whole README and implement the plan task by task.`
        : `Arrancá ${id}: corré npm run pm:start -- ${id}, leé el README completo e implementá el plan tarea por tarea.`;
    case 'inProgress':
      return en ? `Continue ${id} from its progress log.` : `Seguí con ${id} desde su log de progreso.`;
    case 'review':
      return en
        ? `Use the ${reviewer} subagent on ${id} and tell me which criteria have evidence and what is missing.`
        : `Usá el subagente ${reviewer} sobre ${id} y decime qué criterios tienen evidencia y qué falta.`;
    case 'blocked':
      return en ? `${id} is blocked. Read its log and help me unblock it.` : `${id} está bloqueada. Leé su log y ayudame a destrabarla.`;
    default:
      return en ? `Summarize ${id} and what is left.` : `Resumime ${id} y qué queda.`;
  }
}

const shellQuote = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

export async function workWithClaude(root: string, id: string, status: string, prompt = promptFor(root, id, status)) {
  if (!(await claudeAvailable(root))) {
    const en = configOf(root).language === 'en';
    return vscode.window.showWarningMessage(en ? 'Claude Code (claude) is not installed in this environment.' : 'Claude Code (claude) no está instalado en este entorno.');
  }
  const term = vscode.window.createTerminal({ name: `Claude · ${id}`, cwd: root });
  term.show();
  term.sendText(`claude ${shellQuote(prompt)}`);
}

/** Último trozo de un archivo, para no leer transcripts enteros. */
function tail(file: string, bytes = 32_768) {
  const size = statSync(file).size;
  const fd = openSync(file, 'r');
  try {
    const buf = Buffer.alloc(Math.min(bytes, size));
    readSync(fd, buf, 0, buf.length, size - buf.length);
    return buf.toString('utf8');
  } finally {
    closeSync(fd);
  }
}

/** Rama → minutos desde la última actividad de una sesión de Claude Code en esa rama (≤ 15 min). */
export function claudeActivity(windowMin = 15): Map<string, number> {
  const out = new Map<string, number>();
  const base = path.join(os.homedir(), '.claude', 'projects');
  if (!existsSync(base)) return out;
  const now = Date.now();
  for (const dir of readdirSync(base)) {
    const abs = path.join(base, dir);
    let entries: string[] = [];
    try {
      entries = readdirSync(abs).filter((f) => f.endsWith('.jsonl'));
    } catch {
      continue;
    }
    for (const f of entries) {
      const file = path.join(abs, f);
      const mtime = statSync(file).mtimeMs;
      const ago = (now - mtime) / 60_000;
      if (ago > windowMin) continue;
      const lines = tail(file).split('\n').reverse();
      for (const l of lines) {
        const m = l.match(/"gitBranch":"([^"]+)"/);
        if (m) {
          const prev = out.get(m[1]);
          if (prev === undefined || ago < prev) out.set(m[1], Math.round(ago));
          break;
        }
      }
    }
  }
  return out;
}
