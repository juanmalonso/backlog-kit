#!/usr/bin/env node
// Resuelve el issue de una historia a partir del README y lo verifica contra GitHub.
//
//   npm run pm:issue -- HU-004           imprime el número, o falla explicando por qué
//   npm run pm:issue -- HU-004 --json    número, título, estado, url, labels, README
//   npm run pm:issue -- --verificar      audita todas: huérfanas, cruzadas y sin reclamar (--verify)
//
// El id de la historia no es el número del issue: nunca se deduce uno del otro.
import { createGh } from '../lib/gh.mjs';
import { project } from '../lib/project.mjs';

const args = process.argv.slice(2);
const pm = project();
const { cfg, t } = pm;
const gh = createGh(pm.root, cfg);

function resolve(id) {
  const story = pm.findStory(id);
  const v = pm.view(story);
  if (!v.issue) throw new Error(t.noIssue(v.id, pm.rel(story.file)));
  const issue = gh.api('GET', `repos/{repo}/issues/${v.issue}`);
  if (!issue.title.startsWith(`[${v.id}]`)) throw new Error(t.pointsTo(pm.rel(story.file), v.issue, issue.title));
  return { story, v, issue };
}

function verifyAll() {
  const problems = [];
  const issues = gh.storyIssues();
  const byNumber = new Map(issues.map((i) => [i.number, i]));
  const claimed = new Set();
  for (const v of pm.loadStories().filter((s) => s.data).map((s) => pm.view(s))) {
    if (!v.issue) {
      if (v.status !== cfg.states.backlog) problems.push(t.storyNoIssue(v.id, v.status));
      continue;
    }
    claimed.add(v.issue);
    const i = byNumber.get(v.issue);
    const label = `${t.labelState}:${v.status}`;
    if (!i) problems.push(t.issueGone(v.id, v.issue));
    else if (i.story !== v.id) problems.push(t.crossed(v.id, v.issue, i.title));
    else if (!i.labels.some((l) => l.name === label)) problems.push(t.unsynced(v.issue, label, v.id));
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
  if (args.includes('--verificar') || args.includes('--verify')) verifyAll();
  else {
    const id = args.find((a) => !a.startsWith('--'));
    if (!id) throw new Error(t.issueUsage);
    const { story, v, issue } = resolve(id);
    if (args.includes('--json'))
      console.log(
        JSON.stringify(
          {
            id: v.id,
            issue: issue.number,
            title: issue.title,
            state: issue.state,
            url: gh.issueUrl(issue.number),
            labels: issue.labels.map((l) => l.name),
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
