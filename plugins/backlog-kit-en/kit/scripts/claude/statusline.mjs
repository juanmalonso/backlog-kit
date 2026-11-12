#!/usr/bin/env node
// Línea de estado de Claude Code: la historia de la rama (HU-044 · EN_CURSO · 2/5) o el resumen
// del backlog. Lee el JSON que manda Claude Code por stdin.
import { createPm } from '../lib/pm.mjs';
import { currentBranch, storyOfBranch } from '../lib/insights.mjs';
import { projectRoot, readInput } from './common.mjs';

const input = await readInput();
const root = projectRoot({ cwd: input.workspace?.current_dir ?? input.cwd });
if (!root) process.exit(0);
try {
  const pm = createPm(root);
  const { cfg } = pm;
  const branch = currentBranch(root);
  const hit = storyOfBranch(pm, branch);
  if (hit) {
    const { v } = hit;
    process.stdout.write(`${v.id} · ${v.status} · ${v.criteria.done}/${v.criteria.total}  ${v.title.length > 40 ? `${v.title.slice(0, 39)}…` : v.title}`);
  } else {
    const views = pm.loadStories().filter((x) => x.data).map((x) => pm.view(x));
    const n = (st) => views.filter((v) => v.status === st).length;
    process.stdout.write(`${branch || '—'} · ${cfg.states.inProgress} ${n(cfg.states.inProgress)} · ${cfg.states.review} ${n(cfg.states.review)} · ${cfg.states.ready} ${n(cfg.states.ready)}`);
  }
} catch {
  // la línea de estado nunca muestra errores
}
