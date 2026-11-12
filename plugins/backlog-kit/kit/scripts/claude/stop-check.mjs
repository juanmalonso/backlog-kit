#!/usr/bin/env node
// Hook Stop: en la rama de una historia en curso, si hubo cambios de código y no hay entrada de log
// de hoy, Claude sigue un paso más para registrar el avance (y revisar criterios si dijo que
// terminó). Una sola vez por sesión: nunca entra en bucle.
import { execFileSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createPm, section, today } from '../lib/pm.mjs';
import { currentBranch, storyOfBranch } from '../lib/insights.mjs';
import { projectRoot, readInput } from './common.mjs';

const input = await readInput();
if (input.stop_hook_active) process.exit(0);
const root = projectRoot(input);
if (!root) process.exit(0);
const marker = path.join(os.tmpdir(), `backlog-kit-stop-${String(input.session_id ?? 'x').replace(/[^\w-]/g, '')}`);
if (existsSync(marker)) process.exit(0);
try {
  const pm = createPm(root);
  const { cfg } = pm;
  if (cfg.claude?.stopReminder === false) process.exit(0);
  const hit = storyOfBranch(pm, currentBranch(root));
  if (!hit || hit.v.status !== cfg.states.inProgress) process.exit(0);
  const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  const dirty = git('status', '--porcelain').split('\n').filter((l) => l && !l.slice(3).startsWith('.pm/'));
  let committed = [];
  try {
    committed = git('log', '--since=midnight', '--format=%H', `origin/${cfg.mainBranch}..HEAD`).split('\n').filter(Boolean);
  } catch {
    // sin remoto: solo cuenta el working tree
  }
  if (!dirty.length && !committed.length) process.exit(0);
  const loggedToday = section(hit.s.body, cfg.sections.log).split('\n').some((l) => l.startsWith(`- ${today()} `));
  // Si Claude dice que terminó y quedan criterios sin tildar, el recordatorio aplica aunque haya log.
  const claimsDone = /\b(listo|terminad[oa]|termin[eé]|complet[oa]d?[oa]?|done|finished|completed)\b/i.test(String(input.last_assistant_message ?? ''));
  const pendingCriteria = hit.v.criteria.total > hit.v.criteria.done;
  if (loggedToday && !(claimsDone && pendingCriteria)) process.exit(0);
  writeFileSync(marker, '1');
  const en = cfg.language === 'en';
  const { v } = hit;
  const reason = en
    ? `backlog-kit: you changed code on ${v.id} and there is no progress log entry today. If this was a meaningful milestone, record it with \`npm run pm:log -- ${v.id} "<what changed, artifacts, what is left>"\` (or the story_log tool). If you consider the story finished, check each acceptance criterion against the diff (${v.criteria.done}/${v.criteria.total} ticked) before saying so. If neither applies, just finish.`
    : `backlog-kit: tocaste código en ${v.id} y no hay entrada de log de hoy. Si fue un hito, registralo con \`npm run pm:log -- ${v.id} "<qué cambió, artefactos, qué falta>"\` (o la tool story_log). Si considerás que la historia está terminada, verificá cada criterio contra el diff (${v.criteria.done}/${v.criteria.total} tildados) antes de decirlo. Si no aplica ninguna, terminá sin más.`;
  process.stdout.write(JSON.stringify({ decision: 'block', reason }));
} catch {
  // nunca frena el cierre por un error propio
}
