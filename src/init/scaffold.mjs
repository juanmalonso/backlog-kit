// Init de backlog-kit: arma la lista de archivos que hay que crear o actualizar en un proyecto y la
// aplica. JS puro, sin dependencias: lo usan la extensión de VS Code y la CLI (bin/backlog-kit.mjs).
//
// Tres tipos de archivo:
// - kit:   scripts y hooks. Se escriben siempre (así el init también actualiza).
// - seed:  config, plantillas, skills, docs, épica inicial, CI. Solo si no existen.
// - merge: package.json, .claude/settings.json, CLAUDE.md. Se fusionan sin pisar lo del proyecto.
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { OPTIONAL_FIELDS, PRESETS, resolveConfig } from '../../kit/scripts/lib/config.mjs';

export const CLAUDE_BEGIN = '<!-- backlog-kit:begin -->';
export const CLAUDE_END = '<!-- backlog-kit:end -->';

export const DEFAULTS = {
  language: 'es',
  storyPrefix: undefined, // sale del preset del idioma
  mainBranch: 'main',
  checkCommand: undefined,
  fields: [],
  skills: true,
  github: true,
  gitGuard: true,
  ci: true,
  epicTitle: undefined,
  // 'project': skills, subagentes, hooks y MCP se copian al proyecto. 'plugin': los trae el plugin
  // de Claude Code (backlog-kit@backlog-kit) y en el proyecto solo queda la statusline.
  claude: 'project',
  mcp: true,
  claudeAction: false,
};

export const SKILLS = {
  es: ['hu-nueva', 'hu-refinar', 'hu-avanzar', 'hu-log', 'hu-backlog', 'hu-adoptar-issue', 'hu-ola', 'doc-adr', 'doc-hallazgo'],
  en: ['story-new', 'story-refine', 'story-advance', 'story-log', 'story-backlog', 'story-adopt-issue', 'story-wave', 'doc-adr', 'doc-finding'],
};
export const AGENTS = { es: ['revisor-criterios', 'refinador'], en: ['criteria-reviewer', 'refiner'] };
export const GITHUB_ONLY_SKILLS = ['hu-adoptar-issue', 'story-adopt-issue'];

const SCRIPTS = {
  'pm:check': 'node scripts/pm/check.mjs',
  'pm:backlog': 'node scripts/pm/backlog.mjs',
  'pm:next-id': 'node scripts/pm/next-id.mjs',
  'pm:advance': 'node scripts/pm/advance.mjs',
  'pm:log': 'node scripts/pm/log.mjs',
  'pm:start': 'node scripts/pm/start.mjs',
  'pm:next': 'node scripts/pm/next.mjs',
  'pm:stats': 'node scripts/pm/stats.mjs',
  'pm:new': 'node scripts/pm/new.mjs',
};
const GITHUB_SCRIPTS = {
  'pm:sync': 'node scripts/pm/sync-issue.mjs',
  'pm:issue': 'node scripts/pm/issue.mjs',
  'pm:setup-github': 'node scripts/pm/setup-github.mjs',
  'pm:pr': 'node scripts/pm/pr.mjs',
};

/** Config que se escribe en .pm/config.json: solo lo que difiere del preset, más lo elegido. */
export function buildConfig(opts) {
  const o = { ...DEFAULTS, ...opts };
  const preset = PRESETS[o.language] ?? PRESETS.es;
  const catalog = OPTIONAL_FIELDS[o.language] ?? OPTIONAL_FIELDS.es;
  return {
    language: o.language,
    storyPrefix: (o.storyPrefix || preset.storyPrefix).toUpperCase(),
    mainBranch: o.mainBranch || 'main',
    checkCommand: o.checkCommand || preset.checkCommand,
    fields: o.fields.filter((f) => catalog[f]).map((f) => catalog[f]),
    github: { enabled: Boolean(o.github) },
    gitGuard: { enabled: Boolean(o.gitGuard) },
    claude: { mode: o.claude === 'plugin' ? 'plugin' : 'project' },
  };
}

function lookup(ctx, key) {
  return key.split('.').reduce((v, k) => (v == null ? undefined : v[k]), ctx);
}

/** `{{a.b}}` y bloques `{{#flag}}…{{/flag}}`. Un marcador sin valor es un error del kit. */
export function render(text, ctx) {
  const blocks = text.replace(/\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_, flag, inner) => (ctx[flag] ? inner : ''));
  return blocks.replace(/\{\{([\w.]+)\}\}/g, (whole, key) => {
    const v = lookup(ctx, key);
    if (v === undefined) throw new Error(`Marcador sin valor en la plantilla: ${whole}`);
    return String(v);
  });
}

function fieldLine(f, lang) {
  if (f.values) return `${`${f.key}: ${f.values[0]}`.padEnd(23)}# ${f.values.join(' | ')}\n`;
  if (f.range) return `${`${f.key}:`.padEnd(23)}# ${f.range[0]}–${f.range[1]}${lang === 'en' ? ', empty if not applicable' : ', vacío si no aplica'}\n`;
  return `${f.key}: []\n`;
}

export function templateContext(cfgRaw, opts = {}) {
  const cfg = resolveConfig(cfgRaw);
  const en = cfg.language === 'en';
  const epicId = `${cfg.epicPrefix}${'0'.repeat(cfg.epicDigits)}`;
  return {
    ...cfg,
    K: cfg.keys,
    S: cfg.states,
    typesList: cfg.types.join(' | '),
    statesList: cfg.stateList.join(' | '),
    prioritiesList: cfg.priorities.join(' | '),
    estimatesList: cfg.estimates.join(' | '),
    priorityDefault: cfg.priorities[Math.min(2, cfg.priorities.length - 1)],
    branchHint: `${cfg.storyPrefix.toLowerCase()}-nnn-<slug>`,
    extraFields: cfg.fields.map((f) => fieldLine(f, cfg.language)).join(''),
    fieldsHint: cfg.fields.length
      ? `\n- ${cfg.fields.map((f) => `**${f.label}** (\`${f.key}\`${f.values ? `: ${f.values.join(' / ')}` : ''})`).join(', ')}.`
      : '',
    github: cfg.github.enabled,
    gitGuard: cfg.gitGuard.enabled,
    plugin: opts.claude === 'plugin',
    project: opts.claude !== 'plugin',
    mcp: opts.mcp !== false,
    skillPrefix: opts.claude === 'plugin' ? `backlog-kit${cfg.language === 'en' ? '-en' : ''}:` : '',
    epicId,
    epicTitle: opts.epicTitle || (en ? 'Foundations' : 'Fundaciones'),
  };
}

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

/** Lista de acciones del init. No toca el disco. */
export function planInit(root, opts, kitDir) {
  const o = { ...DEFAULTS, ...opts };
  const cfgRaw = buildConfig(o);
  const ctx = templateContext(cfgRaw, o);
  const lang = cfgRaw.language;
  const i18n = path.join(kitDir, 'i18n', lang);
  const tpl = (name) => render(readFileSync(path.join(i18n, name), 'utf8'), ctx);
  const actions = [];
  const add = (rel, content, kind, executable = false) => actions.push({ path: rel, content, kind, executable });

  // Scripts y hooks: siempre (kit).
  for (const file of walk(path.join(kitDir, 'scripts'))) {
    const rel = path.relative(kitDir, file).split(path.sep).join('/');
    if (!o.github && /scripts\/pm\/(sync-issue|issue|setup-github|pr)\.mjs$/.test(rel)) continue;
    if (!o.gitGuard && /scripts\/(hooks\/(git-guard|pre-push)|lib\/git-rules)\.mjs$/.test(rel)) continue;
    add(rel, readFileSync(file, 'utf8'), 'kit');
  }
  if (o.gitGuard) {
    add('.githooks/pre-push', readFileSync(path.join(kitDir, 'githooks/pre-push'), 'utf8'), 'kit', true);
    add('.githooks/prepare-commit-msg', readFileSync(path.join(kitDir, 'githooks/prepare-commit-msg'), 'utf8'), 'kit', true);
  }

  // Estructura de .pm/ (seed).
  add('.pm/config.json', `${JSON.stringify(cfgRaw, null, 2)}\n`, 'seed');
  add('.pm/templates/story.md', tpl('story.md'), 'seed');
  add(`.pm/${ctx.epicId}-${slug(ctx.epicTitle)}/README.md`, tpl('epic.md'), 'seed-epic');

  // Docs: decisiones y hallazgos.
  const docName = lang === 'en' ? 'template.md' : 'plantilla.md';
  add(`${ctx.docs.decisions}/README.md`, tpl('adr-index.md'), 'seed');
  add(`${ctx.docs.decisions}/${docName}`, tpl('adr-template.md'), 'seed');
  add(`${ctx.docs.findings}/README.md`, tpl('finding-index.md'), 'seed');
  add(`${ctx.docs.findings}/${docName}`, tpl('finding-template.md'), 'seed');

  if (o.skills) {
    if (o.claude !== 'plugin') {
      for (const name of SKILLS[lang]) {
        if (!o.github && GITHUB_ONLY_SKILLS.includes(name)) continue;
        add(`.claude/skills/${name}/SKILL.md`, tpl(`skills/${name}.md`), 'seed');
      }
      for (const name of AGENTS[lang]) add(`.claude/agents/${name}.md`, tpl(`agents/${name}.md`), 'seed');
      if (o.mcp) add('.mcp.json', null, 'merge-mcp');
    }
    add('CLAUDE.md', `${CLAUDE_BEGIN}\n${tpl('claude.md').trim()}\n${CLAUDE_END}\n`, 'merge-claude');
    add('.claude/settings.json', null, 'merge-settings');
  }
  if (o.ci) add('.github/workflows/backlog.yml', render(readFileSync(path.join(kitDir, 'github/backlog.yml'), 'utf8'), ctx), 'seed');
  if (o.claudeAction) add('.github/workflows/claude.yml', render(readFileSync(path.join(kitDir, 'github/claude.yml'), 'utf8'), ctx), 'seed');
  add('package.json', null, 'merge-package');

  // Un proyecto que backlog-kit no inicializó puede tener sus propios scripts con el mismo nombre:
  // ahí no se pisa nada y el init se frena (un kit a medias deja el guard roto).
  const managed = existsSync(path.join(root, '.pm', 'config.json'));
  const resolved = actions.map((a) => resolveAction(root, a, o, managed));
  return { config: cfgRaw, actions: resolved, conflicts: resolved.filter((a) => a.op === 'conflict').map((a) => a.path) };
}

function slug(s) {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Decide qué pasa con cada archivo según lo que ya hay: create, update, merge o skip. */
function resolveAction(root, a, o, managed) {
  const abs = path.join(root, a.path);
  const exists = existsSync(abs);
  const current = exists ? readFileSync(abs, 'utf8') : null;
  if (a.kind === 'merge-package') {
    const { text, changed } = mergePackage(current, o, path.basename(root));
    return { ...a, content: text, op: !exists ? 'create' : changed ? 'merge' : 'skip' };
  }
  if (a.kind === 'merge-settings') {
    const { text, changed } = mergeSettings(current, o);
    return { ...a, content: text, op: !exists ? 'create' : changed ? 'merge' : 'skip' };
  }
  if (a.kind === 'merge-mcp') {
    const { text, changed } = mergeMcp(current);
    return { ...a, content: text, op: !exists ? 'create' : changed ? 'merge' : 'skip' };
  }
  if (a.kind === 'merge-claude') {
    const text = mergeClaude(current, a.content);
    return { ...a, content: text, op: !exists ? 'create' : text === current ? 'skip' : 'merge' };
  }
  if (a.kind === 'seed-epic') {
    // Si el proyecto ya tiene épicas, no se agrega la inicial.
    const pmDir = path.join(root, '.pm');
    const hasEpics = existsSync(pmDir) && readdirSync(pmDir).some((d) => /^[A-Z]+\d+-/.test(d));
    return { ...a, op: hasEpics || exists ? 'skip' : 'create' };
  }
  if (!exists) return { ...a, op: 'create' };
  if (current === a.content) return { ...a, op: 'skip' };
  if (a.kind === 'kit') return managed ? { ...a, op: 'update' } : { ...a, op: 'conflict', reason: 'existe y no es de backlog-kit' };
  return { ...a, op: 'skip', reason: 'existe' };
}

export function mergePackage(current, o, name) {
  const pkg = current ? JSON.parse(current) : { name: slug(name) || 'project', private: true };
  const before = JSON.stringify(pkg);
  pkg.scripts ??= {};
  const wanted = { ...SCRIPTS, ...(o.github ? GITHUB_SCRIPTS : {}) };
  // Alias en español del comando más usado, como en el proyecto de origen.
  if (o.language !== 'en') wanted['pm:avanzar'] = 'node scripts/pm/advance.mjs';
  for (const [k, v] of Object.entries(wanted)) pkg.scripts[k] ??= v;
  if (o.gitGuard) {
    const hook = 'git config core.hooksPath .githooks';
    const prev = pkg.scripts.prepare;
    if (!prev) pkg.scripts.prepare = hook;
    else if (!prev.includes('core.hooksPath')) pkg.scripts.prepare = `${prev} && ${hook}`;
  }
  return { text: `${JSON.stringify(pkg, null, 2)}\n`, changed: JSON.stringify(pkg) !== before };
}

export function mergeSettings(current, o) {
  const s = current ? JSON.parse(current) : { $schema: 'https://json.schemastore.org/claude-code-settings.json' };
  const before = JSON.stringify(s);
  s.permissions ??= {};
  s.permissions.allow ??= [];
  const allow = [
    'Bash(npm run pm:check)',
    'Bash(npm run pm:backlog)',
    'Bash(npm run pm:next-id:*)',
    'Bash(node scripts/pm/check.mjs:*)',
    'Bash(node scripts/pm/backlog.mjs:*)',
    'Bash(npm run pm:next:*)',
    'Bash(npm run pm:stats:*)',
    ...(o.claude !== 'plugin' && o.mcp ? ['mcp__backlog__story_list', 'mcp__backlog__story_get', 'mcp__backlog__story_next', 'mcp__backlog__backlog_stats'] : []),
    ...(o.github ? ['Bash(npm run pm:issue:*)', 'Bash(gh issue view:*)', 'Bash(gh issue list:*)', 'Bash(gh pr view:*)', 'Bash(gh pr checks:*)'] : []),
  ];
  for (const a of allow) if (!s.permissions.allow.includes(a)) s.permissions.allow.push(a);
  s.hooks ??= {};
  const addHook = (event, matcher, command, statusMessage) => {
    s.hooks[event] ??= [];
    const present = s.hooks[event].some((h) => h.hooks?.some((x) => x.command === command));
    if (!present)
      s.hooks[event].push({ ...(matcher ? { matcher } : {}), hooks: [{ type: 'command', command, timeout: 20, ...(statusMessage ? { statusMessage } : {}) }] });
  };
  const en = o.language === 'en';
  // Con el plugin, guard y contexto los registra el plugin: acá quedaría duplicado.
  if (o.claude !== 'plugin') {
    addHook('PostToolUse', 'Write|Edit|MultiEdit', 'node "$CLAUDE_PROJECT_DIR/scripts/hooks/pm-guard.mjs"', en ? 'Checking .pm/' : 'Verificando .pm/');
    if (o.gitGuard)
      addHook('PreToolUse', 'Bash', 'node "$CLAUDE_PROJECT_DIR/scripts/hooks/git-guard.mjs"', en ? 'Checking the main branch is untouched' : 'Verificando que no se toque la rama principal');
    addHook('SessionStart', 'startup|resume|clear|compact', 'node "$CLAUDE_PROJECT_DIR/scripts/claude/session-context.mjs"', en ? 'Loading the current story' : 'Cargando la historia de la rama');
    addHook('UserPromptSubmit', undefined, 'node "$CLAUDE_PROJECT_DIR/scripts/claude/prompt-context.mjs"');
    addHook('Stop', undefined, 'node "$CLAUDE_PROJECT_DIR/scripts/claude/stop-check.mjs"');
  }
  // La línea de estado es de settings (un plugin no la puede poner); no pisa una que ya exista.
  s.statusLine ??= { type: 'command', command: 'node "$CLAUDE_PROJECT_DIR/scripts/claude/statusline.mjs"' };
  return { text: `${JSON.stringify(s, null, 2)}\n`, changed: JSON.stringify(s) !== before };
}

export function mergeMcp(current) {
  const m = current ? JSON.parse(current) : {};
  const before = JSON.stringify(m);
  m.mcpServers ??= {};
  m.mcpServers.backlog ??= { command: 'node', args: ['${CLAUDE_PROJECT_DIR:-.}/scripts/mcp/server.mjs'] };
  return { text: `${JSON.stringify(m, null, 2)}\n`, changed: JSON.stringify(m) !== before };
}

export function mergeClaude(current, block) {
  if (!current) return block;
  const start = current.indexOf(CLAUDE_BEGIN);
  const end = current.indexOf(CLAUDE_END);
  if (start >= 0 && end > start) return `${current.slice(0, start)}${block.trimEnd()}${current.slice(end + CLAUDE_END.length)}`;
  return `${current.trimEnd()}\n\n${block}`;
}

/**
 * Plan de `upgrade`: los archivos del kit (scripts y hooks) según el .pm/config.json que ya tiene
 * el proyecto, más los comandos pm:* nuevos en package.json (sin pisar los que existen). No crea
 * archivos iniciales: para proyectos ya configurados, incluidos los que adoptaron backlog-kit con
 * su config escrita a mano.
 */
export function planUpgrade(root, kitDir) {
  const file = path.join(root, '.pm', 'config.json');
  if (!existsSync(file)) throw new Error('No hay .pm/config.json: corré init primero / run init first.');
  const raw = JSON.parse(readFileSync(file, 'utf8'));
  const cfg = resolveConfig(raw);
  const plan = planInit(
    root,
    {
      language: cfg.language,
      storyPrefix: cfg.storyPrefix,
      mainBranch: cfg.mainBranch,
      github: cfg.github?.enabled !== false,
      gitGuard: cfg.gitGuard?.enabled !== false,
      skills: false,
      ci: false,
    },
    kitDir,
  );
  return { config: { ...raw, github: { enabled: cfg.github?.enabled !== false }, gitGuard: { enabled: cfg.gitGuard?.enabled !== false } }, actions: plan.actions.filter((a) => a.kind === 'kit' || a.kind === 'merge-package'), conflicts: [] };
}

/** Escribe las acciones y deja el proyecto andando: hooks de git y backlog generado. */
export function applyInit(root, plan, { log = (_line) => {}, force = false } = {}) {
  if (plan.conflicts?.length && !force)
    throw new Error(
      `El proyecto ya tiene archivos con el mismo nombre que no son de backlog-kit / existing files not created by backlog-kit:\n${plan.conflicts.map((c) => `  - ${c}`).join('\n')}`,
    );
  for (const a of plan.actions) {
    if (a.op === 'skip') continue;
    const abs = path.join(root, a.path);
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, a.content);
    if (a.executable) chmodSync(abs, 0o755);
    log(`${a.op.padEnd(6)} ${a.path}`);
  }
  const notes = [];
  if (plan.config.gitGuard.enabled) {
    try {
      execFileSync('git', ['config', 'core.hooksPath', '.githooks'], { cwd: root, stdio: 'ignore' });
    } catch {
      notes.push('git config core.hooksPath .githooks');
    }
  }
  execFileSync('node', [path.join(root, 'scripts/pm/backlog.mjs'), '--quiet'], { cwd: root, stdio: 'pipe' });
  return { notes };
}
