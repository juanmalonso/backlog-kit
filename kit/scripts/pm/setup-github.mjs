#!/usr/bin/env node
// Crea o actualiza (idempotente) los labels y milestones que usa el espejo de .pm/ en GitHub:
// estado, prioridad, tipo, campos con catálogo, épica, y un milestone "ENN — Nombre" por épica.
import { createGh } from '../lib/gh.mjs';
import { project } from '../lib/project.mjs';

const pm = project();
const { cfg, t } = pm;
const gh = createGh(pm.root, cfg);

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
  ...Object.entries(cfg.states).map(([role, s]) => ({ name: `${t.labelState}:${s}`, color: ROLE_COLORS[role], description: s })),
  ...cfg.priorities.map((p, i) => ({ name: `${t.labelPriority}:${p}`, color: PRIORITY_COLORS[i] ?? 'c2e0c6', description: p })),
  ...cfg.types.map((x) => ({ name: `${t.labelType}:${x}`, color: 'c5def5', description: x })),
  ...cfg.fields.filter((f) => f.values).flatMap((f) => f.values.map((x) => ({ name: `${f.key}:${x}`, color: 'bfd4f2', description: `${f.label}: ${x}` }))),
  ...epics.map((e) => ({ name: `${t.labelEpic}:${e.id}`, color: '0052cc', description: `${e.id} — ${e.title}`.slice(0, 100) })),
];

const existing = new Map(gh.list('repos/{repo}/labels').map((l) => [l.name, l]));
for (const l of wanted) {
  const cur = existing.get(l.name);
  if (!cur) {
    gh.api('POST', 'repos/{repo}/labels', l);
    console.log(`+ label ${l.name}`);
  } else if (cur.color !== l.color || cur.description !== l.description) {
    gh.api('PATCH', `repos/{repo}/labels/${encodeURIComponent(l.name)}`, { color: l.color, description: l.description });
    console.log(`~ label ${l.name}`);
  }
}

const milestones = gh.list('repos/{repo}/milestones?state=all');
for (const e of epics) {
  const title = `${e.id} — ${e.title}`;
  const cur = milestones.find((m) => m.title.startsWith(`${e.id} `));
  const description = t.epicMilestone(e.id, e.folder);
  if (!cur) {
    gh.api('POST', 'repos/{repo}/milestones', { title, description });
    console.log(`+ milestone ${title}`);
  } else if (cur.title !== title) {
    gh.api('PATCH', `repos/{repo}/milestones/${cur.number}`, { title, description });
    console.log(`~ milestone ${title}`);
  }
}
console.log(t.labelsDone);
