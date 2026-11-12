#!/usr/bin/env node
// Qué tomar después: lo que está en review (necesita al usuario), lo listo sin dependencias
// pendientes (ordenado por etapa, cuánto destraba y prioridad) y lo listo que todavía espera.
//   npm run pm:next [-- --json] [-- -n 5]
import { suggestNext } from '../lib/insights.mjs';
import { project } from '../lib/project.mjs';

const args = process.argv.slice(2);
const pm = project();
const { t } = pm;
const n = Number(args[args.indexOf('-n') + 1]) || 5;
const s = suggestNext(pm);
if (args.includes('--json')) {
  console.log(JSON.stringify({ review: s.review, next: s.free.slice(0, n), waiting: s.waiting }, null, 2));
  process.exit(0);
}
if (s.review.length) console.log(`${t.next.review}\n${s.review.map((v) => `  ${v.id}  ${v.title}`).join('\n')}\n`);
if (s.free.length)
  console.log(
    `${t.next.ready}\n${s.free
      .slice(0, n)
      .map((v) => `  ${v.id}  ${v.title}  (${[v.priority, v.unlocks ? t.next.unlocks(v.unlocks) : null].filter(Boolean).join(', ')})`)
      .join('\n')}\n`,
  );
else console.log(`${t.next.none}\n`);
if (s.waiting.length) console.log(`${t.next.waiting}\n${s.waiting.map((v) => `  ${v.id}  ← ${v.pending.join(', ')}`).join('\n')}`);
