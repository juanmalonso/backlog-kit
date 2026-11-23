// Lectura y escritura de .pm/ (épicas e historias). Sin dependencias: solo node:*.
//
// El frontmatter es YAML plano (clave: valor, listas en línea [a, b]). Un comentario es " # " con
// espacio después del #: "#441" o "#12" en un nombre son texto. El parser cubre solo eso a
// propósito: si alguien escribe YAML más rico, el guard lo marca. Todo recibe la raíz del proyecto
// para que lo usen igual los scripts y la extensión.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { loadConfig, resolveConfig } from './config.mjs';

export function parseFrontmatter(text) {
  const m = text.replace(/\r\n/g, '\n').match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return { data: null, body: text };
  const data = {};
  for (const raw of m[1].split('\n')) {
    if (!raw.replace(COMMENT, '').trim()) continue;
    const kv = raw.match(/^([a-z_]+):[ \t]*(.*)$/);
    if (!kv) throw new Error(`Línea de frontmatter no soportada / unsupported frontmatter line: "${raw}"`);
    // Una clave repetida es ambigua: unas herramientas leen la primera y otras la última.
    if (kv[1] in data) throw new Error(`Clave repetida en el frontmatter / duplicated frontmatter key: "${kv[1]}"`);
    data[kv[1]] = parseValue(kv[2]);
  }
  return { data, body: text.replace(/\r\n/g, '\n').slice(m[0].length) };
}

// "# " al principio de la línea o " # " después de un valor: comentario hasta el final.
const COMMENT = /(?:^|\s+)#(?:\s.*)?$/;

// Entre comillas, un valor puede tener " # " adentro.
function parseValue(raw) {
  const quoted = raw.match(/^(["'])(.*?)\1(?:\s+#(?:\s.*)?)?\s*$/);
  if (quoted) return quoted[2];
  const v = raw.replace(COMMENT, '').trim();
  if (v === '') return null;
  if (v.startsWith('[') && v.endsWith(']')) {
    const inner = v.slice(1, -1).trim();
    return inner ? inner.split(',').map((s) => s.trim()) : [];
  }
  if (/^\d+$/.test(v)) return Number(v);
  return v.replace(/^["']|["']$/g, '');
}

/** Entre comillas si sin ellas el parser lo leería distinto (" # ", comillas, # o corchete al inicio). */
function renderScalar(value) {
  const v = value ?? '';
  if (typeof v !== 'string' || !(/\s#(\s|$)/.test(v) || /^["'#[]/.test(v))) return v;
  return v.includes('"') ? `'${v}'` : `"${v}"`;
}

/** Cambia o agrega campos del frontmatter sin tocar el resto del archivo ni sus comentarios. */
export function setFields(file, fields) {
  let text = readFileSync(file, 'utf8');
  for (const [key, value] of Object.entries(fields)) {
    const rendered = Array.isArray(value) ? `[${value.join(', ')}]` : renderScalar(value);
    // Separa "clave: valor" del comentario "# ..." y conserva la columna del comentario.
    const re = new RegExp(`^(${key}:.*?)([ \\t]+#(?:[ \\t].*)?)?$`, 'm');
    const fm = text.match(/^---\n[\s\S]*?\n---/)[0];
    const next = re.test(fm)
      ? fm.replace(re, (whole, _kv, comment) => {
          const head = `${key}: ${rendered}`.replace(/ +$/, '');
          if (!comment) return head;
          const col = whole.length - comment.trimStart().length;
          return `${head.padEnd(col - 1)} ${comment.trimStart()}`;
        })
      : fm.replace(/\n---$/, () => `\n${key}: ${rendered}\n---`);
    // Reemplazos con función: un valor con "$&" o "$1" no se interpreta como patrón.
    text = text.replace(fm, () => next);
  }
  writeFileSync(file, text);
}

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Agrega una línea al final de una sección `## <titulo>` del README. */
export function appendToSection(file, title, line) {
  const text = readFileSync(file, 'utf8');
  const re = new RegExp(`(## ${escape(title)}\\n[\\s\\S]*?)(\\n## |$)`);
  if (!re.test(text)) throw new Error(`${file}: no tiene la sección / has no section "## ${title}"`);
  writeFileSync(
    file,
    text.replace(re, (_, sec, next) => `${sec.replace(/\s*$/, '')}\n${line}\n${next}`),
  );
}

export function section(body, title) {
  const m = body.match(new RegExp(`## ${escape(title)}\\n([\\s\\S]*?)(?=\\n## |$)`));
  return m ? m[1].trim() : '';
}

/** Tilda o destilda el criterio número `index` (desde 0) de una sección. Devuelve el texto nuevo. */
export function toggleChecklist(file, title, index, checked) {
  const text = readFileSync(file, 'utf8');
  const re = new RegExp(`(## ${escape(title)}\\n)([\\s\\S]*?)(?=\\n## |$)`);
  const m = text.match(re);
  if (!m) throw new Error(`${file}: no tiene la sección / has no section "## ${title}"`);
  let n = -1;
  const body = m[2].replace(/^(\s*- \[)([ xX])(\])/gm, (whole, a, _mark, b) => {
    n += 1;
    return n === index ? `${a}${checked ? 'x' : ' '}${b}` : whole;
  });
  if (index > n) throw new Error(`${file}: no hay criterio ${index + 1} / no criterion ${index + 1}`);
  const next = text.replace(re, () => `${m[1]}${body}`);
  writeFileSync(file, next);
  return next;
}

/** Criterios `- [ ]` / `- [x]` de una sección. */
export function checklist(body, title) {
  const lines = section(body, title).split('\n');
  return {
    done: lines.filter((l) => /^\s*- \[x\]/i.test(l)).length,
    pending: lines.filter((l) => /^\s*- \[ \]/.test(l)),
  };
}

function dirs(p) {
  return existsSync(p)
    ? readdirSync(p, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name)
    : [];
}

/** Fecha local AAAA-MM-DD. No UTC: en UTC-3, después de las 21 h el log quedaba con fecha de mañana. */
/**
 * Ids de la sección de dependencias. Por defecto, todos los que aparecen. Con
 * `dependencies: { mode: "first" }`, solo el primero de cada ítem de lista (la historia de la que se
 * depende; el resto suele ser contexto), y `dependencies.skip` (regex, sin distinguir mayúsculas)
 * descarta los ítems que empiezan con una relación inversa ("Precede a HU-x", "No depende de HU-y").
 */
export function dependencyIds(text, cfg) {
  const re = new RegExp(cfg.idPattern, 'g');
  const mode = cfg.dependencies?.mode ?? 'all';
  const skip = cfg.dependencies?.skip ? new RegExp(cfg.dependencies.skip, 'i') : null;
  if (mode === 'all' && !skip) return [...new Set(text.match(re) ?? [])];
  const out = [];
  for (const line of text.split('\n')) {
    const item = line.match(/^\s*(?:[-*+]|\d+\.)\s+(.*)$/);
    if (!item) continue;
    const content = item[1].replace(/^[*_`\s]+/, '');
    if (skip?.test(content)) continue;
    const ids = content.match(re) ?? [];
    out.push(...(mode === 'first' ? ids.slice(0, 1) : ids));
  }
  return [...new Set(out)];
}

export function today(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Acceso a .pm/ de un proyecto. `cfg` se puede pasar ya resuelto (tests, extensión). */
export function createPm(root, cfg = loadConfig(root)) {
  if (!cfg.stateList) cfg = resolveConfig(cfg);
  const PM = path.join(root, '.pm');
  const K = cfg.keys;
  const epicRe = new RegExp(`^${escape(cfg.epicPrefix)}\\d{${cfg.epicDigits}}-`);
  const storyRe = new RegExp(`^${escape(cfg.storyPrefix)}-\\d+`);

  function loadEpics() {
    return dirs(PM)
      .filter((d) => epicRe.test(d))
      .sort()
      .map((folder) => {
        const file = path.join(PM, folder, 'README.md');
        let data = null;
        let error;
        try {
          if (existsSync(file)) data = parseFrontmatter(readFileSync(file, 'utf8')).data;
        } catch (err) {
          error = err.message;
        }
        const id = folder.slice(0, cfg.epicPrefix.length + cfg.epicDigits);
        return { folder, id, file, data, error, slug: folder.slice(id.length + 1), title: data?.[K.title] ?? folder.slice(id.length + 1) };
      });
  }

  function loadStories() {
    const stories = [];
    for (const epic of loadEpics()) {
      for (const folder of dirs(path.join(PM, epic.folder)).filter((d) => storyRe.test(d))) {
        const file = path.join(PM, epic.folder, folder, 'README.md');
        if (!existsSync(file)) {
          stories.push({ folder, epic, file, data: null, body: '', error: 'falta README.md / missing README.md' });
          continue;
        }
        try {
          const { data, body } = parseFrontmatter(readFileSync(file, 'utf8'));
          stories.push({ folder, epic, file, data, body });
        } catch (err) {
          stories.push({ folder, epic, file, data: null, body: '', error: err.message });
        }
      }
    }
    return stories.sort((a, b) => a.folder.localeCompare(b.folder));
  }

  function normalizeId(id) {
    const m = String(id).match(/(\d+)/);
    if (!m) throw new Error(`Id inválido / invalid id: ${id}`);
    return cfg.formatId(Number(m[1]));
  }

  function findStory(id) {
    const norm = normalizeId(id);
    const story = loadStories().find((s) => s.data?.[K.id] === norm || s.folder.startsWith(`${norm}-`));
    if (!story) throw new Error(`No existe / not found: ${norm}`);
    if (!story.data)
      throw new Error(`${path.relative(root, story.file)}: ${story.error ?? 'sin frontmatter / no frontmatter'}. Corregilo antes de seguir / fix it first.`);
    return story;
  }

  /** La historia con nombres canónicos: lo que consume el tablero. */
  function view(story) {
    const d = story.data ?? {};
    const criteria = checklist(story.body, cfg.sections.criteria);
    const deps = dependencyIds(section(story.body, cfg.sections.dependencies), cfg);
    return {
      id: d[K.id] ?? story.folder,
      epic: story.epic.id,
      epicTitle: story.epic.title,
      title: d[K.title] ?? story.folder,
      status: d[K.status] ?? null,
      priority: d[K.priority] ?? null,
      type: d[K.type] ?? null,
      estimate: d[K.estimate] ?? null,
      branch: d[K.branch] ?? null,
      issue: d[K.issue] ?? null,
      updated: d[K.updated] ?? null,
      extra: Object.fromEntries(cfg.fields.map((f) => [f.key, d[f.key] ?? null])),
      criteria: { done: criteria.done, total: criteria.done + criteria.pending.length },
      dependencies: deps.filter((x) => x !== d[K.id]),
      file: story.file,
      error: story.error ?? null,
    };
  }

  return {
    root,
    cfg,
    PM,
    loadEpics,
    loadStories,
    findStory,
    normalizeId,
    view,
    rel: (file) => path.relative(root, file),
  };
}
