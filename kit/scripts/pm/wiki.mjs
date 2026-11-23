#!/usr/bin/env node
// Publica .pm/ en la wiki de GitLab o de GitHub (módulo `wiki` del config).
//
//   npm run pm:wiki [-- --dry-run]
//
// Estructura (los títulos de sección se configuran en `wiki.sections`):
//   <páginas sueltas de wiki.pages>          (por defecto, el backlog)
//   Decisiones de Arquitectura/Indice  y  /ADR-NNN <nombre>
//   Epicas/E01 <nombre>
//   Historias de Usuario/E01/HU-001 <nombre>
// Los nombres van sin acentos, sin "/" y cortados por palabra: el título es el slug de la página, y un
// slug que cambia entre corridas borra y recrea la página (pierde su historial).
// Con `wiki.prune: true` borra las páginas que ya no corresponden, salvo las de `wiki.keep`.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createForge } from '../lib/forge.mjs';
import { parseFrontmatter } from '../lib/pm.mjs';
import { isMain, project } from '../lib/project.mjs';
import { backlogFile } from './backlog.mjs';

const SECTIONS = {
  es: { decisions: 'Decisiones de Arquitectura', index: 'Indice', epics: 'Epicas', stories: 'Historias de Usuario', noIssue: '_sin issue registrado_', status: 'Estado', epic: 'Epica', title: 'Titulo' },
  en: { decisions: 'Architecture Decisions', index: 'Index', epics: 'Epics', stories: 'User Stories', noIssue: '_no issue recorded_', status: 'Status', epic: 'Epic', title: 'Title' },
};

/** Nombre corto para un título de página: sin acentos, sin "/", hasta `max` caracteres por palabra. */
export function shortName(name, max = 50) {
  const clean = String(name ?? '').replace(/\//g, '-').normalize('NFD').replace(/[̀-ͯ]/g, '');
  let out = '';
  for (const w of clean.split(/\s+/).filter(Boolean)) {
    if (out.length + w.length + 1 > max) break;
    out = `${out} ${w}`.trim();
  }
  return out;
}

const meta = (text) => {
  try {
    return parseFrontmatter(text).data ?? {};
  } catch {
    return {};
  }
};
const join = (...parts) => parts.filter(Boolean).join(' ');

export function wikiPages(pm, forge) {
  const { cfg } = pm;
  const w = cfg.wiki ?? {};
  const S = { ...(SECTIONS[cfg.language] ?? SECTIONS.es), ...(w.sections ?? {}) };
  const K = cfg.keys;
  const read = (rel) => (existsSync(path.join(pm.root, rel)) ? readFileSync(path.join(pm.root, rel), 'utf8') : null);
  const pages = [];

  for (const p of w.pages ?? [{ file: pm.rel(backlogFile(pm)), title: 'Backlog' }]) {
    const c = read(p.file);
    if (c) pages.push({ title: p.title, content: c });
  }

  // Decisiones: los archivos <PREFIJO>-NNN*.md del directorio de decisiones.
  const decDir = path.join(pm.root, cfg.docs.decisions);
  if (existsSync(decDir)) {
    const files = readdirSync(decDir).filter((f) => /^[A-Za-z]+-\d+.*\.md$/.test(f)).sort();
    const rows = [];
    for (const f of files) {
      const c = readFileSync(path.join(decDir, f), 'utf8');
      const d = meta(c);
      const [, prefix, num] = f.match(/^([A-Za-z]+)-(\d+)/);
      const id = `${prefix.toUpperCase()}-${num.padStart(3, '0')}`;
      const title = `${S.decisions}/${join(id, shortName(d[K.title] ?? d.titulo ?? d.title))}`;
      rows.push(`| [${id}](${title.replace(/ /g, '-')}) | ${d.titulo ?? d.title ?? d[K.title] ?? ''} | ${d[K.status] ?? d.estado ?? d.status ?? ''} |`);
      pages.push({ title, content: c });
    }
    if (files.length)
      pages.splice(pages.length - files.length, 0, {
        title: `${S.decisions}/${S.index}`,
        content: `# ${S.decisions} — ${S.index}\n\n| ID | ${S.title} | ${S.status} |\n|---|---|---|\n${rows.join('\n')}`,
      });
  }

  for (const e of pm.loadEpics()) {
    const c = existsSync(e.file) ? readFileSync(e.file, 'utf8') : null;
    if (c) pages.push({ title: `${S.epics}/${join(e.id, shortName(e.data?.[K.title]))}`, content: c });
  }

  for (const s of pm.loadStories().filter((x) => x.data)) {
    const v = pm.view(s);
    const c = readFileSync(s.file, 'utf8');
    const issue = Number(v.issue) ? `[Issue #${v.issue}](${forge.issueUrl(v.issue)})` : S.noIssue;
    pages.push({
      title: `${S.stories}/${s.epic.id}/${join(v.id, shortName(s.data[K.title]))}`,
      content: `> **${S.status}:** ${v.status} | **${S.epic}:** ${s.epic.id} | ${issue}\n\n---\n\n${c}`,
    });
  }
  return pages;
}

async function main() {
  const pm = project();
  const { cfg } = pm;
  const en = cfg.language === 'en';
  if (!cfg.wiki?.enabled) throw new Error(en ? 'The wiki module is off in .pm/config.json' : 'El módulo wiki está apagado en .pm/config.json');
  const dry = process.argv.includes('--dry-run');
  // Una historia con el frontmatter roto no genera página: con prune, la wiki borraría la suya.
  const broken = [...pm.loadEpics().filter((e) => e.error), ...pm.loadStories().filter((x) => !x.data)];
  if (cfg.wiki.prune && broken.length)
    throw new Error(
      `${en ? 'Not syncing with prune: these READMEs do not parse and their pages would be deleted' : 'No se sincroniza con prune: estos README no se leen y sus páginas se borrarían'}:\n${broken.map((x) => `  - ${pm.rel(x.file)}: ${x.error ?? 'sin frontmatter'}`).join('\n')}`,
    );
  const forge = createForge(pm.root, cfg);
  const pages = wikiPages(pm, forge);
  const r = await forge.syncWiki(pages, { prune: Boolean(cfg.wiki.prune), keep: cfg.wiki.keep, dry });
  const verbose = process.argv.includes('--verbose');
  for (const [mark, list] of [['+', r.created], ['~', r.updated], ['-', r.deleted]]) {
    if (verbose || dry || list.length <= 20) for (const t of list) console.log(`  ${mark} ${t}`);
    else console.log(`  ${mark} ${list.length}`);
  }
  console.log(
    en
      ? `✓ Wiki: ${pages.length} pages · ${r.created.length} new · ${r.updated.length} updated · ${r.deleted.length} deleted · ${r.unchanged.length} unchanged${dry ? ' [dry-run]' : ''}\n  ${forge.wikiUrl()}`
      : `✓ Wiki: ${pages.length} páginas · ${r.created.length} nuevas · ${r.updated.length} actualizadas · ${r.deleted.length} borradas · ${r.unchanged.length} sin cambios${dry ? ' [dry-run]' : ''}\n  ${forge.wikiUrl()}`,
  );
}

if (isMain(import.meta.url))
  main().catch((err) => {
    console.error(`✗ ${err.message}`);
    process.exit(1);
  });
