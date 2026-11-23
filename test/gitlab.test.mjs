// GitLab: la librería de forge y los scripts contra un GitLab falso (servidor HTTP local).
import { execFile, execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, describe, it } from 'node:test';
import { expect } from './expect.mjs';
import { applyInit, planInit } from '../src/init/scaffold.mjs';
import { ciState, labelFor, projectFromRemote } from '../kit/scripts/lib/forge.mjs';
import { resolveConfig } from '../kit/scripts/lib/config.mjs';

const KIT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'kit');
const git = (dir, ...a) => execFileSync('git', a, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
// Asíncrono: con spawnSync el servidor falso no podría contestar.
const node = (dir, ...a) =>
  new Promise((resolve) => execFile('node', a, { cwd: dir, encoding: 'utf8', env: { ...process.env, GITLAB_TOKEN: '' } }, (err, stdout, stderr) => resolve({ status: err ? err.code ?? 1 : 0, stdout, stderr })));

describe('forge: utilidades', () => {
  it('proyecto desde el remote', () => {
    expect(projectFromRemote('ssh://git@192.168.1.59:32768/parasoftlab/ps-business-manager.git')).toBe('parasoftlab/ps-business-manager');
    expect(projectFromRemote('git@gitlab.com:grupo/sub/repo.git')).toBe('grupo/sub/repo');
    expect(projectFromRemote('https://gitlab.example.com/grupo/repo')).toBe('grupo/repo');
    expect(projectFromRemote('https://user:tok@gitlab.example.com:8443/grupo/repo.git')).toBe('grupo/repo');
  });
  it('semáforo de CI para GitHub y GitLab', () => {
    expect(ciState('success')).toBe('pass');
    expect(ciState('failed')).toBe('fail');
    expect(ciState('running')).toBe('pending');
    expect(ciState('')).toBe('none');
    expect(ciState([{ conclusion: 'SUCCESS' }])).toBe('pass');
    expect(ciState([])).toBe('none');
  });
  it('labels con "::" en GitLab y ":" en GitHub, salvo que el config diga otra cosa', () => {
    expect(labelFor(resolveConfig({ forge: { provider: 'gitlab' } }), 'estado', 'LISTO')).toBe('estado::LISTO');
    expect(labelFor(resolveConfig({}), 'estado', 'LISTO')).toBe('estado:LISTO');
    expect(labelFor(resolveConfig({ forge: { provider: 'gitlab' }, labels: { separator: '/' } }), 'estado', 'LISTO')).toBe('estado/LISTO');
  });
});

/** GitLab falso: lo justo de la API v4 que usan los scripts, en memoria. */
function fakeGitlab() {
  const db = { issues: [], labels: [], milestones: [], notes: [], mrs: [], tokens: [] };
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      db.tokens.push(req.headers['private-token']);
      const url = new URL(req.url, 'http://x');
      const body = raw ? JSON.parse(raw) : {};
      const send = (code, data) => {
        res.writeHead(code, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));
      };
      const base = '/api/v4/projects/grupo%2Frepo';
      if (!url.pathname.startsWith(base)) return send(404, { message: `no: ${url.pathname}` });
      const p = url.pathname.slice(base.length);
      const page = Number(url.searchParams.get('page') ?? 1);
      const paged = (list) => send(200, page === 1 ? list : []);
      const m = p.match(/^\/issues\/(\d+)(\/notes)?$/);
      if (req.method === 'GET' && p === '/issues') return paged(db.issues);
      if (req.method === 'POST' && p === '/issues') {
        const issue = { iid: db.issues.length + 1, title: body.title, description: body.description, state: 'opened', labels: body.labels.split(','), milestone_id: body.milestone_id };
        db.issues.push(issue);
        return send(201, issue);
      }
      if (m) {
        const issue = db.issues.find((i) => i.iid === Number(m[1]));
        if (!issue) return send(404, { message: '404 Not found' });
        if (m[2]) {
          db.notes.push({ iid: issue.iid, body: body.body });
          return send(201, {});
        }
        if (req.method === 'GET') return send(200, issue);
        if (body.title !== undefined) issue.title = body.title;
        if (body.description !== undefined) issue.description = body.description;
        if (body.labels !== undefined) issue.labels = body.labels.split(',');
        if (body.state_event) issue.state = body.state_event === 'close' ? 'closed' : 'opened';
        return send(200, issue);
      }
      if (req.method === 'GET' && p === '/labels') return paged(db.labels);
      if (req.method === 'POST' && p === '/labels') {
        if (!/^#[0-9a-f]{6}$/i.test(body.color)) return send(400, { message: 'color inválido' });
        db.labels.push(body);
        return send(201, body);
      }
      if (req.method === 'GET' && p === '/milestones') return paged(db.milestones);
      if (req.method === 'POST' && p === '/milestones') {
        const ms = { id: 100 + db.milestones.length, ...body };
        db.milestones.push(ms);
        return send(201, ms);
      }
      if (req.method === 'GET' && p === '/merge_requests') return send(200, db.mrs.filter((x) => x.source_branch === url.searchParams.get('source_branch')));
      send(404, { message: `sin ruta ${req.method} ${p}` });
    });
  });
  return { db, server };
}

function storyReadme(id, status, extra = '') {
  return `---
id: ${id}
gitlab_issue:
epica: E00
nombre: Historia ${id} con #12 en el nombre
estado: ${status}
prioridad: alta
estimacion: S
ultima_actualizacion: 2026-11-01
---

# ${id}

## Historia

**Como** alguien **quiero** algo **para** algo.

## Criterios de aceptación

- [x] Dado x, entonces y

## Log de progreso

- 2026-11-01 — Creada.
${extra}`;
}

describe('scripts contra GitLab', () => {
  const { db, server } = fakeGitlab();
  let dir;
  before(async () => {
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const url = `http://127.0.0.1:${server.address().port}`;
    dir = mkdtempSync(path.join(tmpdir(), 'backlog-kit-gl-'));
    git(dir, 'init', '-q', '-b', 'main');
    git(dir, 'remote', 'add', 'origin', 'ssh://git@127.0.0.1:2222/grupo/repo.git');
    applyInit(dir, planInit(dir, { language: 'es', forge: 'gitlab', gitlabUrl: url, epicTitle: 'Base', skills: true }, KIT));
    // Las claves de este proyecto: el issue va en gitlab_issue y la épica se etiqueta por carpeta.
    const cfgFile = path.join(dir, '.pm/config.json');
    const cfg = JSON.parse(readFileSync(cfgFile, 'utf8'));
    writeFileSync(cfgFile, JSON.stringify({ ...cfg, keys: { issue: 'gitlab_issue' }, labels: { epic: 'folder' } }, null, 2));
    writeFileSync(path.join(dir, '.env.local'), 'OTRA=1\nGITLAB_TOKEN="tok-secreto"\n');
    for (const [id, status] of [['HU-001', 'LISTO'], ['HU-002', 'BACKLOG']]) {
      mkdirSync(path.join(dir, '.pm/E00-base', `${id}-h`), { recursive: true });
      writeFileSync(path.join(dir, '.pm/E00-base', `${id}-h/README.md`), storyReadme(id, status));
    }
    // Un issue escrito a mano, con un label ajeno al kit, que sync no tiene que pisar.
    db.issues.push({ iid: 1, title: '[HU-002] Historia a mano', description: 'Texto escrito por una persona', state: 'opened', labels: ['equipo::web', 'estado::BACKLOG'] });
  });
  after(() => server.close());

  it('el init de GitLab: config, CI de GitLab y sin skills que usan gh', () => {
    const cfg = JSON.parse(readFileSync(path.join(dir, '.pm/config.json'), 'utf8'));
    expect(cfg.forge.provider).toBe('gitlab');
    expect(readFileSync(path.join(dir, '.gitlab/ci/backlog.yml'), 'utf8')).toMatch(/node scripts\/pm\/check\.mjs/);
    const settings = readFileSync(path.join(dir, '.claude/settings.json'), 'utf8');
    expect(settings).not.toMatch(/gh issue/);
    expect(readFileSync(path.join(dir, '.claude/skills/hu-nueva/SKILL.md'), 'utf8')).toMatch(/issue de GitLab/);
  });

  it('pm:setup-github crea labels "::" con color #rrggbb y el milestone de la épica', async () => {
    const r = await node(dir, 'scripts/pm/setup-github.mjs');
    expect(r.status).toBe(0);
    expect(db.labels.map((l) => l.name)).toContain('estado::LISTO');
    expect(db.labels.map((l) => l.name)).toContain('epica::E00-base');
    expect(db.milestones[0].title).toBe('E00 — Base');
    const again = await node(dir, 'scripts/pm/setup-github.mjs');
    expect(again.stdout).not.toMatch(/^\+/m);
  });

  it('pm:sync crea el issue, guarda el número y el token no aparece en la salida', async () => {
    const r = await node(dir, 'scripts/pm/sync-issue.mjs', 'HU-001');
    expect(r.status).toBe(0);
    const issue = db.issues.find((i) => i.title.startsWith('[HU-001]'));
    expect(issue.title).toBe('[HU-001] Historia HU-001 con #12 en el nombre');
    expect(issue.labels).toEqual(['estado::LISTO', 'epica::E00-base', 'prioridad::alta']);
    expect(issue.milestone_id).toBe(100);
    expect(issue.description).toMatch(/\/-\/blob\/main\/.pm\/E00-base\/HU-001-h\/README.md/);
    expect(readFileSync(path.join(dir, '.pm/E00-base/HU-001-h/README.md'), 'utf8')).toMatch(new RegExp(`gitlab_issue: ${issue.iid}`));
    expect(r.stdout + r.stderr).not.toMatch(/tok-secreto/);
    expect(db.tokens.every((t) => t === 'tok-secreto')).toBe(true);
  });

  it('pm:advance cambia los labels, conserva los ajenos, no pisa una descripción escrita a mano y comenta', async () => {
    const file = path.join(dir, '.pm/E00-base/HU-002-h/README.md');
    writeFileSync(file, readFileSync(file, 'utf8').replace('gitlab_issue:', 'gitlab_issue: 1'));
    const r = await node(dir, 'scripts/pm/advance.mjs', 'HU-002', 'REFINANDO');
    expect(r.status).toBe(0);
    const issue = db.issues.find((i) => i.iid === 1);
    expect(issue.labels).toEqual(['equipo::web', 'estado::REFINANDO', 'epica::E00-base', 'prioridad::alta']);
    expect(issue.description).toBe('Texto escrito por una persona');
    expect(r.stdout).toMatch(/no se tocó/);
    expect(db.notes.at(-1).body).toMatch(/BACKLOG → REFINANDO/);
  });

  it('pm:advance a HECHO cierra el issue', async () => {
    for (const to of ['EN_CURSO', 'EN_REVIEW', 'HECHO']) expect((await node(dir, 'scripts/pm/advance.mjs', 'HU-001', to)).status).toBe(0);
    expect(db.issues.find((i) => i.title.startsWith('[HU-001]')).state).toBe('closed');
  });

  it('pm:log comenta en el issue', async () => {
    expect((await node(dir, 'scripts/pm/log.mjs', 'HU-002', 'Avance con US$1.000')).status).toBe(0);
    expect(db.notes.at(-1).body).toMatch(/Avance con US\$1\.000/);
  });

  it('pm:issue resuelve y --verificar audita', async () => {
    expect((await node(dir, 'scripts/pm/issue.mjs', 'HU-002')).stdout.trim()).toBe('1');
    const v = await node(dir, 'scripts/pm/issue.mjs', '--verificar');
    expect(v.status).toBe(0);
  });

  it('pm:next-id mira los issues de GitLab', async () => {
    db.issues.push({ iid: 99, title: '[HU-007] De otra sesión', description: '', state: 'opened', labels: [] });
    expect((await node(dir, 'scripts/pm/next-id.mjs')).stdout.trim()).toBe('HU-008');
  });

  it('sin token: error claro, sin tocar nada', async () => {
    writeFileSync(path.join(dir, '.env.local'), 'OTRA=1\n');
    const r = await node(dir, 'scripts/pm/sync-issue.mjs', 'HU-002');
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/falta el token en GITLAB_TOKEN/);
  });
});
