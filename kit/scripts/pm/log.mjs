#!/usr/bin/env node
// Agrega una entrada al log de progreso de una historia y la comenta en su issue.
//   npm run pm:log -- HU-004 "Renderiza el tablero; falta el filtro. Test: board.test.mjs"
import { createForge } from '../lib/forge.mjs';
import { appendToSection, setFields, today } from '../lib/pm.mjs';
import { githubOff, project } from '../lib/project.mjs';

const args = process.argv.slice(2);
const [id, ...rest] = args.filter((a) => !a.startsWith('--'));
const text = rest.join(' ').trim();
const pm = project();
const { cfg, t } = pm;
const K = cfg.keys;

try {
  if (!id || !text) throw new Error(t.logUsage);
  const story = pm.findStory(id);
  appendToSection(story.file, cfg.sections.log, `- ${today()} — ${text}`);
  setFields(story.file, { [K.updated]: today() });
  console.log(t.logged(pm.rel(story.file)));
  const n = story.data[K.issue];
  if (!githubOff(args, cfg) && n) {
    const forge = createForge(pm.root, cfg);
    const issue = await forge.getIssue(n);
    if (!issue.title.startsWith(`[${story.data[K.id]}]`)) throw new Error(t.notThisIssue(n, story.data[K.id], issue.title));
    await forge.comment(n, `${t.progress(today())}\n\n${text}`);
    console.log(t.commented(n));
  }
} catch (err) {
  console.error(`✗ ${err.message}`);
  process.exit(1);
}
