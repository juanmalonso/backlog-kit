#!/usr/bin/env node
// Abre el PR (GitHub) o MR (GitLab) de una historia con título y cuerpo armados desde su README:
// historia, criterios, último log y "Closes #<issue>". Por defecto, la historia de la rama actual.
// Si ya hay uno abierto, lo muestra.
//   npm run pm:pr [-- HU-012] [-- --draft]
import { execFileSync } from 'node:child_process';
import { createForge } from '../lib/forge.mjs';
import { section } from '../lib/pm.mjs';
import { currentBranch, storyOfBranch } from '../lib/insights.mjs';
import { isMain, project } from '../lib/project.mjs';

export function prBody(pm, story) {
  const { cfg, t } = pm;
  const v = pm.view(story);
  const log = section(story.body, cfg.sections.log).split('\n').filter((l) => l.startsWith('- ')).slice(-3);
  return [
    `## ${t.pr.summary}`,
    '',
    section(story.body, cfg.sections.story),
    '',
    `## ${cfg.sections.criteria}`,
    '',
    section(story.body, cfg.sections.criteria).split('\n').filter((l) => /^\s*- \[[ x]\]/i.test(l)).join('\n') || '—',
    '',
    `## ${t.pr.verified}`,
    '',
    log.join('\n') || '—',
    '',
    `README: \`${pm.rel(story.file)}\``,
    ...(v.issue ? ['', `Closes #${v.issue}`] : []),
  ].join('\n');
}

async function main() {
  const args = process.argv.slice(2);
  const pm = project();
  const { cfg, t } = pm;
  const sh = (cmd, a, input) => execFileSync(cmd, a, { cwd: pm.root, encoding: 'utf8', input, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  const id = args.find((a) => !a.startsWith('--'));
  const branch = currentBranch(pm.root);
  const story = id ? pm.findStory(id) : storyOfBranch(pm, branch)?.s;
  if (!story) throw new Error(t.prNoStory(branch));
  const v = pm.view(story);
  if (!v.branch) throw new Error(t.prNoBranch(v.id));
  if (branch !== v.branch) throw new Error(t.prWrongBranch(v.id, v.branch, branch));
  if (v.status !== cfg.states.review && !args.some((a) => a === '--forzar' || a === '--force'))
    throw new Error(t.prNotReview(v.id, v.status, cfg.states.review));
  const forge = createForge(pm.root, cfg);
  const open = await forge.findChange(v.branch);
  if (open?.url) {
    console.log(t.prExists(open.url));
    return;
  }
  sh('git', ['push', '-u', 'origin', v.branch]);
  const url = await forge.createChange({
    head: v.branch,
    base: cfg.mainBranch,
    title: `[${v.id}] ${v.title}`,
    body: prBody(pm, story),
    draft: args.includes('--draft'),
  });
  console.log(t.prCreated(url));
}

if (isMain(import.meta.url)) {
  try {
    await main();
  } catch (err) {
    console.error(`✗ ${(err.stderr || err.message).toString().trim()}`);
    process.exit(1);
  }
}
