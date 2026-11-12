#!/usr/bin/env node
// Espeja una historia en su issue de GitHub. El README manda; el issue es la vista del equipo.
//
//   npm run pm:sync -- <ID>            crea o actualiza el issue
//   npm run pm:sync -- <ID> --dry-run  muestra lo que mandaría
//   npm run pm:sync -- --todas         todas las que no están en el backlog (--all)
//
// - Título "[<ID>] nombre", labels completos en un solo PATCH, milestone de la épica buscado por
//   título (nunca por número). Los casos de prueba van como checklist y se conserva lo tildado.
// - Si el README ya tiene issue, verifica que el título sea de esta historia antes de escribir.
import { readFileSync, writeFileSync } from 'node:fs';
import { createGh } from '../lib/gh.mjs';
import { parseFrontmatter, section, setFields } from '../lib/pm.mjs';
import { isMain, project } from '../lib/project.mjs';
import { backlogFile, renderBacklog } from './backlog.mjs';

export function labelsFor(pm, story) {
  const { cfg, t } = pm;
  const v = pm.view(story);
  return [
    `${t.labelState}:${v.status}`,
    `${t.labelEpic}:${v.epic}`,
    v.priority && `${t.labelPriority}:${v.priority}`,
    v.type && `${t.labelType}:${v.type}`,
    ...cfg.fields.filter((f) => f.values && v.extra[f.key]).map((f) => `${f.key}:${v.extra[f.key]}`),
  ].filter(Boolean);
}

/** Filas de la tabla de casos de prueba → [{ n, text }]. Ignora la fila de ejemplo de la plantilla. */
export function testCases(body, title) {
  return section(body, title)
    .split('\n')
    .filter((l) => /^\|\s*\d+\s*\|/.test(l))
    .map((l) => l.split('|').slice(1, -1).map((c) => c.trim()))
    .filter(([, scenario]) => scenario && scenario !== '…')
    .map(([n, scenario, , expected]) => ({ n, text: `${scenario} → ${expected}` }));
}

export function renderBody(pm, gh, story, previousBody = '') {
  const { cfg, t } = pm;
  const checked = new Set([...previousBody.matchAll(/^- \[x\] #(\d+)/gim)].map((m) => m[1]));
  const v = pm.view(story);
  const cases = testCases(story.body, cfg.sections.tests);
  const extra = cfg.fields.map((f) => `**${f.label}:** ${[v.extra[f.key]].flat().filter((x) => x !== null).join(', ') || '—'}`);
  return [
    `<!-- backlog-kit:story ${v.id} — ${t.issueBodyNote} -->`,
    [`**README:** [${pm.rel(story.file)}](${gh.blobUrl(pm.rel(story.file))})`, ...extra].join(' · '),
    '',
    section(story.body, cfg.sections.story),
    '',
    `### ${cfg.sections.criteria}`,
    section(story.body, cfg.sections.criteria)
      // Solo lectura en el issue: los tilda el README. Los checkboxes son para QA manual.
      .replace(/^- \[x\] /gim, '- ✅ ')
      .replace(/^- \[ \] /gm, '- ⬜ ') || t.criteriaLater,
    '',
    `### ${t.manualQa}`,
    cases.length ? cases.map((c) => `- [${checked.has(c.n) ? 'x' : ' '}] #${c.n} ${c.text}`).join('\n') : t.noCases,
  ].join('\n');
}

export function syncOne(pm, id, { force = false, dry = false } = {}) {
  const { cfg, t } = pm;
  const K = cfg.keys;
  const S = cfg.states;
  const gh = createGh(pm.root, cfg);
  const story = pm.findStory(id);
  const v = pm.view(story);
  if (v.status === S.backlog && !v.issue && !force) {
    console.log(t.syncBacklog(v.id));
    return null;
  }
  const milestone = gh.list('repos/{repo}/milestones?state=all').find((m) => m.title.startsWith(`${v.epic} `));
  if (!milestone) throw new Error(t.noMilestone(v.epic));
  const closed = [S.done, S.discarded].includes(v.status);
  const payload = {
    title: `[${v.id}] ${v.title}`,
    labels: labelsFor(pm, story),
    milestone: milestone.number,
    state: closed ? 'closed' : 'open',
    ...(closed ? { state_reason: v.status === S.done ? 'completed' : 'not_planned' } : {}),
  };

  if (v.issue) {
    const current = gh.api('GET', `repos/{repo}/issues/${v.issue}`);
    if (!current.title.startsWith(`[${v.id}]`)) throw new Error(t.issueMismatch(pm.rel(story.file), v.issue, current.title));
    payload.body = renderBody(pm, gh, story, current.body ?? '');
    if (dry) return console.log(JSON.stringify(payload, null, 2));
    gh.api('PATCH', `repos/{repo}/issues/${v.issue}`, payload);
    console.log(t.synced(v.id, gh.issueUrl(v.issue), v.status));
    return v.issue;
  }

  payload.body = renderBody(pm, gh, story);
  if (dry) return console.log(JSON.stringify(payload, null, 2));
  const { state, state_reason, ...create } = payload;
  const created = gh.api('POST', 'repos/{repo}/issues', create);
  setFields(story.file, { [K.issue]: created.number });
  // El backlog muestra el issue: regenerarlo acá, porque un script no dispara el hook.
  writeFileSync(backlogFile(pm), renderBacklog(pm, t));
  if (state === 'closed') gh.api('PATCH', `repos/{repo}/issues/${created.number}`, { state, state_reason });
  parseFrontmatter(readFileSync(story.file, 'utf8'));
  console.log(t.created(v.id, gh.issueUrl(created.number), created.number));
  return created.number;
}

if (isMain(import.meta.url)) {
  const pm = project();
  const args = process.argv.slice(2);
  const flags = new Set(args.filter((a) => a.startsWith('--')));
  try {
    const all = flags.has('--todas') || flags.has('--all');
    const targets = all
      ? pm.loadStories().filter((s) => s.data).map((s) => pm.view(s)).filter((v) => v.status !== pm.cfg.states.backlog || v.issue).map((v) => v.id)
      : args.filter((a) => !a.startsWith('--'));
    if (!targets.length) throw new Error(pm.t.syncUsage);
    for (const id of targets)
      syncOne(pm, id, { force: flags.has('--forzar') || flags.has('--force'), dry: flags.has('--dry-run') });
  } catch (err) {
    console.error(`✗ ${err.message}`);
    process.exit(1);
  }
}
