// Configuración del backlog (`.pm/config.json`). Lo que no esté en el archivo sale del preset del
// idioma. La usan los scripts del proyecto y la extensión de VS Code: no lee nada del entorno.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

/** Roles fijos de estado. Cada proyecto les pone su nombre; las reglas se escriben sobre el rol. */
export const ROLES = [
  'backlog',
  'refining',
  'ready',
  'inProgress',
  'review',
  'done',
  'blocked',
  'discarded',
];

/** Transiciones válidas entre roles. blocked y discarded se alcanzan desde los estados activos. */
export const ROLE_TRANSITIONS = {
  backlog: ['refining', 'discarded'],
  refining: ['ready', 'blocked', 'discarded'],
  ready: ['inProgress', 'refining', 'blocked', 'discarded'],
  inProgress: ['review', 'blocked', 'ready'],
  review: ['done', 'inProgress', 'blocked'],
  done: ['inProgress'],
  blocked: ['ready', 'refining', 'discarded'],
  discarded: ['backlog'],
};

export const PRESETS = {
  es: {
    language: 'es',
    storyPrefix: 'HU',
    idDigits: 3,
    epicPrefix: 'E',
    epicDigits: 2,
    mainBranch: 'main',
    checkCommand: 'npm run pm:check',
    states: {
      backlog: 'BACKLOG',
      refining: 'REFINANDO',
      ready: 'LISTO',
      inProgress: 'EN_CURSO',
      review: 'EN_REVIEW',
      done: 'HECHO',
      blocked: 'BLOQUEADO',
      discarded: 'DESCARTADO',
    },
    keys: {
      id: 'id',
      epic: 'epica',
      title: 'nombre',
      type: 'tipo',
      status: 'estado',
      priority: 'prioridad',
      estimate: 'estimacion',
      branch: 'rama',
      issue: 'github_issue',
      updated: 'ultima_actualizacion',
    },
    priorities: ['bloqueante', 'alta', 'media', 'baja'],
    types: ['feature', 'fix', 'spike', 'chore'],
    estimates: ['XS', 'S', 'M', 'L', 'XL'],
    sections: {
      story: 'Historia',
      criteria: 'Criterios de aceptación',
      questions: 'Preguntas pendientes',
      plan: 'Plan de implementación',
      tests: 'Casos de prueba',
      dependencies: 'Dependencias',
      decisions: 'Decisiones',
      log: 'Log de progreso',
    },
    docs: { decisions: 'docs/decisiones', findings: 'docs/hallazgos', findingPrefix: 'HAL' },
    fields: [],
    github: { enabled: true },
    gitGuard: { enabled: true },
    migrations: null,
  },
  en: {
    language: 'en',
    storyPrefix: 'US',
    idDigits: 3,
    epicPrefix: 'E',
    epicDigits: 2,
    mainBranch: 'main',
    checkCommand: 'npm run pm:check',
    states: {
      backlog: 'BACKLOG',
      refining: 'REFINING',
      ready: 'READY',
      inProgress: 'IN_PROGRESS',
      review: 'IN_REVIEW',
      done: 'DONE',
      blocked: 'BLOCKED',
      discarded: 'DISCARDED',
    },
    keys: {
      id: 'id',
      epic: 'epic',
      title: 'title',
      type: 'type',
      status: 'status',
      priority: 'priority',
      estimate: 'estimate',
      branch: 'branch',
      issue: 'github_issue',
      updated: 'updated',
    },
    priorities: ['blocker', 'high', 'medium', 'low'],
    types: ['feature', 'fix', 'spike', 'chore'],
    estimates: ['XS', 'S', 'M', 'L', 'XL'],
    sections: {
      story: 'Story',
      criteria: 'Acceptance criteria',
      questions: 'Open questions',
      plan: 'Implementation plan',
      tests: 'Test cases',
      dependencies: 'Dependencies',
      decisions: 'Decisions',
      log: 'Progress log',
    },
    docs: { decisions: 'docs/decisions', findings: 'docs/findings', findingPrefix: 'FND' },
    fields: [],
    github: { enabled: true },
    gitGuard: { enabled: true },
    migrations: null,
  },
};

/**
 * Campos extra que el init ofrece. `values` es catálogo cerrado; `range` es entero; `list` es
 * una lista libre. El guard los valida y el tablero los muestra en la tarjeta.
 */
export const OPTIONAL_FIELDS = {
  es: {
    phase: { key: 'fase', label: 'Fase', values: ['MVP', 'V1', 'DESPUES'] },
    stage: { key: 'etapa', label: 'Etapa', range: [0, 4] },
    requirements: { key: 'rf', label: 'Requisitos', list: true },
    spec: { key: 'spec', label: 'Spec', list: true },
  },
  en: {
    phase: { key: 'phase', label: 'Phase', values: ['MVP', 'V1', 'LATER'] },
    stage: { key: 'stage', label: 'Stage', range: [0, 4] },
    requirements: { key: 'requirements', label: 'Requirements', list: true },
    spec: { key: 'spec', label: 'Spec', list: true },
  },
};

export const CONFIG_FILE = '.pm/config.json';

function merge(base, over) {
  if (!over || typeof over !== 'object' || Array.isArray(over)) return over ?? base;
  const out = { ...base };
  for (const [k, v] of Object.entries(over)) {
    out[k] =
      v && typeof v === 'object' && !Array.isArray(v) && base?.[k] && typeof base[k] === 'object'
        ? merge(base[k], v)
        : v;
  }
  return out;
}

/** Config completa: preset del idioma + lo que diga el archivo. Agrega los derivados. */
export function resolveConfig(raw = {}) {
  const preset = PRESETS[raw.language] ?? PRESETS.es;
  const cfg = merge(preset, raw);
  const byName = Object.fromEntries(ROLES.map((r) => [cfg.states[r], r]));
  cfg.stateList = ROLES.map((r) => cfg.states[r]);
  cfg.roleOf = (state) => byName[state];
  cfg.transitions = Object.fromEntries(
    ROLES.map((r) => [cfg.states[r], ROLE_TRANSITIONS[r].map((t) => cfg.states[t])]),
  );
  cfg.formatId = (n) => `${cfg.storyPrefix}-${String(n).padStart(cfg.idDigits, '0')}`;
  cfg.idPattern = `${cfg.storyPrefix}-\\d{${cfg.idDigits},}`;
  return cfg;
}

export function loadConfig(root) {
  const file = path.join(root, CONFIG_FILE);
  if (!existsSync(file)) throw new Error(`No hay ${CONFIG_FILE} en ${root}. Corré el init de backlog-kit.`);
  return resolveConfig(JSON.parse(readFileSync(file, 'utf8')));
}
