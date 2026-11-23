// Módulos Kiwi y wiki, pm:merge, pm:adopt y el ledger de migraciones, contra servidores falsos.
import { execFile, execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, describe, it } from 'node:test';
import { expect } from './expect.mjs';
import { applyInit, planInit } from '../src/init/scaffold.mjs';
import { kiwiCases } from '../kit/scripts/lib/kiwi.mjs';
import { shortName } from '../kit/scripts/pm/wiki.mjs';

const KIT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'kit');
const git = (dir, ...a) => execFileSync('git', a, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const clean = { ...process.env, GITLAB_TOKEN: '', KIWI_URL: '', KIWI_USERNAME: '', KIWI_PASSWORD: '' };
const node = (dir, ...a) =>
  new Promise((resolve) => execFile('node', a, { cwd: dir, encoding: 'utf8', env: clean }, (err, stdout, stderr) => resolve({ status: err ? err.code ?? 1 : 0, stdout, stderr })));
const listen = (server) => new Promise((r) => server.listen(0, '127.0.0.1', () => r(`http://127.0.0.1:${server.address().port}`)));

describe('utilidades de los módulos', () => {
  it('shortName: sin acentos, sin barras, cortado por palabra (como wiki-sync.py)', () => {
    expect(shortName('Previsualización universal: bundles ZIP / Office→PDF y visor pdf.js con más texto')).toBe('Previsualizacion universal: bundles ZIP -');
    expect(shortName(undefined)).toBe('');
  });
  it('kiwiCases: columnas por encabezado, sin placeholders', () => {
    const body = '## Casos de prueba\n\n| # | Escenario | Esperado |\n|---|---|---|\n| 1 | Feliz | Anda |\n| 2 | … | … |\n';
    expect(kiwiCases(body, 'Casos de prueba')).toEqual([{ n: '1', scenario: 'Feliz', steps: '', expected: 'Anda' }]);
  });
});

/** Kiwi falso: JSON-RPC por http con sesión por cookie, en memoria. */
function fakeKiwi() {
  const db = { Classification: [], Product: [], Version: [], Category: [], TestPlan: [], PlanType: [{ id: 1, name: 'Function' }], TestCase: [], planCases: [], logins: 0 };
  let seq = 10;
  const match = (row, filter) =>
    Object.entries(filter).every(([k, v]) => (k.endsWith('__startswith') ? String(row[k.replace('__startswith', '')]).startsWith(v) : row[k] === v));
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const { method, params, id } = JSON.parse(raw);
      const reply = (result, headers = {}) => {
        res.writeHead(200, { 'Content-Type': 'application/json', ...headers });
        res.end(JSON.stringify({ jsonrpc: '2.0', id, result }));
      };
      if (method === 'Auth.login') {
        db.logins += 1;
        if (params[0] !== 'qa' || params[1] !== 'clave') return res.end(JSON.stringify({ jsonrpc: '2.0', id, error: { message: 'bad login' } }));
        return reply('sess', { 'Set-Cookie': 'sessionid=abc; Path=/' });
      }
      if (req.headers.cookie !== 'sessionid=abc') return res.end(JSON.stringify({ jsonrpc: '2.0', id, error: { message: 'no session' } }));
      const [model, op] = method.split('.');
      if (op === 'filter') return reply(db[model].filter((r) => match(r, params[0])));
      if (op === 'create') {
        const row = { id: seq++, ...params[0] };
        db[model].push(row);
        return reply(row);
      }
      if (method === 'TestCase.update') {
        Object.assign(db.TestCase.find((r) => r.id === params[0]), params[1]);
        return reply({});
      }
      if (method === 'TestPlan.add_case') {
        if (db.planCases.some(([p, c]) => p === params[0] && c === params[1])) return res.end(JSON.stringify({ jsonrpc: '2.0', id, error: { message: 'already added' } }));
        db.planCases.push(params);
        return reply({});
      }
      res.end(JSON.stringify({ jsonrpc: '2.0', id, error: { message: `sin método ${method}` } }));
    });
  });
  return { db, server };
}

/** GitLab falso: issues, labels, milestones, wiki y merge requests. */
function fakeGitlab() {
  const db = { issues: [], milestones: [{ id: 7, title: 'E00 - Base' }], notes: [], wiki: [{ slug: 'home', title: 'home', content: 'Inicio' }, { slug: 'Vieja', title: 'Vieja', content: 'x' }], mrs: [], merged: [] };
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const url = new URL(req.url, 'http://x');
      const body = raw ? JSON.parse(raw) : {};
      const send = (code, data) => {
        res.writeHead(code, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));
      };
      const base = '/api/v4/projects/grupo%2Frepo';
      const p = url.pathname.slice(base.length);
      const page = Number(url.searchParams.get('page') ?? 1);
      const paged = (l) => send(200, page === 1 ? l : []);
      let m;
      if (req.method === 'GET' && p === '/issues') return paged(db.issues);
      if ((m = p.match(/^\/issues\/(\d+)(\/notes)?$/))) {
        const issue = db.issues.find((i) => i.iid === Number(m[1]));
        if (m[2]) return db.notes.push({ iid: issue.iid, body: body.body }), send(201, {});
        if (req.method === 'GET') return send(200, issue);
        if (body.title !== undefined) issue.title = body.title;
        if (body.labels !== undefined) issue.labels = body.labels.split(',');
        if (body.description !== undefined) issue.description = body.description;
        return send(200, issue);
      }
      if (req.method === 'GET' && p === '/milestones') return paged(db.milestones);
      if (req.method === 'GET' && p === '/wikis') return send(200, url.searchParams.get('with_content') ? db.wiki : db.wiki.map(({ content, ...r }) => r));
      if (req.method === 'POST' && p === '/wikis') return db.wiki.push({ slug: body.title.replace(/ /g, '-'), title: body.title, content: body.content }), send(201, {});
      if ((m = p.match(/^\/wikis\/(.+)$/))) {
        const slug = decodeURIComponent(m[1]);
        const i = db.wiki.findIndex((w) => w.slug === slug);
        if (req.method === 'DELETE') return db.wiki.splice(i, 1), send(204, {});
        if (req.method === 'PUT') return Object.assign(db.wiki[i], { content: body.content }), send(200, {});
      }
      if ((m = p.match(/^\/merge_requests\/(\d+)(\/commits|\/merge)?$/))) {
        const mr = db.mrs.find((x) => x.iid === Number(m[1]));
        if (m[2] === '/commits') return paged([{ short_id: 'abc1234', title: 'HU-001: algo' }]);
        if (m[2] === '/merge') return db.merged.push(mr.iid), send(200, { state: 'merged' });
        return send(200, mr);
      }
      send(404, { message: `sin ruta ${req.method} ${p}` });
    });
  });
  return { db, server };
}

const README = (id, status, issue = '') => `---
id: ${id}
gitlab_issue: ${issue}
epica: E00
nombre: Historia ${id} con acentos: canción
estado: ${status}
prioridad: alta
ultima_actualizacion: 2026-11-01
---

# ${id}

## Historia

**Como** alguien **quiero** algo **para** algo.

## Criterios de aceptación

- [x] Dado x, entonces y

## Casos de prueba

| # | Escenario | Pasos | Resultado esperado |
|---|---|---|---|
| 1 | Camino feliz | Entrar | Ve el tablero |
| 2 | Sin permiso | Entrar sin rol | Ve el aviso |

## Log de progreso

- 2026-11-01 — Creada.
`;

describe('módulos contra servidores falsos', () => {
  const kiwi = fakeKiwi();
  const gl = fakeGitlab();
  let dir;
  before(async () => {
    const kiwiUrl = await listen(kiwi.server);
    const glUrl = await listen(gl.server);
    dir = mkdtempSync(path.join(tmpdir(), 'backlog-kit-mod-'));
    git(dir, 'init', '-q', '-b', 'main');
    git(dir, 'remote', 'add', 'origin', 'git@127.0.0.1:grupo/repo.git');
    applyInit(dir, planInit(dir, { language: 'es', forge: 'gitlab', gitlabUrl: glUrl, kiwi: true, kiwiProduct: 'demo', kiwiClassification: 'Empresa', wiki: true, epicTitle: 'Base' }, KIT));
    const cfgFile = path.join(dir, '.pm/config.json');
    const cfg = JSON.parse(readFileSync(cfgFile, 'utf8'));
    cfg.keys = { issue: 'gitlab_issue' };
    cfg.wiki = { ...cfg.wiki, prune: true, keep: ['home'] };
    cfg.migrations = { dir: 'db/migrations', pattern: '^(\\d{3})_[a-z0-9_]+\\.sql$', digits: 3, knownGaps: [2], ledger: "INSERT\\s+INTO\\s+app_migration\\s*\\(id\\)\\s*VALUES\\s*\\(\\s*'([^']+)'" };
    writeFileSync(cfgFile, JSON.stringify(cfg, null, 2));
    writeFileSync(path.join(dir, '.env.local'), `GITLAB_TOKEN=tok\nKIWI_URL=${kiwiUrl}/json-rpc/\nKIWI_USERNAME=qa\nKIWI_PASSWORD=clave\n`);
    mkdirSync(path.join(dir, '.pm/E00-base/HU-001-h'), { recursive: true });
    writeFileSync(path.join(dir, '.pm/E00-base/HU-001-h/README.md'), README('HU-001', 'LISTO'));
    mkdirSync(path.join(dir, 'db/migrations'), { recursive: true });
    writeFileSync(path.join(dir, 'db/migrations/001_base.sql'), "SELECT 1;\nINSERT INTO app_migration (id) VALUES ('001_base');\n");
    writeFileSync(path.join(dir, 'db/migrations/003_otra.sql'), "SELECT 1;\nINSERT INTO app_migration (id) VALUES ('003_otra');\n");
    execFileSync('node', ['scripts/pm/backlog.mjs', '--quiet'], { cwd: dir });
  });
  after(() => {
    kiwi.server.close();
    gl.server.close();
  });

  it('el init instala pm:kiwi, pm:wiki, pm:merge, pm:adopt y la skill doc-wiki', () => {
    const pkg = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8'));
    for (const s of ['pm:kiwi', 'pm:wiki', 'pm:merge', 'pm:adopt', 'pm:setup-forge']) expect(Object.keys(pkg.scripts)).toContain(s);
    expect(readFileSync(path.join(dir, '.claude/skills/doc-wiki/SKILL.md'), 'utf8')).toMatch(/wiki de GitLab/);
    expect(readFileSync(path.join(dir, '.claude/skills/hu-avanzar/SKILL.md'), 'utf8')).toMatch(/Kiwi TCMS/);
    expect(readFileSync(path.join(dir, '.claude/skills/hu-adoptar-issue/SKILL.md'), 'utf8')).toMatch(/pm:adopt/);
  });

  it('pm:kiwi --dry-run no escribe nada', async () => {
    const r = await node(dir, 'scripts/pm/kiwi.mjs', 'HU-001', '--dry-run');
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/2 caso\(s\).*2 nuevos.*dry-run/);
    expect(kiwi.db.TestCase.length).toBe(0);
    expect(kiwi.db.Product.length).toBe(0);
  });

  it('pm:kiwi crea plan, categoría y casos; la segunda vez actualiza sin duplicar', async () => {
    expect((await node(dir, 'scripts/pm/kiwi.mjs', 'HU-001')).status).toBe(0);
    expect(kiwi.db.Product[0].name).toBe('demo');
    expect(kiwi.db.Classification[0].name).toBe('Empresa');
    expect(kiwi.db.TestPlan[0].name).toBe('E00 — Base');
    expect(kiwi.db.TestCase.map((c) => c.summary)).toEqual(['HU-001 #1 · Camino feliz', 'HU-001 #2 · Sin permiso']);
    expect(kiwi.db.TestCase[0].text).toMatch(/\*\*Pasos\*\*\n\nEntrar/);
    const again = await node(dir, 'scripts/pm/kiwi.mjs', 'HU-001');
    expect(again.stdout).toMatch(/0 nuevos, 2 actualizados/);
    expect(kiwi.db.TestCase.length).toBe(2);
    expect(kiwi.db.planCases.length).toBe(2);
  });

  it('pm:advance sincroniza Kiwi, y si Kiwi falla avisa sin frenar el cambio de estado', async () => {
    const file = path.join(dir, '.pm/E00-base/HU-001-h/README.md');
    writeFileSync(file, readFileSync(file, 'utf8').replace('| 2 | Sin permiso', '| 3 | Tercero | Algo | Otra cosa |\n| 2 | Sin permiso'));
    const ok = await node(dir, 'scripts/pm/advance.mjs', 'HU-001', 'EN_CURSO', '--sin-github');
    expect(ok.status).toBe(0);
    expect(kiwi.db.TestCase.length).toBe(3);
    const env = readFileSync(path.join(dir, '.env.local'), 'utf8');
    writeFileSync(path.join(dir, '.env.local'), env.replace('KIWI_PASSWORD=clave', 'KIWI_PASSWORD=mala'));
    const bad = await node(dir, 'scripts/pm/advance.mjs', 'HU-001', 'LISTO', '--sin-github');
    expect(bad.status).toBe(0);
    expect(bad.stderr).toMatch(/⚠ Kiwi: .*bad login/);
    expect(readFileSync(file, 'utf8')).toMatch(/estado: LISTO/);
    writeFileSync(path.join(dir, '.env.local'), env);
  });

  it('pm:wiki --dry-run no toca la wiki; después crea, borra lo viejo y conserva home', async () => {
    const dry = await node(dir, 'scripts/pm/wiki.mjs', '--dry-run');
    expect(dry.status).toBe(0);
    expect(dry.stdout).toMatch(/- Vieja/);
    expect(gl.db.wiki.length).toBe(2);
    expect((await node(dir, 'scripts/pm/wiki.mjs')).status).toBe(0);
    const titles = gl.db.wiki.map((w) => w.title);
    expect(titles).toContain('Historias de Usuario/E00/HU-001 Historia HU-001 con acentos: cancion');
    expect(titles).toContain('Epicas/E00 Base');
    expect(titles).toContain('Backlog');
    expect(titles).toContain('home');
    expect(titles).not.toContain('Vieja');
    const again = await node(dir, 'scripts/pm/wiki.mjs');
    expect(again.stdout).toMatch(/0 nuevas · 0 actualizadas · 0 borradas/);
  });

  it('pm:wiki con prune no corre si un README no se lee (borraría su página)', async () => {
    mkdirSync(path.join(dir, '.pm/E00-base/HU-009-roto'), { recursive: true });
    writeFileSync(path.join(dir, '.pm/E00-base/HU-009-roto/README.md'), '---\nid: HU-009\nid: HU-009\n---\n');
    const before = gl.db.wiki.length;
    const r = await node(dir, 'scripts/pm/wiki.mjs');
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/HU-009-roto\/README.md: Clave repetida/);
    expect(gl.db.wiki.length).toBe(before);
    execFileSync('rm', ['-r', path.join(dir, '.pm/E00-base/HU-009-roto')]);
  });

  it('pm:merge: frena con el pipeline en rojo, --dry-run lista commits, y mergea en verde', async () => {
    gl.db.mrs.push({ iid: 5, title: 'HU-001', state: 'opened', source_branch: 'hu-001-h', target_branch: 'main', detailed_merge_status: 'mergeable', head_pipeline: { status: 'failed' }, sha: 'abc' });
    const red = await node(dir, 'scripts/pm/merge.mjs', '5');
    expect(red.status).toBe(1);
    expect(red.stderr).toMatch(/ci=failed/);
    gl.db.mrs[0].head_pipeline.status = 'success';
    const dry = await node(dir, 'scripts/pm/merge.mjs', '5', '--dry-run');
    expect(dry.stdout).toMatch(/abc1234 HU-001: algo/);
    expect(gl.db.merged).toEqual([]);
    expect((await node(dir, 'scripts/pm/merge.mjs', '5')).status).toBe(0);
    expect(gl.db.merged).toEqual([5]);
  });

  it('pm:adopt lista los issues sin historia y adopta uno', async () => {
    gl.db.issues.push({ iid: 40, title: 'Agregar exportación', description: 'Pedido', state: 'opened', labels: ['equipo::web'] });
    const list = JSON.parse((await node(dir, 'scripts/pm/adopt.mjs', '--listar', '--json')).stdout);
    expect(list.map((i) => i.number)).toEqual([40]);
    mkdirSync(path.join(dir, '.pm/E00-base/HU-002-h'), { recursive: true });
    writeFileSync(path.join(dir, '.pm/E00-base/HU-002-h/README.md'), README('HU-002', 'REFINANDO', 40));
    const r = await node(dir, 'scripts/pm/adopt.mjs', '40', 'HU-002');
    expect(r.status).toBe(0);
    const issue = gl.db.issues.find((i) => i.iid === 40);
    expect(issue.title).toBe('[HU-002] Historia HU-002 con acentos: canción');
    expect(issue.labels).toContain('equipo::web');
    expect(issue.labels).toContain('estado::REFINANDO');
    expect(gl.db.notes.at(-1).body).toMatch(/Adoptado como HU-002/);
  });

  it('migraciones: huecos conocidos pasan, el ledger tiene que coincidir con el archivo', async () => {
    execFileSync('node', ['scripts/pm/backlog.mjs', '--quiet'], { cwd: dir });
    expect((await node(dir, 'scripts/pm/check.mjs')).status).toBe(0);
    writeFileSync(path.join(dir, 'db/migrations/005_mal.sql'), "INSERT INTO app_migration (id) VALUES ('005_otro');\n");
    writeFileSync(path.join(dir, 'db/migrations/006_sin.sql'), 'SELECT 1;\n');
    const r = await node(dir, 'scripts/pm/check.mjs');
    expect(r.stderr + r.stdout).toMatch(/005_mal\.sql: registra el id '005_otro'/);
    expect(r.stderr + r.stdout).toMatch(/006_sin\.sql: no registra su id/);
    expect((r.stderr + r.stdout).match(/hueco/g).length).toBe(1);
  });
});
