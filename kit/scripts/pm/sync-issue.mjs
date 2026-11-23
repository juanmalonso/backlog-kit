#!/usr/bin/env node
// Espeja una historia en su issue de GitHub o GitLab. El README manda; el issue es la vista del equipo.
//
//   npm run pm:sync -- <ID>            crea o actualiza el issue
//   npm run pm:sync -- <ID> --dry-run  muestra lo que mandaría
//   npm run pm:sync -- --todas         todas las que no están en el backlog (--all)
//
// - Título "[<ID>] nombre", labels completos en un solo PATCH, milestone de la épica buscado por
//   título (nunca por número). Los casos de prueba van como checklist y se conserva lo tildado.
// - Si el README ya tiene issue, verifica que el título sea de esta historia antes de escribir.
// - Los labels que no son del kit (otros prefijos) se conservan.
// - La descripción de un issue que no generó el kit (sin su marca) no se pisa, salvo con --cuerpo.
import { writeFileSync } from 'node:fs';
import { createForge, epicLabelValue, labelFor } from '../lib/forge.mjs';
import { section, setFields } from '../lib/pm.mjs';
import { isMain, project } from '../lib/project.mjs';
import { backlogFile, renderBacklog } from './backlog.mjs';

/** Prefijos de los labels que maneja el kit: los demás labels de un issue no se tocan. */
export function managedPrefixes(pm) {
  const { cfg, t } = pm;
  return [t.labelState, t.labelEpic, t.labelPriority, t.labelType, ...cfg.fields.filter((f) => f.values).map((f) => f.key)].map((p) => labelFor(cfg, p, ''));
}

export function labelsFor(pm, story) {
  const { cfg, t } = pm;
  const v = pm.view(story);
  return [
    labelFor(cfg, t.labelState, v.status),
    labelFor(cfg, t.labelEpic, epicLabelValue(cfg, story.epic)),
    v.priority && labelFor(cfg, t.labelPriority, v.priority),
    v.type && labelFor(cfg, t.labelType, v.type),
    ...cfg.fields.filter((f) => f.values && v.extra[f.key]).map((f) => labelFor(cfg, f.key, v.extra[f.key])),
  ].filter(Boolean);
}

/** Labels del kit nuevos + los ajenos que ya tenía el issue. */
export function mergeLabels(pm, current, wanted) {
  const managed = managedPrefixes(pm);
  return [...new Set([...current.filter((l) => !managed.some((p) => l.startsWith(p))), ...wanted])];
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

export const BODY_MARK = '<!-- backlog-kit:story ';

export function renderBody(pm, forge, story, previousBody = '') {
  const { cfg, t } = pm;
  const checked = new Set([...previousBody.matchAll(/^- \[x\] #(\d+)/gim)].map((m) => m[1]));
  const v = pm.view(story);
  const cases = testCases(story.body, cfg.sections.tests);
  const extra = cfg.fields.map((f) => `**${f.label}:** ${[v.extra[f.key]].flat().filter((x) => x !== null).join(', ') || '—'}`);
  return [
    `${BODY_MARK}${v.id} — ${t.issueBodyNote} -->`,
    [`**README:** [${pm.rel(story.file)}](${forge.blobUrl(pm.rel(story.file))})`, ...extra].join(' · '),
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

export async function syncOne(pm, id, { force = false, dry = false, body: forceBody = false, forge = createForge(pm.root, pm.cfg) } = {}) {
  const { cfg, t } = pm;
  const K = cfg.keys;
  const S = cfg.states;
  const story = pm.findStory(id);
  const v = pm.view(story);
  if (v.status === S.backlog && !v.issue && !force) {
    console.log(t.syncBacklog(v.id));
    return null;
  }
  const milestone = (await forge.milestones()).find((m) => m.title.startsWith(`${v.epic} `));
  if (!milestone) throw new Error(t.noMilestone(v.epic));
  const closed = [S.done, S.discarded].includes(v.status);
  const reason = v.status === S.done ? 'done' : 'discarded';
  const wanted = labelsFor(pm, story);

  if (v.issue) {
    const current = await forge.getIssue(v.issue);
    if (!current.title.startsWith(`[${v.id}]`)) throw new Error(t.issueMismatch(pm.rel(story.file), v.issue, current.title));
    const ours = !current.body.trim() || current.body.startsWith(BODY_MARK);
    const payload = {
      title: `[${v.id}] ${v.title}`,
      labels: mergeLabels(pm, current.labels, wanted),
      milestone,
      ...(ours || forceBody ? { body: renderBody(pm, forge, story, current.body) } : {}),
      ...(closed !== (current.state === 'closed') ? { state: closed ? 'closed' : 'open', reason } : {}),
    };
    if (dry) return console.log(JSON.stringify({ issue: v.issue, ...payload, milestone: milestone.title }, null, 2));
    await forge.updateIssue(v.issue, payload);
    console.log(t.synced(v.id, forge.issueUrl(v.issue), v.status));
    if (!payload.body) console.log(t.bodyKept(v.issue));
    return v.issue;
  }

  const payload = { title: `[${v.id}] ${v.title}`, labels: wanted, milestone, body: renderBody(pm, forge, story) };
  if (dry) return console.log(JSON.stringify({ ...payload, milestone: milestone.title }, null, 2));
  const created = await forge.createIssue(payload);
  setFields(story.file, { [K.issue]: created.number });
  // El backlog muestra el issue: regenerarlo acá, porque un script no dispara el hook.
  writeFileSync(backlogFile(pm), renderBacklog(pm, t));
  if (closed) await forge.updateIssue(created.number, { state: 'closed', reason });
  console.log(t.created(v.id, forge.issueUrl(created.number), created.number));
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
    const forge = createForge(pm.root, pm.cfg);
    for (const id of targets)
      await syncOne(pm, id, {
        forge,
        force: flags.has('--forzar') || flags.has('--force'),
        dry: flags.has('--dry-run'),
        body: flags.has('--cuerpo') || flags.has('--body'),
      });
  } catch (err) {
    console.error(`✗ ${err.message}`);
    process.exit(1);
  }
}
