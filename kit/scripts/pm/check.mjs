#!/usr/bin/env node
// Guard de .pm/ (y de migraciones, si el config las declara). Corre en el hook de Claude Code, en
// CI y a mano. Sale con 1, o con 2 si se pasa --hook, para que el error vuelva al modelo.
//
// Revisa: ids duplicados, carpeta ≠ id, épica ≠ carpeta, valores fuera de catálogo, issue
// reclamado por dos historias, dependencias (inexistentes, ciclos, sin refinar), backlog al día.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { project } from '../lib/project.mjs';
import { backlogFile, renderBacklog } from './backlog.mjs';

const args = new Set(process.argv.slice(2));
const pm = project();
const { cfg, t } = pm;
const K = cfg.keys;
const S = cfg.states;
const errors = [];

function checkMigrations() {
  if (!cfg.migrations?.dir) return;
  const dir = path.join(pm.root, cfg.migrations.dir);
  if (!existsSync(dir)) return;
  const re = new RegExp(cfg.migrations.pattern ?? '^(\\d{4})_[a-z0-9_]+\\.sql$');
  const width = cfg.migrations.digits ?? 4;
  const seen = new Map();
  for (const f of readdirSync(dir).filter((x) => !x.startsWith('.'))) {
    const m = f.match(re);
    if (!m) {
      errors.push(t.migrationName(f));
      continue;
    }
    if (seen.has(m[1])) errors.push(t.migrationDup(f, m[1], seen.get(m[1])));
    seen.set(m[1], f);
  }
  [...seen.keys()]
    .map(Number)
    .sort((a, b) => a - b)
    .forEach((n, i) => {
      if (n !== i + 1) errors.push(t.migrationGap(String(i + 1).padStart(width, '0'), String(n).padStart(width, '0')));
    });
}

function checkField(where, d, f) {
  const v = d[f.key];
  if (v === undefined || v === null) return;
  if (f.values && !f.values.includes(v)) errors.push(`${where}: ${t.badValue(f.key, v, f.values.join(', '))}`);
  if (f.range && !(Number.isInteger(v) && v >= f.range[0] && v <= f.range[1]))
    errors.push(`${where}: ${t.badRange(f.key, v, f.range)}`);
  if (f.list && !Array.isArray(v)) errors.push(`${where}: ${t.badList(f.key)}`);
}

function checkPm() {
  for (const e of pm.loadEpics()) {
    if (e.error) errors.push(`${pm.rel(e.file)}: ${e.error}`);
    else if (!e.data) errors.push(`${pm.rel(e.file)}: ${t.epicNoReadme}`);
    else if (e.data[K.id] !== e.id) errors.push(`${pm.rel(e.file)}: ${t.epicIdMismatch(e.data[K.id], e.folder)}`);
  }
  const folderRe = new RegExp(`^(${cfg.storyPrefix}-\\d{${cfg.idDigits}})-[a-z0-9-]+$`);
  const byId = new Map();
  const byIssue = new Map();
  for (const s of pm.loadStories()) {
    const where = pm.rel(s.file);
    if (s.error) {
      errors.push(`${where}: ${s.error}`);
      continue;
    }
    const d = s.data;
    if (!d) {
      errors.push(`${where}: ${t.noFrontmatter}`);
      continue;
    }
    const folderId = s.folder.match(folderRe)?.[1];
    if (!folderId) errors.push(`${where}: ${t.badFolder(cfg.storyPrefix)}`);
    else if (d[K.id] !== folderId) errors.push(`${where}: ${t.idMismatch(d[K.id], folderId)}`);
    if (d[K.epic] !== s.epic.id) errors.push(`${where}: ${t.epicMismatch(d[K.epic], s.epic.folder)}`);
    if (!cfg.stateList.includes(d[K.status]))
      errors.push(`${where}: ${t.badValue(K.status, d[K.status], cfg.stateList.join(', '))}`);
    if (!cfg.priorities.includes(d[K.priority])) errors.push(`${where}: ${t.badValue(K.priority, d[K.priority])}`);
    if (d[K.type] && !cfg.types.includes(d[K.type])) errors.push(`${where}: ${t.badValue(K.type, d[K.type])}`);
    if (d[K.estimate] && !cfg.estimates.includes(d[K.estimate]))
      errors.push(`${where}: ${t.badValue(K.estimate, d[K.estimate])}`);
    for (const f of cfg.fields) checkField(where, d, f);
    if (!d[K.title]) errors.push(`${where}: ${t.missing(K.title)}`);
    if ([S.inProgress, S.review].includes(d[K.status]) && !d[K.branch])
      errors.push(`${where}: ${t.noBranch(d[K.status])}`);
    if (byId.has(d[K.id])) errors.push(t.duplicate(d[K.id], where, byId.get(d[K.id])));
    byId.set(d[K.id], where);
    if (d[K.issue]) {
      if (byIssue.has(d[K.issue])) errors.push(t.issueClaimed(d[K.issue], d[K.id], byIssue.get(d[K.issue])));
      byIssue.set(d[K.issue], d[K.id]);
    }
  }
}

// Dependencias: los ids que nombra la sección de dependencias de cada README.
function checkDependencies() {
  const NOT_READY = [S.backlog, S.refining, S.blocked, S.discarded];
  const ADVANCED = [S.ready, S.inProgress, S.review, S.done];
  const stageField = cfg.fields.find((f) => f.range);
  const views = pm.loadStories().filter((s) => s.data).map((s) => pm.view(s));
  const byId = new Map(views.map((v) => [v.id, v]));
  for (const v of views) {
    for (const d of v.dependencies) {
      const dep = byId.get(d);
      if (!dep) {
        errors.push(t.depMissing(v.id, d));
        continue;
      }
      if (ADVANCED.includes(v.status) && NOT_READY.includes(dep.status))
        errors.push(t.depNotReady(v.id, v.status, d, dep.status));
      if (stageField) {
        const own = v.extra[stageField.key];
        const theirs = dep.extra[stageField.key];
        if (Number.isInteger(own) && Number.isInteger(theirs) && theirs > own)
          errors.push(t.depStage(v.id, own, d, theirs, stageField.key));
      }
    }
  }
  const state = new Map();
  const visit = (id, trail) => {
    if (state.get(id) === 'done') return;
    if (state.get(id) === 'open') {
      errors.push(t.cycle([...trail.slice(trail.indexOf(id)), id].join(' → ')));
      return;
    }
    state.set(id, 'open');
    for (const d of byId.get(id)?.dependencies ?? []) if (byId.has(d)) visit(d, [...trail, id]);
    state.set(id, 'done');
  };
  for (const id of byId.keys()) visit(id, []);
}

checkMigrations();
if (!args.has('--solo-migraciones') && !args.has('--migrations-only')) {
  checkPm();
  checkDependencies();
  if (!errors.length) {
    const file = backlogFile(pm);
    const current = existsSync(file) ? readFileSync(file, 'utf8') : '';
    if (current !== renderBacklog(pm, t)) errors.push(t.backlogStale);
  }
}

if (errors.length) {
  console.error(t.guardTitle(errors.length));
  for (const e of errors) console.error(`  - ${e}`);
  console.error(t.guardFix);
  process.exit(args.has('--hook') ? 2 : 1);
}
if (!args.has('--quiet')) console.log(t.guardOk);
