#!/usr/bin/env node
// Mergea un PR (GitHub) o MR (GitLab) a la rama principal, con controles. Pensado para que un agente
// lo corra con un permiso acotado (`Bash(npm run pm:merge:*)`) en vez de tener la API entera.
//
//   npm run pm:merge -- <número> [--dry-run]
//
// Sólo mergea si está abierto, apunta a la rama principal, no es borrador, no tiene conflictos y el
// CI está en verde. Antes lista los commits que entran: lo que muestra es lo que entra.
import { changeName, createForge } from '../lib/forge.mjs';
import { project } from '../lib/project.mjs';

const args = process.argv.slice(2);
const pm = project();
const en = pm.cfg.language === 'en';
const n = Number(args.find((a) => !a.startsWith('--')));
try {
  if (!Number.isInteger(n) || n <= 0) throw new Error('Uso / usage: npm run pm:merge -- <número> [--dry-run]');
  const kind = changeName(pm.cfg);
  const r = await createForge(pm.root, pm.cfg).mergeChange(n, { dry: args.includes('--dry-run') });
  console.log(`${kind} #${r.number}: ${r.title}\n  ${r.source} → ${r.target}`);
  console.log(en ? `  ${r.commits.length} commit(s) go in:` : `  Entran ${r.commits.length} commit(s):`);
  for (const c of r.commits) console.log(`    ${c.id} ${c.title}`);
  if (r.reasons.length) throw new Error(en ? `Not merged: ${r.reasons.join('; ')}` : `No se mergea: ${r.reasons.join('; ')}`);
  console.log(r.merged ? (en ? '✓ Merged' : '✓ Mergeado') : en ? '(--dry-run: nothing merged)' : '(--dry-run: no se mergeó nada)');
} catch (err) {
  console.error(`✗ ${err.message}`);
  process.exit(1);
}
