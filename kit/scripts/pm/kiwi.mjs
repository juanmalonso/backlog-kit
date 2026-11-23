#!/usr/bin/env node
// Sincroniza los casos de prueba de una historia con Kiwi TCMS (módulo `kiwi` del config).
// pm:advance y pm:new lo corren solos; a mano sirve para re-sincronizar o probar.
//
//   npm run pm:kiwi -- HU-012 [--dry-run]
//   npm run pm:kiwi -- --todas [--dry-run]     (--all)
import { syncKiwi, createKiwi } from '../lib/kiwi.mjs';
import { project } from '../lib/project.mjs';

const args = process.argv.slice(2);
const pm = project();
const dry = args.includes('--dry-run');
try {
  if (!pm.cfg.kiwi?.enabled) throw new Error(pm.cfg.language === 'en' ? 'The kiwi module is off in .pm/config.json' : 'El módulo kiwi está apagado en .pm/config.json');
  const all = args.includes('--todas') || args.includes('--all');
  const ids = all ? pm.loadStories().filter((s) => s.data).map((s) => pm.view(s).id) : args.filter((a) => !a.startsWith('--'));
  if (!ids.length) throw new Error('Uso / usage: npm run pm:kiwi -- <ID> [--dry-run] | --todas');
  const kiwi = createKiwi(pm.root, pm.cfg);
  for (const id of ids) await syncKiwi(pm, id, { dry, kiwi });
} catch (err) {
  console.error(`✗ ${err.message}`);
  process.exit(1);
}
