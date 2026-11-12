// Librería compartida: tildar criterios, índice de dependencias y motivo del bloqueo.
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { expect } from './expect.mjs';
import { toggleChecklist, checklist } from '../kit/scripts/lib/pm.mjs';
import { blockedReason, dependencyIndex } from '../kit/scripts/lib/insights.mjs';
import { resolveConfig } from '../kit/scripts/lib/config.mjs';

const cfg = resolveConfig({ language: 'es' });

describe('toggleChecklist', () => {
  it('tilda y destilda por índice, solo dentro de la sección', () => {
    const file = path.join(mkdtempSync(path.join(tmpdir(), 'bk-')), 'r.md');
    writeFileSync(file, '## Criterios de aceptación\n\n- [ ] uno\n- [x] dos\n  - [ ] tres\n\n## Tareas\n\n- [ ] otra\n');
    toggleChecklist(file, 'Criterios de aceptación', 0, true);
    toggleChecklist(file, 'Criterios de aceptación', 2, true);
    toggleChecklist(file, 'Criterios de aceptación', 1, false);
    const text = readFileSync(file, 'utf8');
    expect(text).toBe('## Criterios de aceptación\n\n- [x] uno\n- [ ] dos\n  - [x] tres\n\n## Tareas\n\n- [ ] otra\n');
    expect(checklist(text, 'Criterios de aceptación').done).toBe(2);
    let error;
    try {
      toggleChecklist(file, 'Criterios de aceptación', 3, true);
    } catch (err) {
      error = err;
    }
    expect(error.message).toMatch(/no hay criterio 4/);
  });
});

describe('dependencyIndex', () => {
  it('pendientes, quién depende y cuánto destraba (transitivo)', () => {
    const v = (id, status, dependencies = []) => ({ id, status, dependencies });
    const idx = dependencyIndex([v('A', 'HECHO'), v('B', 'LISTO', ['A']), v('C', 'BACKLOG', ['B']), v('D', 'LISTO', ['B', 'X'])], cfg);
    expect(idx.pending.get('B')).toEqual([]);
    expect(idx.pending.get('C')).toEqual(['B']);
    expect(idx.pending.get('D')).toEqual(['B', 'X']);
    expect(idx.unlocks.get('A')).toBe(3);
    expect(idx.unlocks.get('B')).toBe(2);
    expect(idx.dependents.get('B')).toEqual(['C', 'D']);
  });
});

describe('blockedReason', () => {
  it('toma la nota de la última transición a bloqueada', () => {
    const story = { body: '## Log de progreso\n\n- 2026-11-01 — Bloqueada. Falta la key (depende de: Juan) (LISTO → BLOQUEADO)\n- 2026-11-02 — x (BLOQUEADO → LISTO)\n- 2026-11-03 — Bloqueada. Esperando a diseño (LISTO → BLOQUEADO)\n' };
    expect(blockedReason(story, cfg)).toBe('Esperando a diseño');
    expect(blockedReason({ body: '## Log de progreso\n\n- 2026-11-01 — Creada. (REFINANDO)\n' }, cfg)).toBeNull();
  });
});
