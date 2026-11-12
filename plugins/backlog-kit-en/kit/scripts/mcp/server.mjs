#!/usr/bin/env node
// Servidor MCP (stdio, sin dependencias) del backlog del proyecto: lectura estructurada en JSON y
// escrituras que corren los mismos scripts de siempre (`pm:advance`, `pm:log`, `pm:new`), así las
// reglas no cambian. Lo registra el plugin de Claude Code o un `.mcp.json`.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { createPm, section, toggleChecklist } from '../lib/pm.mjs';
import { blockedReason, dependencyIndex, stats, suggestNext } from '../lib/insights.mjs';

// La raíz es la del proyecto donde viven estos scripts; BACKLOG_ROOT la pisa (tests, otros clientes).
const ROOT = process.env.BACKLOG_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
// Revisiones con handshake `initialize`; la primera es la preferida.
const SUPPORTED = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];

const str = (description, extra = {}) => ({ type: 'string', description, ...extra });
const TOOLS = [
  {
    name: 'story_list',
    description: 'Lista las historias del backlog (id, nombre, estado, prioridad, épica, rama, criterios, dependencias pendientes). Filtros opcionales.',
    inputSchema: { type: 'object', properties: { status: str('Solo este estado'), epic: str('Solo esta épica (ej. E02)'), query: str('Texto en id o nombre') } },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'story_get',
    description: 'Una historia completa: frontmatter, historia, criterios (con índice), preguntas, plan, dependencias, quién la espera y el final del log.',
    inputSchema: { type: 'object', properties: { id: str('Id de la historia, ej. HU-012') }, required: ['id'] },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'story_next',
    description: 'Qué tomar después: lo que está en review, lo listo sin dependencias pendientes (por etapa, cuánto destraba y prioridad) y lo listo que espera.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'backlog_stats',
    description: 'Métricas del log: días promedio por estado, cerradas por semana y antigüedad en el estado actual.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'story_advance',
    description: 'Cambia el estado de una historia con las reglas del proyecto (transiciones válidas, criterios tildados para review, nota obligatoria para bloquear). Actualiza README, log, backlog e issue.',
    inputSchema: {
      type: 'object',
      properties: { id: str('Id de la historia'), status: str('Estado destino'), note: str('Nota para el log (obligatoria al bloquear)'), force: { type: 'boolean', description: 'Pasar a review con criterios sin tildar (requiere note)' } },
      required: ['id', 'status'],
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
  },
  {
    name: 'story_log',
    description: 'Agrega una entrada al log de progreso (y la comenta en el issue). Para hitos: qué pasó, artefactos y qué falta.',
    inputSchema: { type: 'object', properties: { id: str('Id de la historia'), text: str('Texto de la entrada') }, required: ['id', 'text'] },
    annotations: { readOnlyHint: false, destructiveHint: false },
  },
  {
    name: 'story_create',
    description: 'Crea una historia desde la plantilla con el próximo id libre.',
    inputSchema: {
      type: 'object',
      properties: { epic: str('Épica, ej. E02'), title: str('Nombre, máx. 80 caracteres'), type: str('Tipo'), priority: str('Prioridad'), status: str('Estado inicial (backlog o refinando)') },
      required: ['epic', 'title'],
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
  },
  {
    name: 'story_check_criterion',
    description: 'Tilda o destilda un criterio de aceptación por índice (de story_get). Solo con evidencia de que se cumple.',
    inputSchema: { type: 'object', properties: { id: str('Id de la historia'), index: { type: 'integer', minimum: 0 }, checked: { type: 'boolean' } }, required: ['id', 'index', 'checked'] },
    annotations: { readOnlyHint: false, destructiveHint: false },
  },
];

function script(name, args) {
  const r = spawnSync('node', [path.join(ROOT, 'scripts/pm', `${name}.mjs`), ...args], { cwd: ROOT, encoding: 'utf8' });
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`.trim();
  if (r.status !== 0) throw new Error(out || `${name} falló`);
  return out;
}

function call(name, a = {}) {
  const pm = createPm(ROOT);
  const { cfg } = pm;
  const en = cfg.language === 'en';
  if (name === 'story_list') {
    const views = pm.loadStories().filter((s) => s.data).map((s) => pm.view(s));
    const idx = dependencyIndex(views, cfg);
    const q = a.query?.toLowerCase();
    return views
      .filter((v) => (!a.status || v.status === a.status) && (!a.epic || v.epic === a.epic.toUpperCase()) && (!q || `${v.id} ${v.title}`.toLowerCase().includes(q)))
      .map((v) => ({ id: v.id, title: v.title, status: v.status, priority: v.priority, epic: v.epic, branch: v.branch, issue: v.issue, criteria: v.criteria, pendingDeps: idx.pending.get(v.id), extra: v.extra }));
  }
  if (name === 'story_get') {
    const s = pm.findStory(a.id);
    const v = pm.view(s);
    const views = pm.loadStories().filter((x) => x.data).map((x) => pm.view(x));
    const idx = dependencyIndex(views, cfg);
    const sec = (k) => section(s.body, cfg.sections[k]);
    return {
      ...v,
      file: pm.rel(s.file),
      story: sec('story'),
      criteria: sec('criteria').split('\n').filter((l) => /^\s*- \[[ xX]\]/.test(l)).map((l, index) => ({ index, checked: /\[[xX]\]/.test(l), text: l.replace(/^\s*- \[[ xX]\]\s*/, '') })),
      questions: sec('questions'),
      plan: sec('plan'),
      pendingDeps: idx.pending.get(v.id),
      dependents: idx.dependents.get(v.id),
      blockedReason: v.status === cfg.states.blocked ? blockedReason(s, cfg) : null,
      log: sec('log').split('\n').filter((l) => l.startsWith('- ')).slice(-10),
      transitions: cfg.transitions[v.status],
    };
  }
  if (name === 'story_next') {
    const n = suggestNext(pm);
    const brief = (v) => ({ id: v.id, title: v.title, status: v.status, priority: v.priority, unlocks: v.unlocks, pending: v.pending });
    return { review: n.review.map(brief), next: n.free.map(brief), waiting: n.waiting.map(brief) };
  }
  if (name === 'backlog_stats') return stats(pm);
  if (name === 'story_advance')
    return script('advance', [a.id, a.status, ...(a.note ? [en ? '--note' : '--nota', a.note] : []), ...(a.force ? [en ? '--force' : '--forzar'] : [])]);
  if (name === 'story_log') return script('log', [a.id, a.text]);
  if (name === 'story_create')
    return script('new', ['--epic', a.epic, '--title', a.title, ...(a.type ? ['--type', a.type] : []), ...(a.priority ? ['--priority', a.priority] : []), ...(a.status ? ['--status', a.status] : [])]);
  if (name === 'story_check_criterion') {
    const s = pm.findStory(a.id);
    toggleChecklist(s.file, cfg.sections.criteria, a.index, a.checked);
    return `✓ ${pm.view(s).id}: ${a.checked ? '[x]' : '[ ]'} #${a.index + 1}`;
  }
  throw new Error(`Tool desconocida: ${name}`);
}

export function handle(msg) {
  const { id, method, params } = msg;
  if (id === undefined) return null; // notificaciones: no llevan respuesta
  const ok = (result) => ({ jsonrpc: '2.0', id, result });
  if (method === 'initialize') {
    const asked = params?.protocolVersion;
    return ok({
      protocolVersion: SUPPORTED.includes(asked) ? asked : SUPPORTED[0],
      capabilities: { tools: {} },
      serverInfo: { name: 'backlog-kit', version: '0.3.0' },
      instructions: 'Backlog del proyecto en .pm/. Leé con story_list, story_get y story_next; cambiá estados solo con story_advance, que aplica las reglas del proyecto.',
    });
  }
  if (method === 'ping') return ok({});
  if (method === 'tools/list') return ok({ tools: TOOLS });
  if (method === 'tools/call') {
    try {
      const result = call(params?.name, params?.arguments ?? {});
      return ok({ content: [{ type: 'text', text: typeof result === 'string' ? result : JSON.stringify(result, null, 2) }] });
    } catch (err) {
      return ok({ content: [{ type: 'text', text: String(err.message).replace(/^✗\s*/, '') }], isError: true });
    }
  }
  return { jsonrpc: '2.0', id, error: { code: -32601, message: `Método no soportado: ${method}` } };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const rl = readline.createInterface({ input: process.stdin });
  rl.on('line', (line) => {
    if (!line.trim()) return;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } })}\n`);
      return;
    }
    const res = handle(msg);
    if (res) process.stdout.write(`${JSON.stringify(res)}\n`);
  });
}
