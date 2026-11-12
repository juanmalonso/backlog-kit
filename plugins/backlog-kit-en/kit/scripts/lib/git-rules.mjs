// Reglas que protegen la rama principal localmente: el plan gratis de GitHub no aplica branch
// protection en repos privados, así que la barrera vive acá. Funciones puras, sin I/O: las usan el
// hook PreToolUse de Claude Code y el pre-push de git. La rama sale de .pm/config.json (mainBranch).

import path from 'node:path';

const TEXT = {
  es: {
    commit: (b) => `No se commitea en \`${b}\`. Pasá la historia a en curso (npm run pm:advance -- <ID> <EN_CURSO>) y commiteá en su rama.`,
    push: (b) => `No se pushea a \`${b}\` (ni directo, ni forzado, ni borrándola). Los cambios entran por PR con CI en verde.`,
    admin: '`gh pr merge --admin` saltea los checks: no se usa.',
    api: (b) => `No se reescribe ni se borra \`${b}\` por la API.`,
    noChecks: 'el PR no tiene checks: esperá a que corra CI',
    prePush: (b) => `push a ${b} rechazado: los cambios entran por PR. Emergencia: ALLOW_MAIN_PUSH=1 git push …`,
  },
  en: {
    commit: (b) => `Do not commit on \`${b}\`. Move the story to in progress (npm run pm:advance -- <ID> <IN_PROGRESS>) and commit on its branch.`,
    push: (b) => `Do not push to \`${b}\` (direct, forced or deleting it). Changes land through a PR with green CI.`,
    admin: '`gh pr merge --admin` skips the checks: not allowed.',
    api: (b) => `Do not rewrite or delete \`${b}\` through the API.`,
    noChecks: 'the PR has no checks: wait for CI to run',
    prePush: (b) => `push to ${b} rejected: changes land through a PR. Emergency: ALLOW_MAIN_PUSH=1 git push …`,
  },
};
const text = (lang) => TEXT[lang] ?? TEXT.es;

/**
 * Saca el contenido de los heredocs (`<<EOF … EOF`, `<<'EOF'`, `<<-EOF`): es texto (mensajes de
 * commit, cuerpos de PR), no comandos. Sin esto, un commit que menciona "git push origin main"
 * se bloquea.
 */
export function stripHeredocs(command) {
  const lines = command.split('\n');
  const out = [];
  let end = null;
  for (const line of lines) {
    if (end !== null) {
      if (line.replace(/^\t+/, '').trim() === end) end = null;
      continue;
    }
    out.push(line);
    const m = line.match(/<<-?\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1/);
    if (m) end = m[2];
  }
  return out.join('\n');
}

/** Separa un comando de shell en segmentos (&&, ||, ;, |, saltos de línea) y tokens. */
export function segments(raw) {
  const command = stripHeredocs(raw);
  const out = [];
  let tokens = [];
  let cur = '';
  let quote = null;
  const flushToken = () => {
    if (cur !== '') tokens.push(cur);
    cur = '';
  };
  const flushSegment = () => {
    flushToken();
    if (tokens.length) out.push(tokens);
    tokens = [];
  };
  for (let i = 0; i < command.length; i++) {
    const c = command[i];
    if (quote) {
      if (c === quote) quote = null;
      else if (c === '\\' && quote === '"' && i + 1 < command.length) cur += command[++i];
      else cur += c;
      continue;
    }
    if (c === "'" || c === '"') quote = c;
    else if (c === '\\' && i + 1 < command.length) cur += command[++i];
    else if (c === ' ' || c === '\t') flushToken();
    else if (c === '\n' || c === ';') flushSegment();
    else if (c === '&' || c === '|') {
      if (command[i + 1] === c) i++;
      flushSegment();
    } else cur += c;
  }
  flushSegment();
  return out;
}

/** Quita variables de entorno iniciales (FOO=1 git …) y devuelve el resto. */
function stripEnv(tokens) {
  let i = 0;
  while (i < tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[i])) i++;
  return tokens.slice(i);
}

/** Para `git [-C dir] [-c k=v] <sub> …` devuelve { sub, args }. */
function gitCall(tokens) {
  const t = stripEnv(tokens);
  if (t[0] !== 'git') return null;
  let i = 1;
  while (i < t.length && t[i].startsWith('-')) {
    if (t[i] === '-C' || t[i] === '-c') i += 2;
    else i += 1;
  }
  return { sub: t[i], args: t.slice(i + 1) };
}

/** Rama destino de un refspec de push (`+src:dst`, `src`, `:dst`). */
function pushTarget(refspec) {
  const spec = refspec.replace(/^\+/, '');
  const dst = spec.includes(':') ? spec.split(':').pop() : spec;
  return dst.replace(/^refs\/heads\//, '');
}

const PUSH_FLAGS_WITH_VALUE = new Set([
  '-o',
  '--push-option',
  '--repo',
  '--receive-pack',
  '--exec',
]);

/**
 * Segmentos con el directorio donde corre cada uno: arranca en `fallback` (el cwd del hook), sigue
 * los `cd` de la cadena y, en un segmento git, `-C dir` manda. Sin esto la rama se leía siempre
 * del checkout principal y un worktree en `hu-NNN` quedaba bloqueado.
 */
export function segmentsWithDir(raw, fallback) {
  let cwd = fallback;
  return segments(raw).map((tokens) => {
    const t = stripEnv(tokens);
    if (t[0] === 'cd' && t[1] && !t[1].startsWith('-')) cwd = path.resolve(cwd, t[1]);
    let dir = cwd;
    if (t[0] === 'git') {
      for (let i = 1; i < t.length && t[i].startsWith('-'); i++) {
        if (t[i] === '-C' && t[i + 1]) dir = path.resolve(dir, t[++i]);
        else if (t[i] === '-c') i++;
      }
    }
    return { tokens, dir };
  });
}

/** Ramas destino de un `git push`, resolviendo el caso sin refspec con la rama actual. */
export function pushTargets(args, currentBranch, PROTECTED = 'main') {
  const positional = [];
  let all = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--all' || a === '--mirror') all = true;
    if (PUSH_FLAGS_WITH_VALUE.has(a)) i++;
    else if (a === '--delete' || a === '-d') continue;
    else if (!a.startsWith('-')) positional.push(a);
  }
  if (all) return [PROTECTED];
  const refspecs = positional.slice(1); // el primero es el remote
  if (refspecs.length === 0) return currentBranch ? [currentBranch] : [];
  return refspecs.map((r) => (r === 'HEAD' ? currentBranch : pushTarget(r)));
}

/**
 * Evalúa un comando de Bash. `currentBranch` es la rama o una función dir → rama, para leerla
 * en el directorio de cada segmento. Devuelve:
 *   { block: true, reason }       → no se ejecuta
 *   { needsChecks: { pr, dir } }  → `gh pr merge`: el hook tiene que verificar los checks del PR
 *   { block: false }
 */
export function evaluate(command, currentBranch, fallbackDir = '.', { protectedBranch: PROTECTED = 'main', lang = 'es' } = {}) {
  const T = text(lang);
  for (const { tokens, dir } of segmentsWithDir(command, fallbackDir)) {
    const branch = typeof currentBranch === 'function' ? currentBranch(dir) : currentBranch;
    const git = gitCall(tokens);
    if (git?.sub === 'commit' && branch === PROTECTED) {
      return {
        block: true,
        reason: T.commit(PROTECTED),
      };
    }
    if (git?.sub === 'push') {
      const targets = pushTargets(git.args, branch, PROTECTED);
      if (targets.includes(PROTECTED)) {
        return {
          block: true,
          reason: T.push(PROTECTED),
        };
      }
    }
    const t = stripEnv(tokens);
    if (t[0] === 'gh' && t[1] === 'pr' && t[2] === 'merge') {
      if (t.includes('--admin')) {
        return {
          block: true,
          reason: T.admin,
        };
      }
      const pr = t.slice(3).find((a) => !a.startsWith('-')) ?? null;
      return { block: false, needsChecks: { pr, dir } };
    }
    if (t[0] === 'gh' && t[1] === 'api') {
      const joined = t.join(' ');
      const writes = /(-X|--method)\s*(DELETE|PATCH|PUT|POST)/i.test(joined);
      const b = PROTECTED.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (writes && new RegExp(`(git/refs/heads/${b}|branches/${b})\\b`).test(joined)) {
        return {
          block: true,
          reason: T.api(PROTECTED),
        };
      }
    }
  }
  return { block: false };
}

/**
 * Checks de un PR (de `gh pr view --json statusCheckRollup`) → null si están todos en verde,
 * o el motivo para no mergear.
 */
export function checksProblem(rollup, lang = 'es') {
  if (!rollup || rollup.length === 0) return text(lang).noChecks;
  const bad = rollup.filter((c) => (c.conclusion ?? c.state) !== 'SUCCESS');
  if (bad.length === 0) return null;
  return bad
    .map((c) => `${c.name ?? c.context}: ${c.conclusion || c.status || c.state}`)
    .join(', ');
}

/** pre-push de git: líneas "<local ref> <local sha> <remote ref> <remote sha>". */
export function prePushProblem(stdin, { protectedBranch: PROTECTED = 'main', lang = 'es' } = {}) {
  for (const line of stdin.split('\n')) {
    const remoteRef = line.trim().split(/\s+/)[2];
    if (remoteRef === `refs/heads/${PROTECTED}`) {
      return text(lang).prePush(PROTECTED);
    }
  }
  return null;
}
