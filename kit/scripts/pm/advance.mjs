#!/usr/bin/env node
// Cambia el estado de una historia en un solo paso: frontmatter, log, backlog e issue.
//
//   npm run pm:advance -- HU-004 EN_CURSO
//   npm run pm:advance -- HU-004 BLOQUEADO --nota "falta la API key (depende de: Juan)"
//   npm run pm:advance -- HU-004 EN_REVIEW --sin-github
//
// Reglas: valida la transición; en curso fija la rama <id>-slug; review exige criterios tildados
// (salvo --forzar); bloqueada exige --nota. Lo usan los skills y el tablero de VS Code.
import { readFileSync, writeFileSync } from 'node:fs';
import { appendToSection, checklist, parseFrontmatter, setFields, today } from '../lib/pm.mjs';
import { githubOff, project } from '../lib/project.mjs';
import { backlogFile, renderBacklog } from './backlog.mjs';

const args = process.argv.slice(2);
const flag = (...n) => n.some((x) => args.includes(x));
const value = (...n) => {
  const i = args.findIndex((a) => n.includes(a));
  return i >= 0 ? args[i + 1] : undefined;
};
const NOTE = ['--nota', '--note'];
const [id, target] = args.filter((a, i) => !a.startsWith('--') && !NOTE.includes(args[i - 1]));

const pm = project();
const { cfg, t } = pm;
const K = cfg.keys;

try {
  if (!id || !target) throw new Error(t.advanceUsage);
  const story = pm.findStory(id);
  const sid = story.data[K.id];
  const from = story.data[K.status];
  if (!cfg.transitions[from]?.includes(target))
    throw new Error(t.badTransition(sid, from, target, (cfg.transitions[from] ?? []).join(', ')));
  const role = cfg.roleOf(target);
  const note = value(...NOTE);
  if (role === 'blocked' && !note) throw new Error(t.needNote(target));
  if (role === 'review' && !flag('--forzar', '--force')) {
    const { pending } = checklist(story.body, cfg.sections.criteria);
    if (pending.length) throw new Error(`${t.pendingCriteria(sid, pending.length)}\n${pending.join('\n')}`);
  }

  const fields = { [K.status]: target, [K.updated]: today() };
  if (role === 'inProgress' && !story.data[K.branch]) fields[K.branch] = story.folder.toLowerCase();
  setFields(story.file, fields);
  appendToSection(story.file, cfg.sections.log, `- ${today()} — ${t.log[role]}${note ? ` ${note}` : ''} (${from} → ${target})`);
  writeFileSync(backlogFile(pm), renderBacklog(pm, t));
  console.log(t.moved(sid, from, target, pm.rel(story.file)));

  if (!githubOff(args, cfg)) {
    // Import dinámico: sin GitHub, el init no instala sync-issue.mjs.
    const { syncOne } = await import('./sync-issue.mjs');
    const { createGh } = await import('../lib/gh.mjs');
    const n = syncOne(pm, sid);
    const updated = parseFrontmatter(readFileSync(story.file, 'utf8')).data;
    if (n && updated[K.issue]) {
      createGh(pm.root, cfg).api('POST', `repos/{repo}/issues/${updated[K.issue]}/comments`, {
        body: `${t.stateComment(from, target)}\n\n${t.log[role]}${note ? `\n\n${note}` : ''}`,
      });
    }
  }
  if (fields[K.branch]) console.log(t.branchHint(fields[K.branch], cfg.mainBranch));
} catch (err) {
  console.error(`✗ ${err.message}`);
  process.exit(1);
}
