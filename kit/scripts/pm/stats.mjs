#!/usr/bin/env node
// Métricas desde el log de progreso: días promedio en cada estado, historias cerradas por semana y
// las que llevan más tiempo en su estado actual.
//   npm run pm:stats [-- --json]
import { stats } from '../lib/insights.mjs';
import { project } from '../lib/project.mjs';

const pm = project();
const { t } = pm;
const s = stats(pm);
if (process.argv.includes('--json')) {
  console.log(JSON.stringify(s, null, 2));
  process.exit(0);
}
console.log(t.stats.perState);
for (const [state, { avgDays, samples }] of Object.entries(s.perState))
  if (samples) console.log(`  ${state.padEnd(12)} ${String(avgDays).padStart(5)} ${t.stats.days}  (${samples})`);
console.log(`\n${t.stats.weekly}`);
for (const { week, count } of s.doneByWeek.slice(-8)) console.log(`  ${week}  ${'■'.repeat(count)} ${count}`);
if (!s.doneByWeek.length) console.log(`  —`);
console.log(`\n${t.stats.aging}`);
for (const a of s.aging.slice(0, 8)) console.log(`  ${a.id}  ${a.status.padEnd(12)} ${a.days} ${t.stats.days}  ${a.title}`);
