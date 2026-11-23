#!/usr/bin/env node
// Resuelve el issue de una historia a partir del README y lo verifica contra GitHub o GitLab.
//
//   npm run pm:issue -- HU-004           imprime el número, o falla explicando por qué
//   npm run pm:issue -- HU-004 --json    número, título, estado, url, labels, README
//   npm run pm:issue -- --verificar      audita todas: huérfanas, cruzadas y sin reclamar (--verify)
//
// El id de la historia no es el número del issue: nunca se deduce uno del otro.
import { createForge, labelFor } from '../lib/forge.mjs';
import { project } from '../lib/project.mjs';

const args = process.argv.slice(2);
const pm = project();
const { cfg, t } = pm;
const forge = createForge(pm.root, cfg);
const issueRe = new RegExp(`^\\[(${cfg.idPattern})\\]`);

async function resolve(id) {
  const story = pm.findStory(id);
  const v = pm.view(story);
  if (!v.issue) throw new Error(t.noIssue(v.id, pm.rel(story.file)));
  const issue = await forge.getIssue(v.issue);
  if (!issue.title.startsWith(`[${v.id}]`)) throw new Error(t.pointsTo(pm.rel(story.file), v.issue, issue.title));
  return { story, v, issue };
}

async function verifyAll() {
  const problems = [];
  const issues = (await forge.issues()).map((i) => ({ ...i, story: i.title.match(issueRe)?.[1] ?? null }));
  const byNumber = new Map(issues.map((i) => [i.number, i]));
  const claimed = new Set();
  for (const v of pm.loadStories().filter((s) => s.data).map((s) => pm.view(s))) {
    if (!v.issue) {
      if (v.status !== cfg.states.backlog) problems.push(t.storyNoIssue(v.id, v.status));
      continue;
    }
    claimed.add(v.issue);
    const i = byNumber.get(v.issue);
    const label = labelFor(cfg, t.labelState, v.status);
    if (!i) problems.push(t.issueGone(v.id, v.issue));
    else if (i.story !== v.id) problems.push(t.crossed(v.id, v.issue, i.title));
    else if (!i.labels.includes(label)) problems.push(t.unsynced(v.issue, label, v.id));
  }
  for (const i of issues) if (i.story && !claimed.has(i.number)) problems.push(t.orphan(i.number, i.title));
  if (problems.length) {
    console.error(t.problems(problems.length));
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(t.coherent(claimed.size));
}

try {
  if (args.includes('--verificar') || args.includes('--verify')) await verifyAll();
  else {
    const id = args.find((a) => !a.startsWith('--'));
    if (!id) throw new Error(t.issueUsage);
    const { story, v, issue } = await resolve(id);
    if (args.includes('--json'))
      console.log(
        JSON.stringify(
          {
            id: v.id,
            issue: issue.number,
            title: issue.title,
            state: issue.state,
            url: forge.issueUrl(issue.number),
            labels: issue.labels,
            readme: pm.rel(story.file),
          },
          null,
          2,
        ),
      );
    else console.log(issue.number);
  }
} catch (err) {
  console.error(`✗ ${err.message}`);
  process.exit(1);
}
