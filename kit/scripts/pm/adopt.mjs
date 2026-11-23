#!/usr/bin/env node
// Issues creados a mano en GitHub o GitLab → historias de .pm/. Lo usa la skill de adoptar issues.
//
//   npm run pm:adopt -- --listar [--json]   issues abiertos que ninguna historia reclama (--list)
//   npm run pm:adopt -- <issue> <ID>        con el README ya creado y `<issue key>: <issue>`: renombra
//                                           el issue a "[<ID>] nombre" y lo sincroniza (labels, milestone)
import { createForge } from '../lib/forge.mjs';
import { project } from '../lib/project.mjs';
import { syncOne } from './sync-issue.mjs';

const args = process.argv.slice(2);
const pm = project();
const { cfg } = pm;
const K = cfg.keys;
const en = cfg.language === 'en';
const forge = createForge(pm.root, cfg);
try {
  if (args.includes('--listar') || args.includes('--list')) {
    const claimed = new Set(pm.loadStories().filter((s) => s.data?.[K.issue]).map((s) => Number(s.data[K.issue])));
    const idRe = new RegExp(`^\\[${cfg.idPattern}\\]`);
    const open = (await forge.issues()).filter((i) => i.state === 'open' && !claimed.has(i.number) && !idRe.test(i.title));
    if (args.includes('--json')) console.log(JSON.stringify(open.map(({ number, title, body, labels }) => ({ number, title, body, labels, url: forge.issueUrl(number) })), null, 2));
    else if (!open.length) console.log(en ? '✓ No issues to adopt' : '✓ No hay issues para adoptar');
    else for (const i of open) console.log(`#${i.number}  ${i.title}  ${forge.issueUrl(i.number)}`);
  } else {
    const [n, id] = args.filter((a) => !a.startsWith('--'));
    if (!n || !id) throw new Error('Uso / usage: npm run pm:adopt -- --listar | <issue> <ID>');
    const story = pm.findStory(id);
    const v = pm.view(story);
    if (Number(story.data[K.issue]) !== Number(n))
      throw new Error(en ? `${pm.rel(story.file)} must say ${K.issue}: ${n} first` : `${pm.rel(story.file)} tiene que decir ${K.issue}: ${n} antes`);
    const issue = await forge.getIssue(n);
    if (!issue.title.startsWith(`[${v.id}]`)) await forge.updateIssue(n, { title: `[${v.id}] ${v.title}` });
    await syncOne(pm, v.id, { forge, force: true });
    await forge.comment(n, en ? `Adopted as ${v.id}: \`${pm.rel(story.file)}\`` : `Adoptado como ${v.id}: \`${pm.rel(story.file)}\``);
  }
} catch (err) {
  console.error(`✗ ${err.message}`);
  process.exit(1);
}
