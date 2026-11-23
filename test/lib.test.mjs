// Librería compartida: tildar criterios, índice de dependencias y motivo del bloqueo.
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { expect } from './expect.mjs';
import { toggleChecklist, checklist, parseFrontmatter, setFields } from '../kit/scripts/lib/pm.mjs';
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

describe('reemplazos y comentarios', () => {
  const tmp = (content) => {
    const file = path.join(mkdtempSync(path.join(tmpdir(), 'bk-')), 'r.md');
    writeFileSync(file, content);
    return file;
  };

  it('toggleChecklist no interpreta "$1" ni "$&" del texto de un criterio', () => {
    const file = tmp('## Criterios\n\n- [ ] cuesta US$1.000 y $& otro\n- [ ] dos\n');
    toggleChecklist(file, 'Criterios', 1, true);
    expect(readFileSync(file, 'utf8')).toBe('## Criterios\n\n- [ ] cuesta US$1.000 y $& otro\n- [x] dos\n');
  });

  it('setFields con "$&" y " # " en el valor: se escribe tal cual y se vuelve a leer igual', () => {
    const file = tmp('---\nid: HU-001\nestado: BACKLOG   # BACKLOG | LISTO\n---\n\ncuerpo\n');
    setFields(file, { nombre: 'Arreglar bug # 12 por $& US$1', estado: 'LISTO' });
    const { data, body } = parseFrontmatter(readFileSync(file, 'utf8'));
    expect(data.nombre).toBe('Arreglar bug # 12 por $& US$1');
    expect(data.estado).toBe('LISTO');
    expect(body).toBe('\ncuerpo\n');
  });

  it('parseFrontmatter: comentario sin comillas, " #" con comillas, vacío con comentario', () => {
    const { data } = parseFrontmatter('---\na: valor   # nota\nb: "con # adentro"  # nota\nc:      # vacío\nd: [x, y]\ne: 3\nf: Fix «React #441» y #12\n---\n');
    expect(data).toEqual({ a: 'valor', b: 'con # adentro', c: null, d: ['x', 'y'], e: 3, f: 'Fix «React #441» y #12' });
  });

  it('setFields respeta "#12" en el valor y el comentario de la línea', () => {
    const file = tmp('---\nnombre: Fix «React #441»\ntipo: feature   # feature | fix\n---\n');
    setFields(file, { tipo: 'fix', nombre: 'Fix «React #441» bis' });
    expect(readFileSync(file, 'utf8')).toBe('---\nnombre: Fix «React #441» bis\ntipo: fix       # feature | fix\n---\n');
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
