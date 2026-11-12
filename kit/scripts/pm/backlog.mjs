#!/usr/bin/env node
// Genera .pm/backlog.md desde el frontmatter de cada historia. No se edita a mano: el estado de
// una historia vive en un solo lugar (su README) y este archivo es una vista.
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { isMain, project } from '../lib/project.mjs';

export const backlogFile = (pm) => path.join(pm.PM, 'backlog.md');

export function renderBacklog(pm, t) {
  const { cfg } = pm;
  const S = cfg.states;
  const stories = pm.loadStories().filter((s) => s.data).map((s) => ({ s, v: pm.view(s) }));
  const epics = pm.loadEpics();
  const prio = (p) => {
    const i = cfg.priorities.indexOf(p);
    return i < 0 ? 99 : i;
  };
  const stageField = cfg.fields.find((f) => f.range);
  const stage = (v) => (stageField ? (v.extra[stageField.key] ?? 99) : 0);
  const link = ({ s, v }) => `[${v.id}](${s.epic.folder}/${s.folder}/README.md)`;
  const issue = ({ v }) => (v.issue ? `#${v.issue}` : '—');
  const count = (list, st) => list.filter((x) => x.v.status === st).length;
  const out = [...t.backlogHeader];

  const active = stories.filter((x) => [S.inProgress, S.review, S.blocked].includes(x.v.status));
  out.push(`## ${t.active}`, '');
  if (!active.length) out.push(t.nothingActive, '');
  else {
    out.push(`| ${t.cols.id} | ${t.cols.status} | ${t.cols.title} | ${t.cols.branch} | ${t.cols.issue} |`, '|---|---|---|---|---|');
    for (const x of active)
      out.push(`| ${link(x)} | ${x.v.status} | ${x.v.title} | ${x.v.branch ?? '—'} | ${issue(x)} |`);
    out.push('');
  }

  const ready = stories
    .filter((x) => x.v.status === S.ready)
    .sort((a, b) => stage(a.v) - stage(b.v) || prio(a.v.priority) - prio(b.v.priority) || a.v.id.localeCompare(b.v.id));
  out.push(`## ${t.readyTitle}`, '');
  if (!ready.length) out.push(t.nothingReady, '');
  else {
    const st = stageField ? [stageField] : [];
    out.push(
      `| ${t.cols.id} | ${st.map((f) => `${f.label} | `).join('')}${t.cols.priority} | ${t.cols.title} | ${t.cols.estimate} |`,
      `|---|${st.map(() => '---|').join('')}---|---|---|`,
    );
    for (const x of ready)
      out.push(
        `| ${link(x)} | ${st.map((f) => `${x.v.extra[f.key] ?? '—'} | `).join('')}${x.v.priority ?? '—'} | ${x.v.title} | ${x.v.estimate ?? '—'} |`,
      );
    out.push('');
  }

  out.push(`## ${t.byEpic}`, '');
  out.push(`| ${t.epicCol} | ${cfg.stateList.map((s) => s.replace(/_/g, ' ')).join(' | ')} | ${t.total} |`);
  out.push(`|---|${cfg.stateList.map(() => '---:').join('|')}|---:|`);
  for (const e of epics) {
    const list = stories.filter((x) => x.s.epic.folder === e.folder);
    out.push(`| [${e.id} ${e.title}](${e.folder}/README.md) | ${cfg.stateList.map((st) => count(list, st) || '').join(' | ')} | ${list.length} |`);
  }
  out.push(`| **${t.total}** | ${cfg.stateList.map((st) => count(stories, st) || '').join(' | ')} | ${stories.length} |`, '');

  // Campos en la tabla por épica, en el orden del config; `"backlog": false` los oculta.
  const extra = cfg.fields.filter((f) => f.backlog !== false);
  const cell = (v, f) => {
    const x = v.extra[f.key];
    if (Array.isArray(x)) return x.join(', ') || '—';
    return x ?? '—';
  };
  for (const e of epics) {
    const list = stories.filter((x) => x.s.epic.folder === e.folder);
    out.push(`## ${e.id} — ${e.title}`, '');
    if (!list.length) {
      out.push(t.noStories, '');
      continue;
    }
    out.push(
      `| ${t.cols.id} | ${t.cols.title} | ${t.cols.status} | ${t.cols.priority} | ${extra.map((f) => f.label).join(' | ')}${extra.length ? ' | ' : ''}${t.cols.issue} |`,
      `|---|---|---|---|${extra.map(() => '---|').join('')}---|`,
    );
    for (const x of list)
      out.push(
        `| ${link(x)} | ${x.v.title} | ${x.v.status} | ${x.v.priority ?? '—'} | ${extra.map((f) => cell(x.v, f)).join(' | ')}${extra.length ? ' | ' : ''}${issue(x)} |`,
      );
    out.push('');
  }
  return out.join('\n');
}

if (isMain(import.meta.url)) {
  const pm = project();
  writeFileSync(backlogFile(pm), renderBacklog(pm, pm.t));
  if (!process.argv.includes('--quiet')) console.log(pm.t.backlogDone);
}
