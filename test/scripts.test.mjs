// Scripts de flujo: pm:start, pm:next, pm:stats, prefijo de commit y cuerpo del PR.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { expect } from './expect.mjs';
import { applyInit, planInit } from '../src/init/scaffold.mjs';

const KIT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'kit');
const git = (dir, ...a) => execFileSync('git', a, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const node = (dir, ...a) => spawnSync('node', a, { cwd: dir, encoding: 'utf8' });

function story(id, { status = 'LISTO', prio = 'media', deps = [], log = [], criteria = '- [ ] Dado x, entonces y', etapa = '' } = {}) {
  return `---
id: ${id}
epica: E00
nombre: Historia ${id}
tipo: feature
estado: ${status}
prioridad: ${prio}
estimacion: S
etapa: ${etapa}
github_issue:
rama:
ultima_actualizacion: 2026-11-01
---

# ${id}

## Historia

**Como** alguien **quiero** algo **para** algo.

## Criterios de aceptación

${criteria}

## Dependencias

${deps.map((d) => `- ${d}`).join('\n') || '- (ninguna)'}

## Log de progreso

- 2026-11-01 — Creada. (REFINANDO)
${log.join('\n')}
`;
}

function setup(stories) {
  const dir = mkdtempSync(path.join(tmpdir(), 'backlog-kit-s-'));
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.email', 't@t');
  git(dir, 'config', 'user.name', 't');
  applyInit(dir, planInit(dir, { language: 'es', github: false, fields: ['stage'], epicTitle: 'Base' }, KIT));
  for (const [id, opts] of Object.entries(stories)) {
    const folder = path.join(dir, '.pm/E00-base', `${id}-h`);
    mkdirSync(folder, { recursive: true });
    writeFileSync(path.join(folder, 'README.md'), story(id, opts));
  }
  node(dir, 'scripts/pm/backlog.mjs', '--quiet');
  git(dir, 'add', '-A');
  git(dir, '-c', 'core.hooksPath=/dev/null', 'commit', '-q', '-m', 'base');
  return dir;
}

describe('pm:next', () => {
  it('review primero, después lo listo libre por lo que destraba, y lo que espera aparte', () => {
    const dir = setup({
      'HU-001': { status: 'EN_REVIEW' },
      'HU-002': { status: 'LISTO', prio: 'baja' },
      'HU-003': { status: 'LISTO', prio: 'alta' },
      'HU-004': { status: 'LISTO', deps: ['HU-002'] },
      'HU-005': { status: 'BACKLOG', deps: ['HU-004'] },
      'HU-006': { status: 'LISTO', deps: ['HU-001'] },
    });
    const out = JSON.parse(node(dir, 'scripts/pm/next.mjs', '--json').stdout);
    expect(out.review.map((v) => v.id)).toEqual(['HU-001']);
    // HU-002 destraba 2 (HU-004 y HU-005): va antes que HU-003 aunque tenga menos prioridad.
    expect(out.next.map((v) => v.id)).toEqual(['HU-002', 'HU-003', 'HU-006']);
    expect(out.waiting.map((v) => [v.id, v.pending])).toEqual([['HU-004', ['HU-002']]]);
    expect(node(dir, 'scripts/pm/next.mjs').stdout).toMatch(/HU-002  Historia HU-002  \(baja, destraba 2\)/);
  });
});

describe('pm:stats', () => {
  it('días por estado, cerradas por semana y antigüedad', () => {
    const dir = setup({
      'HU-001': { status: 'HECHO', log: ['- 2026-11-02 — x (REFINANDO → LISTO)', '- 2026-11-04 — x (LISTO → EN_CURSO)', '- 2026-11-09 — x (EN_CURSO → EN_REVIEW)', '- 2026-11-10 — x (EN_REVIEW → HECHO)'] },
      'HU-002': { status: 'EN_CURSO', log: ['- 2026-11-02 — x (REFINANDO → LISTO)', '- 2026-11-06 — x (LISTO → EN_CURSO)'] },
    });
    const s = JSON.parse(node(dir, 'scripts/pm/stats.mjs', '--json').stdout);
    expect(s.perState.LISTO).toEqual({ avgDays: 3, samples: 2 });
    expect(s.perState.EN_CURSO.samples).toBe(2);
    expect(s.doneByWeek).toEqual([{ week: '2026-W46', count: 1 }]);
    expect(s.aging[0].id).toBe('HU-002');
  });
});

describe('pm:start y prefijo de commit', () => {
  it('pasa a en curso, crea la rama y los commits llevan el id', () => {
    const dir = setup({ 'HU-001': { status: 'LISTO' } });
    const r = node(dir, 'scripts/pm/start.mjs', 'HU-001');
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/LISTO → EN_CURSO/);
    expect(r.stdout).toMatch(/rama hu-001-h creada desde main/);
    expect(git(dir, 'branch', '--show-current')).toBe('hu-001-h');
    expect(node(dir, 'scripts/pm/start.mjs', 'HU-001').stdout).toMatch(/ya estás en hu-001-h/);
    writeFileSync(path.join(dir, 'x.txt'), 'x');
    git(dir, 'add', 'x.txt');
    git(dir, 'commit', '-q', '-m', 'agrega x');
    expect(git(dir, 'log', '-1', '--format=%s')).toBe('HU-001: agrega x');
    writeFileSync(path.join(dir, 'y.txt'), 'y');
    git(dir, 'add', 'y.txt');
    git(dir, 'commit', '-q', '-m', 'HU-001: ya tiene id');
    expect(git(dir, 'log', '-1', '--format=%s')).toBe('HU-001: ya tiene id');
  });
  it('pm:start respeta las reglas de avance', () => {
    const dir = setup({ 'HU-001': { status: 'BACKLOG' } });
    const r = node(dir, 'scripts/pm/start.mjs', 'HU-001');
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/BACKLOG → EN_CURSO no es una transición válida/);
  });
});

describe('pm:pr', () => {
  it('arma el cuerpo con historia, criterios, log y Closes', async () => {
    const dir = setup({ 'HU-001': { status: 'EN_REVIEW', criteria: '- [x] Dado a, entonces b', log: ['- 2026-11-10 — Probado a mano'] } });
    const file = path.join(dir, '.pm/E00-base/HU-001-h/README.md');
    writeFileSync(file, readFileSync(file, 'utf8').replace('github_issue:', 'github_issue: 42'));
    const { createPm } = await import(path.join(dir, 'scripts/lib/pm.mjs'));
    const { messages } = await import(path.join(dir, 'scripts/lib/messages.mjs'));
    const { prBody } = await import(path.join(KIT, 'scripts/pm/pr.mjs'));
    const pm = { ...createPm(dir), t: messages('es') };
    const body = prBody(pm, pm.findStory('HU-001'));
    expect(body).toMatch(/## Resumen\n\n\*\*Como\*\* alguien/);
    expect(body).toMatch(/## Criterios de aceptación\n\n- \[x\] Dado a, entonces b/);
    expect(body).toMatch(/## Cómo se verificó\n\n.*\n- 2026-11-10 — Probado a mano/);
    expect(body).toMatch(/Closes #42$/);
  });
});

describe('pm:new', () => {
  it('crea la historia desde la plantilla con el próximo id y pasa el guard', () => {
    const dir = setup({ 'HU-001': { status: 'LISTO' } });
    const r = node(dir, 'scripts/pm/new.mjs', '--epic', 'E00', '--title', 'Login con Google', '--priority', 'alta');
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/HU-002 creada en \.pm\/E00-base\/HU-002-login-con-google\/README\.md/);
    const text = readFileSync(path.join(dir, '.pm/E00-base/HU-002-login-con-google/README.md'), 'utf8');
    expect(text).toMatch(/^id: HU-002$/m);
    expect(text).toMatch(/^nombre: Login con Google$/m);
    expect(text).toMatch(/^prioridad: alta/m);
    expect(text).toMatch(/^# HU-002 — Login con Google$/m);
    expect(text).not.toMatch(/HU-NNN|YYYY-MM-DD/);
    expect(node(dir, 'scripts/pm/check.mjs').status).toBe(0);
    expect(node(dir, 'scripts/pm/new.mjs', '--epic', 'E09', '--title', 'x').stderr).toMatch(/No existe la épica E09/);
  });
});
