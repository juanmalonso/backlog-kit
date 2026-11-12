// Integración con Claude Code: hooks de contexto y recordatorio, statusline, servidor MCP, init en
// modo proyecto y plugin, y plugin generado al día.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { expect } from './expect.mjs';
import { applyInit, planInit } from '../src/init/scaffold.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const KIT = path.join(ROOT, 'kit');
const git = (dir, ...a) => execFileSync('git', a, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const hook = (dir, name, input, env = {}) =>
  spawnSync('node', [path.join(dir, 'scripts/claude', `${name}.mjs`)], { cwd: dir, encoding: 'utf8', input: JSON.stringify(input), env: { ...process.env, CLAUDE_PROJECT_DIR: dir, ...env } });

function project(opts = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'bk-claude-'));
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.email', 't@t');
  git(dir, 'config', 'user.name', 't');
  applyInit(dir, planInit(dir, { language: 'es', github: false, epicTitle: 'Base', ...opts }, KIT));
  const folder = path.join(dir, '.pm/E00-base/HU-001-algo');
  mkdirSync(folder, { recursive: true });
  writeFileSync(
    path.join(folder, 'README.md'),
    `---\nid: HU-001\nepica: E00\nnombre: Algo útil\ntipo: feature\nestado: EN_CURSO\nprioridad: alta\nestimacion: S\ngithub_issue:\nrama: hu-001-algo\nultima_actualizacion: 2026-11-01\n---\n\n# HU-001 — Algo útil\n\n## Historia\n\nComo alguien quiero algo.\n\n## Criterios de aceptación\n\n- [x] Dado a, entonces b\n- [ ] Dado c, entonces d\n\n## Preguntas pendientes\n\n- ¿Rojo o azul?\n\n## Dependencias\n\n- (ninguna)\n\n## Log de progreso\n\n- 2026-11-01 — Creada. (REFINANDO)\n`,
  );
  execFileSync('node', ['scripts/pm/backlog.mjs', '--quiet'], { cwd: dir });
  git(dir, 'add', '-A');
  git(dir, '-c', 'core.hooksPath=/dev/null', 'commit', '-q', '-m', 'base');
  return dir;
}

describe('hooks de contexto', () => {
  const dir = project();

  it('SessionStart en la rama de una historia: estado, criterios pendientes, preguntas y log', () => {
    git(dir, 'switch', '-q', '-c', 'hu-001-algo');
    const out = JSON.parse(hook(dir, 'session-context', { source: 'startup', cwd: dir }).stdout);
    const text = out.hookSpecificOutput.additionalContext;
    expect(out.hookSpecificOutput.hookEventName).toBe('SessionStart');
    expect(text).toMatch(/la rama `hu-001-algo` es de HU-001 — Algo útil/);
    expect(text).toMatch(/criterios 1\/2/);
    expect(text).toMatch(/- \[ \] Dado c, entonces d/);
    expect(text).toMatch(/¿Rojo o azul\?/);
    git(dir, 'switch', '-q', 'main');
  });

  it('SessionStart fuera de una historia: lo activo', () => {
    const text = JSON.parse(hook(dir, 'session-context', { cwd: dir }).stdout).hookSpecificOutput.additionalContext;
    expect(text).toMatch(/esta rama no es de ninguna historia/);
    expect(text).toMatch(/HU-001 \(EN_CURSO, hu-001-algo\)/);
  });

  it('UserPromptSubmit agrega el README de la historia nombrada; sin id, nada', () => {
    const out = JSON.parse(hook(dir, 'prompt-context', { prompt: 'seguí con hu-001 por favor', cwd: dir }).stdout);
    expect(out.hookSpecificOutput.additionalContext).toMatch(/# HU-001 — Algo útil/);
    expect(hook(dir, 'prompt-context', { prompt: 'hola', cwd: dir }).stdout).toBe('');
    expect(hook(dir, 'prompt-context', { prompt: 'mirá HU-999', cwd: dir }).stdout).toBe('');
  });

  it('Stop: con código tocado y sin log de hoy, sigue una vez; después no', () => {
    git(dir, 'switch', '-q', '-c', 'hu-001-algo-stop');
    const file = path.join(dir, '.pm/E00-base/HU-001-algo/README.md');
    writeFileSync(file, readFileSync(file, 'utf8').replace('rama: hu-001-algo', 'rama: hu-001-algo-stop'));
    writeFileSync(path.join(dir, 'codigo.js'), 'x');
    const session = `s-${Date.now()}`;
    const first = hook(dir, 'stop-check', { session_id: session, cwd: dir });
    const out = JSON.parse(first.stdout);
    expect(out.decision).toBe('block');
    expect(out.reason).toMatch(/npm run pm:log -- HU-001/);
    expect(hook(dir, 'stop-check', { session_id: session, cwd: dir }).stdout).toBe('');
    expect(hook(dir, 'stop-check', { session_id: `${session}-b`, stop_hook_active: true, cwd: dir }).stdout).toBe('');
    git(dir, 'switch', '-q', '-f', 'main');
  });

  it('statusline: la historia de la rama o el resumen', () => {
    git(dir, 'switch', '-q', 'hu-001-algo');
    expect(hook(dir, 'statusline', { workspace: { current_dir: dir } }).stdout).toBe('HU-001 · EN_CURSO · 1/2  Algo útil');
    git(dir, 'switch', '-q', 'main');
    expect(hook(dir, 'statusline', { workspace: { current_dir: dir } }).stdout).toMatch(/^main · EN_CURSO 1 · EN_REVIEW 0 · LISTO 0$/);
  });
});

describe('servidor MCP', () => {
  const dir = project();
  const rpc = (msgs) => {
    const r = spawnSync('node', [path.join(dir, 'scripts/mcp/server.mjs')], { cwd: dir, encoding: 'utf8', input: msgs.map((m) => JSON.stringify(m)).join('\n') + '\n' });
    return r.stdout.trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
  };

  it('handshake, tools/list y lectura', () => {
    const [init, list, get, next] = rpc([
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 't', version: '1' } } },
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      { jsonrpc: '2.0', id: 2, method: 'tools/list' },
      { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'story_get', arguments: { id: 'HU-001' } } },
      { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'story_next', arguments: {} } },
    ]);
    expect(init.result.protocolVersion).toBe('2025-11-25');
    expect(init.result.capabilities).toEqual({ tools: {} });
    expect(list.result.tools.map((t) => t.name)).toContain('story_advance');
    const story = JSON.parse(get.result.content[0].text);
    expect(story.title).toBe('Algo útil');
    expect(story.criteria).toEqual([
      { index: 0, checked: true, text: 'Dado a, entonces b' },
      { index: 1, checked: false, text: 'Dado c, entonces d' },
    ]);
    expect(story.transitions).toEqual(['EN_REVIEW', 'BLOQUEADO', 'LISTO']);
    expect(JSON.parse(next.result.content[0].text)).toEqual({ review: [], next: [], waiting: [] });
  });

  it('escrituras con las reglas del proyecto', () => {
    const [bad, tick, ok, log, unknown] = rpc([
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'story_advance', arguments: { id: 'HU-001', status: 'EN_REVIEW' } } },
      { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'story_check_criterion', arguments: { id: 'HU-001', index: 1, checked: true } } },
      { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'story_advance', arguments: { id: 'HU-001', status: 'EN_REVIEW' } } },
      { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'story_log', arguments: { id: 'HU-001', text: 'Probado' } } },
      { jsonrpc: '2.0', id: 5, method: 'nada' },
    ]);
    expect(bad.result.isError).toBe(true);
    expect(bad.result.content[0].text).toMatch(/1 criterio\(s\) sin tildar/);
    expect(tick.result.content[0].text).toMatch(/\[x\] #2/);
    expect(ok.result.isError).toBe(undefined);
    expect(ok.result.content[0].text).toMatch(/EN_CURSO → EN_REVIEW/);
    expect(log.result.content[0].text).toMatch(/log en/);
    expect(unknown.error.code).toBe(-32601);
    expect(spawnSync('node', ['scripts/pm/check.mjs'], { cwd: dir }).status).toBe(0);
  });
});

describe('init y Claude', () => {
  it('modo proyecto: subagentes, skill de olas, hooks, statusline y .mcp.json', () => {
    const dir = project();
    for (const f of ['.claude/agents/revisor-criterios.md', '.claude/agents/refinador.md', '.claude/skills/hu-ola/SKILL.md', 'scripts/mcp/server.mjs', 'scripts/claude/stop-check.mjs'])
      expect(existsSync(path.join(dir, f))).toBe(true);
    const settings = JSON.parse(readFileSync(path.join(dir, '.claude/settings.json'), 'utf8'));
    expect(Object.keys(settings.hooks).sort()).toEqual(['PostToolUse', 'PreToolUse', 'SessionStart', 'Stop', 'UserPromptSubmit']);
    expect(settings.hooks.SessionStart[0].matcher).toBe('startup|resume|clear|compact');
    expect(settings.hooks.Stop[0].matcher).toBe(undefined);
    expect(settings.statusLine.command).toMatch(/statusline\.mjs/);
    expect(JSON.parse(readFileSync(path.join(dir, '.mcp.json'), 'utf8')).mcpServers.backlog.args[0]).toBe('${CLAUDE_PROJECT_DIR:-.}/scripts/mcp/server.mjs');
    expect(readFileSync(path.join(dir, 'CLAUDE.md'), 'utf8')).toMatch(/revisor-criterios/);
    expect(JSON.parse(readFileSync(path.join(dir, '.pm/config.json'), 'utf8')).claude).toEqual({ mode: 'project' });
  });

  it('modo plugin: sin skills, subagentes, hooks ni MCP en el proyecto; skills con prefijo', () => {
    const dir = project({ claude: 'plugin' });
    expect(existsSync(path.join(dir, '.claude/skills'))).toBe(false);
    expect(existsSync(path.join(dir, '.claude/agents'))).toBe(false);
    expect(existsSync(path.join(dir, '.mcp.json'))).toBe(false);
    const settings = JSON.parse(readFileSync(path.join(dir, '.claude/settings.json'), 'utf8'));
    expect(settings.hooks).toEqual({});
    expect(settings.statusLine.command).toMatch(/statusline\.mjs/);
    expect(readFileSync(path.join(dir, 'CLAUDE.md'), 'utf8')).toMatch(/\/backlog-kit:hu-nueva/);
  });

  it('GitHub Action de Claude solo si se pide', () => {
    const dir = project({ claudeAction: true });
    expect(readFileSync(path.join(dir, '.github/workflows/claude.yml'), 'utf8')).toMatch(/anthropics\/claude-code-action@v1/);
    expect(existsSync(path.join(project(), '.github/workflows/claude.yml'))).toBe(false);
  });
});

describe('plugin', () => {
  it('lo commiteado está al día con las plantillas', () => {
    const r = spawnSync('node', ['scripts/build-plugin.mjs', '--check'], { cwd: ROOT, encoding: 'utf8' });
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
  });
});
