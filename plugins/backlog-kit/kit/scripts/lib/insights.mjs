// Cálculos sobre el backlog que comparten scripts, tablero y hooks de Claude: la historia de una
// rama, qué la bloquea, qué conviene tomar después y cuánto tarda cada estado. Solo lectura.
import { execFileSync } from 'node:child_process';
import { section } from './pm.mjs';

export function currentBranch(root) {
  try {
    return execFileSync('git', ['branch', '--show-current'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

/** La historia de la rama: por el campo de rama, o por el prefijo `<id>-` del nombre. */
export function storyOfBranch(pm, branch) {
  if (!branch) return null;
  const views = pm.loadStories().filter((s) => s.data).map((s) => ({ s, v: pm.view(s) }));
  const byField = views.find((x) => x.v.branch === branch);
  if (byField) return byField;
  const m = branch.match(new RegExp(`^${pm.cfg.storyPrefix.toLowerCase()}-(\\d+)`, 'i'));
  if (!m) return null;
  const id = pm.cfg.formatId(Number(m[1]));
  return views.find((x) => x.v.id === id) ?? null;
}

/** Estados que cuentan como "resuelta" para quien depende: hecha o ya en review. */
export function resolvedStates(cfg) {
  return [cfg.states.done, cfg.states.review];
}

/** Para cada historia: dependencias pendientes y quién depende de ella. */
export function dependencyIndex(views, cfg) {
  const byId = new Map(views.map((v) => [v.id, v]));
  const resolved = new Set(resolvedStates(cfg));
  const dependents = new Map(views.map((v) => [v.id, []]));
  for (const v of views) for (const d of v.dependencies) dependents.get(d)?.push(v.id);
  const pending = new Map(
    views.map((v) => [v.id, v.dependencies.filter((d) => !byId.has(d) || !resolved.has(byId.get(d).status))]),
  );
  // Cuántas historias destraba, contando las transitivas.
  const unlocks = new Map();
  const count = (id, seen = new Set()) => {
    for (const d of dependents.get(id) ?? []) {
      if (seen.has(d)) continue;
      seen.add(d);
      count(d, seen);
    }
    return seen;
  };
  for (const v of views) unlocks.set(v.id, count(v.id).size);
  return { byId, dependents, pending, unlocks };
}

/** El motivo del bloqueo: la última nota de la transición a bloqueada en el log. */
export function blockedReason(story, cfg) {
  const log = section(story.body, cfg.sections.log).split('\n');
  const blocked = cfg.states.blocked;
  for (let i = log.length - 1; i >= 0; i--) {
    const m = log[i].match(new RegExp(`^- \\d{4}-\\d\\d-\\d\\d — (.*)\\(\\S+ → ${blocked}\\)\\s*$`));
    if (m) return m[1].replace(/^[^.]*\.\s*/, '').trim() || m[1].trim();
  }
  return null;
}

/**
 * Qué tomar después: lo que está en review primero (necesita al usuario), después lo listo sin
 * dependencias pendientes, ordenado por cuánto destraba, prioridad y etapa.
 */
export function suggestNext(pm) {
  const { cfg } = pm;
  const S = cfg.states;
  const views = pm.loadStories().filter((s) => s.data).map((s) => pm.view(s));
  const idx = dependencyIndex(views, cfg);
  const prio = (p) => (cfg.priorities.indexOf(p) < 0 ? 99 : cfg.priorities.indexOf(p));
  const stageField = cfg.fields.find((f) => f.range);
  const stage = (v) => (stageField ? (v.extra[stageField.key] ?? 99) : 0);
  const review = views.filter((v) => v.status === S.review).map((v) => ({ ...v, reason: 'review' }));
  const ready = views
    .filter((v) => v.status === S.ready)
    .map((v) => ({ ...v, pending: idx.pending.get(v.id), unlocks: idx.unlocks.get(v.id) }));
  const free = ready
    .filter((v) => !v.pending.length)
    .sort((a, b) => stage(a) - stage(b) || b.unlocks - a.unlocks || prio(a.priority) - prio(b.priority) || a.id.localeCompare(b.id))
    .map((v) => ({ ...v, reason: 'ready' }));
  const waiting = ready.filter((v) => v.pending.length).map((v) => ({ ...v, reason: 'waiting' }));
  return { review, free, waiting };
}

const DAY = 86_400_000;
const days = (a, b) => Math.max(0, Math.round((Date.parse(b) - Date.parse(a)) / DAY));

/** Transiciones del log: `- 2026-11-12 — … (A → B)`. */
export function transitions(story) {
  const out = [];
  for (const line of story.body.split('\n')) {
    const m = line.match(/^- (\d{4}-\d\d-\d\d) — .*\((\S+) → (\S+)\)\s*$/);
    if (m) out.push({ date: m[1], from: m[2], to: m[3] });
  }
  return out;
}

function isoWeek(date) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d - yearStart) / DAY + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** Días promedio en cada estado, historias cerradas por semana y antigüedad en el estado actual. */
export function stats(pm, today = new Date().toISOString().slice(0, 10)) {
  const { cfg } = pm;
  const spent = Object.fromEntries(cfg.stateList.map((s) => [s, []]));
  const weekly = new Map();
  const aging = [];
  for (const s of pm.loadStories().filter((x) => x.data)) {
    const v = pm.view(s);
    const tr = transitions(s);
    for (let i = 0; i < tr.length; i++) {
      const until = tr[i + 1]?.date ?? (v.status === tr[i].to ? today : null);
      if (until && spent[tr[i].to]) spent[tr[i].to].push(days(tr[i].date, until));
      if (tr[i].to === cfg.states.done) weekly.set(isoWeek(tr[i].date), (weekly.get(isoWeek(tr[i].date)) ?? 0) + 1);
    }
    const last = tr.at(-1);
    if (last && last.to === v.status && ![cfg.states.done, cfg.states.discarded].includes(v.status))
      aging.push({ id: v.id, title: v.title, status: v.status, days: days(last.date, today) });
  }
  const avg = (xs) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);
  return {
    perState: Object.fromEntries(Object.entries(spent).map(([k, xs]) => [k, { avgDays: avg(xs), samples: xs.length }])),
    doneByWeek: [...weekly.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([week, count]) => ({ week, count })),
    aging: aging.sort((a, b) => b.days - a.days),
  };
}
