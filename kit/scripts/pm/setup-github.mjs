#!/usr/bin/env node
// Crea (idempotente) los labels y milestones que usa el espejo de .pm/ en GitHub o GitLab:
// estado, prioridad, tipo, campos con catálogo, épica, y un milestone "ENN — Nombre" por épica.
// Lo que ya existe no se toca (colores, descripciones, títulos de milestone), salvo con --actualizar.
import { createForge, epicLabelValue, labelFor } from '../lib/forge.mjs';
import { project } from '../lib/project.mjs';

const pm = project();
const { cfg, t } = pm;
const forge = createForge(pm.root, cfg);
const update = process.argv.includes('--actualizar') || process.argv.includes('--update');
const L = (prefix, value) => labelFor(cfg, prefix, value);

const ROLE_COLORS = {
  backlog: 'ededed',
  refining: 'fbca04',
  ready: '0e8a16',
  inProgress: '1d76db',
  review: '5319e7',
  done: '006b75',
  blocked: 'b60205',
  discarded: '6a737d',
};
const PRIORITY_COLORS = ['b60205', 'd93f0b', 'fbca04', 'c2e0c6'];

const epics = pm.loadEpics();
const wanted = [
  ...Object.entries(cfg.states).map(([role, s]) => ({ name: L(t.labelState, s), color: ROLE_COLORS[role], description: s })),
  ...cfg.priorities.map((p, i) => ({ name: L(t.labelPriority, p), color: PRIORITY_COLORS[i] ?? 'c2e0c6', description: p })),
  ...cfg.types.map((x) => ({ name: L(t.labelType, x), color: 'c5def5', description: x })),
  ...cfg.fields.filter((f) => f.values).flatMap((f) => f.values.map((x) => ({ name: L(f.key, x), color: 'bfd4f2', description: `${f.label}: ${x}` }))),
  ...epics.map((e) => ({ name: L(t.labelEpic, epicLabelValue(cfg, e)), color: '0052cc', description: `${e.id} — ${e.title}`.slice(0, 100) })),
];

try {
  const existing = new Map((await forge.labels()).map((l) => [l.name, l]));
  for (const l of wanted) {
    const cur = existing.get(l.name);
    if (!cur) {
      await forge.createLabel(l);
      console.log(`+ label ${l.name}`);
    } else if (update && (cur.color !== l.color || cur.description !== l.description)) {
      await forge.updateLabel(l.name, { color: l.color, description: l.description });
      console.log(`~ label ${l.name}`);
    }
  }

  // "E02 — Pagos", "E02 - Pagos" y "E02 – Pagos" son el mismo milestone: no se renombra por el guion.
  const sameTitle = (a, b) => a.replace(/\s[-–—]\s/, ' — ') === b.replace(/\s[-–—]\s/, ' — ');
  const milestones = await forge.milestones();
  for (const e of epics) {
    const title = `${e.id} — ${e.title}`;
    const cur = milestones.find((m) => m.title.startsWith(`${e.id} `));
    const description = t.epicMilestone(e.id, e.folder);
    if (!cur) {
      await forge.createMilestone({ title, description });
      console.log(`+ milestone ${title}`);
    } else if (update && !sameTitle(cur.title, title)) {
      await forge.updateMilestone(cur.id, { title, description });
      console.log(`~ milestone ${title}`);
    }
  }
  console.log(t.labelsDone);
} catch (err) {
  console.error(`✗ ${err.message}`);
  process.exit(1);
}
