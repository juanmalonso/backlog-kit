// Init de punta a punta en un proyecto temporal: crea lo que corresponde, el guard pasa, el ciclo
// de una historia funciona con los scripts instalados y correr el init otra vez no cambia nada.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { expect } from './expect.mjs';
import { applyInit, mergeClaude, planInit, render } from '../src/init/scaffold.mjs';

const KIT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'kit');

function project(files = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'backlog-kit-'));
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir });
  for (const [f, c] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
    writeFileSync(path.join(dir, f), c);
  }
  return dir;
}
const node = (dir, ...args) => spawnSync('node', args, { cwd: dir, encoding: 'utf8' });
const read = (dir, f) => readFileSync(path.join(dir, f), 'utf8');

function newStory(dir, id, epicFolder, { status, title = 'Una historia', extra = '' } = {}) {
  const tpl = read(dir, '.pm/templates/story.md');
  const cfg = JSON.parse(read(dir, '.pm/config.json'));
  const epicKey = cfg.language === 'en' ? 'epic' : 'epica';
  let text = tpl
    .replaceAll(`${cfg.storyPrefix}-NNN`, id)
    .replace(new RegExp(`^${epicKey}: .*$`, 'm'), `${epicKey}: ${epicFolder.slice(0, 3)}`)
    .replace(/<(título corto|short title)[^>]*>/, title)
    .replaceAll('YYYY-MM-DD', '2026-11-12');
  if (status) text = text.replace(/^(estado|status): \S+/m, `$1: ${status}`);
  text = text.replace(/^(fase|phase): .*$/m, '$1: MVP');
  if (extra) text = text.replace(/\n## (Dependencias|Dependencies)\n\n.*\n/, `\n## $1\n\n${extra}\n`);
  const folder = path.join(dir, '.pm', epicFolder, `${id}-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`);
  mkdirSync(folder, { recursive: true });
  writeFileSync(path.join(folder, 'README.md'), text);
  node(dir, 'scripts/pm/backlog.mjs', '--quiet');
  return path.join(folder, 'README.md');
}

describe('init en español', () => {
  const dir = project({ 'package.json': JSON.stringify({ name: 'demo', scripts: { test: 'vitest' } }), 'CLAUDE.md': '# Demo\n\nNotas del proyecto.\n' });
  const plan = planInit(dir, { language: 'es', fields: ['phase', 'stage'], epicTitle: 'Arranque' }, KIT);
  applyInit(dir, plan);

  it('crea estructura, scripts, skills, hooks y CI', () => {
    for (const f of [
      '.pm/config.json',
      '.pm/templates/story.md',
      '.pm/E00-arranque/README.md',
      '.pm/backlog.md',
      'scripts/pm/advance.mjs',
      'scripts/hooks/git-guard.mjs',
      '.githooks/pre-push',
      '.claude/skills/hu-nueva/SKILL.md',
      '.claude/skills/hu-adoptar-issue/SKILL.md',
      'docs/decisiones/plantilla.md',
      'docs/hallazgos/README.md',
      '.github/workflows/backlog.yml',
    ])
      expect(existsSync(path.join(dir, f))).toBe(true);
  });

  it('fusiona package.json, settings y CLAUDE.md sin pisar lo del proyecto', () => {
    const pkg = JSON.parse(read(dir, 'package.json'));
    expect(pkg.scripts.test).toBe('vitest');
    expect(pkg.scripts['pm:advance']).toBe('node scripts/pm/advance.mjs');
    expect(pkg.scripts['pm:avanzar']).toBe('node scripts/pm/advance.mjs');
    expect(pkg.scripts.prepare).toBe('git config core.hooksPath .githooks');
    const claude = read(dir, 'CLAUDE.md');
    expect(claude).toMatch(/^# Demo\n\nNotas del proyecto\./);
    expect(claude).toMatch(/\/hu-nueva/);
    const settings = JSON.parse(read(dir, '.claude/settings.json'));
    expect(settings.hooks.PostToolUse[0].hooks[0].command).toMatch(/pm-guard/);
    expect(settings.hooks.PreToolUse[0].hooks[0].command).toMatch(/git-guard/);
    expect(execFileSync('git', ['config', 'core.hooksPath'], { cwd: dir, encoding: 'utf8' }).trim()).toBe('.githooks');
  });

  it('las plantillas no dejan marcadores sin completar', () => {
    for (const f of ['.pm/templates/story.md', 'CLAUDE.md', '.claude/skills/hu-avanzar/SKILL.md', '.github/workflows/backlog.yml'])
      expect(read(dir, f)).not.toMatch(/\{\{/);
    expect(read(dir, '.pm/templates/story.md')).toMatch(/^fase: MVP +# MVP \| V1 \| DESPUES$/m);
  });

  it('el guard pasa recién instalado', () => {
    const r = node(dir, 'scripts/pm/check.mjs');
    expect(r.stdout).toMatch(/✓ \.pm\/ en orden/);
    expect(r.status).toBe(0);
  });

  it('próximo id, ciclo completo y reglas de avance', () => {
    expect(node(dir, 'scripts/pm/next-id.mjs', '--sin-github').stdout.trim()).toBe('HU-001');
    const file = newStory(dir, 'HU-001', 'E00-arranque');
    expect(node(dir, 'scripts/pm/next-id.mjs', '--sin-github').stdout.trim()).toBe('HU-002');
    const adv = (...a) => node(dir, 'scripts/pm/advance.mjs', 'HU-001', ...a, '--sin-github');
    expect(adv('EN_CURSO').stderr).toMatch(/REFINANDO → EN_CURSO no es una transición válida/);
    expect(adv('LISTO').status).toBe(0);
    const started = adv('EN_CURSO');
    expect(started.stdout).toMatch(/git switch -c hu-001-una-historia origin\/main/);
    expect(read(dir, path.relative(dir, file))).toMatch(/^rama: hu-001-una-historia/m);
    expect(adv('EN_REVIEW').stderr).toMatch(/1 criterio\(s\) sin tildar/);
    expect(adv('BLOQUEADO').stderr).toMatch(/necesita --nota/);
    writeFileSync(file, read(dir, path.relative(dir, file)).replace('- [ ] Dado', '- [x] Dado'));
    expect(adv('EN_REVIEW').status).toBe(0);
    expect(node(dir, 'scripts/pm/log.mjs', 'HU-001', 'Probado', '--sin-github').status).toBe(0);
    const text = read(dir, path.relative(dir, file));
    expect(text).toMatch(/- 2026-11-12 — Creada\. \(REFINANDO\)\n- \d{4}-\d\d-\d\d — Refinada/);
    expect(text).toMatch(/— Probado\n/);
    expect(read(dir, '.pm/backlog.md')).toMatch(/\| \[HU-001\]\(E00-arranque\/HU-001-una-historia\/README\.md\) \| EN_REVIEW \|/);
    expect(node(dir, 'scripts/pm/check.mjs').status).toBe(0);
  });

  it('el guard marca valores fuera de catálogo, dependencias y ciclos', () => {
    newStory(dir, 'HU-002', 'E00-arranque', { title: 'Otra', status: 'LISTO', extra: '- HU-003 — ciclo' });
    newStory(dir, 'HU-003', 'E00-arranque', { title: 'Tercera', status: 'BACKLOG', extra: '- HU-002 — ciclo\n- HU-099 — no existe' });
    const r = node(dir, 'scripts/pm/check.mjs');
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/HU-002 está LISTO pero depende de HU-003, que está BACKLOG/);
    expect(r.stderr).toMatch(/HU-003: depende de HU-099, que no existe/);
    expect(r.stderr).toMatch(/ciclo de dependencias/);
  });

  it('git-guard bloquea commits en main; pre-push también', () => {
    const r = spawnSync('node', ['scripts/hooks/git-guard.mjs'], {
      cwd: dir,
      encoding: 'utf8',
      input: JSON.stringify({ tool_input: { command: 'git commit -m x' }, cwd: dir }),
    });
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/No se commitea en `main`/);
    const p = spawnSync('sh', ['.githooks/pre-push'], { cwd: dir, encoding: 'utf8', input: 'a b refs/heads/main c\n' });
    expect(p.status).toBe(1);
  });

  it('correr el init otra vez no cambia nada', () => {
    const again = planInit(dir, { language: 'es', fields: ['phase', 'stage'], epicTitle: 'Arranque' }, KIT);
    expect(again.actions.filter((a) => a.op !== 'skip').map((a) => a.path)).toEqual([]);
  });
});

describe('init en inglés, sin GitHub ni CI', () => {
  const dir = project();
  applyInit(dir, planInit(dir, { language: 'en', storyPrefix: 'us', mainBranch: 'trunk', github: false, ci: false, fields: ['requirements'] }, KIT));

  it('usa el preset en inglés y omite lo de GitHub', () => {
    const cfg = JSON.parse(read(dir, '.pm/config.json'));
    expect(cfg).toMatchObject({ language: 'en', storyPrefix: 'US', mainBranch: 'trunk' });
    expect(existsSync(path.join(dir, '.claude/skills/story-new/SKILL.md'))).toBe(true);
    expect(existsSync(path.join(dir, '.claude/skills/story-adopt-issue/SKILL.md'))).toBe(false);
    expect(existsSync(path.join(dir, 'scripts/pm/sync-issue.mjs'))).toBe(false);
    expect(existsSync(path.join(dir, '.github/workflows/backlog.yml'))).toBe(false);
    expect(read(dir, 'CLAUDE.md')).not.toMatch(/Closes #/);
    expect(JSON.parse(read(dir, 'package.json')).scripts['pm:sync']).toBe(undefined);
  });

  it('ciclo en inglés con prefijo propio', () => {
    expect(node(dir, 'scripts/pm/next-id.mjs').stdout.trim()).toBe('US-001');
    newStory(dir, 'US-001', 'E00-foundations');
    expect(node(dir, 'scripts/pm/advance.mjs', 'US-001', 'READY').stdout).toMatch(/US-001: REFINING → READY/);
    expect(node(dir, 'scripts/pm/advance.mjs', 'US-001', 'IN_PROGRESS').stdout).toMatch(/git switch -c us-001-una-historia origin\/trunk/);
    expect(node(dir, 'scripts/pm/check.mjs').stdout).toMatch(/✓ \.pm\/ is consistent/);
  });
});

describe('render y CLAUDE.md', () => {
  it('render completa marcadores y bloques condicionales', () => {
    expect(render('{{a.b}}{{#on}} sí{{/on}}{{#off}} no{{/off}}', { a: { b: 'x' }, on: true, off: false })).toBe('x sí');
  });
  it('render falla con un marcador desconocido', () => {
    let error;
    try {
      render('{{nada}}', {});
    } catch (err) {
      error = err;
    }
    expect(error.message).toMatch(/Marcador sin valor/);
  });
  it('mergeClaude reemplaza su bloque y no toca el resto', () => {
    const block = '<!-- backlog-kit:begin -->\nnuevo\n<!-- backlog-kit:end -->\n';
    const prev = '# A\n\n<!-- backlog-kit:begin -->\nviejo\n<!-- backlog-kit:end -->\n\n## B\n';
    expect(mergeClaude(prev, block)).toBe('# A\n\n<!-- backlog-kit:begin -->\nnuevo\n<!-- backlog-kit:end -->\n\n## B\n');
  });
});

describe('proyecto con scripts propios', () => {
  it('no pisa scripts ajenos: el init se frena y no escribe nada', () => {
    const dir = project({ 'scripts/pm/check.mjs': '// mío\n' });
    const plan = planInit(dir, { language: 'es' }, KIT);
    expect(plan.conflicts).toEqual(['scripts/pm/check.mjs']);
    let error;
    try {
      applyInit(dir, plan);
    } catch (err) {
      error = err;
    }
    expect(error.message).toMatch(/no son de backlog-kit/);
    expect(read(dir, 'scripts/pm/check.mjs')).toBe('// mío\n');
    expect(existsSync(path.join(dir, '.pm/config.json'))).toBe(false);
  });
  it('en un proyecto ya inicializado, actualiza sus scripts', () => {
    const dir = project();
    applyInit(dir, planInit(dir, { language: 'es' }, KIT));
    writeFileSync(path.join(dir, 'scripts/pm/check.mjs'), '// viejo\n');
    const again = planInit(dir, { language: 'es' }, KIT);
    expect(again.actions.find((a) => a.path === 'scripts/pm/check.mjs').op).toBe('update');
  });
});
