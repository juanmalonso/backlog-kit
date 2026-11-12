import { describe, it } from 'node:test';
import { expect } from './expect.mjs';

// it.each de vitest sobre node:test.
const each = (cases) => (name, fn) => cases.forEach((c) => it(name.replace('%s', c), () => fn(c)));
import {
  checksProblem,
  evaluate,
  prePushProblem,
  segments,
  segmentsWithDir,
} from '../kit/scripts/lib/git-rules.mjs';

const blocked = (cmd, branch = 'hu-048-x') => evaluate(cmd, branch).block;

describe('segments', () => {
  it('separa por operadores y respeta comillas', () => {
    expect(segments('git add -A && git commit -m "a && b"; git push')).toEqual([
      ['git', 'add', '-A'],
      ['git', 'commit', '-m', 'a && b'],
      ['git', 'push'],
    ]);
  });
});

describe('heredocs', () => {
  it('ignora el texto de un heredoc (mensaje de commit o cuerpo de PR)', () => {
    const cmd = `git commit -q -F - <<'EOF'\nbloquea gh pr merge --admin y git push origin main\nEOF\ngit push -u origin hu-048-x`;
    expect(evaluate(cmd, 'hu-048-x').block).toBe(false);
  });
  it('sigue viendo los comandos después del heredoc', () => {
    const cmd = `cat > f <<EOF\nhola\nEOF\ngit push origin main`;
    expect(evaluate(cmd, 'hu-048-x').block).toBe(true);
  });
});

describe('commit', () => {
  it('bloquea commitear en main', () => expect(blocked('git commit -m x', 'main')).toBe(true));
  it('permite commitear en una rama de HU', () => expect(blocked('git commit -m x')).toBe(false));
  it('detecta el commit dentro de una cadena', () =>
    expect(blocked('npm run check && git add -A && git commit -q -m x', 'main')).toBe(true));
});

describe('directorio de cada segmento (HU-049)', () => {
  // checkout principal en main, worktree en una rama de HU
  const branchOf = (dir) => (dir.startsWith('/wt/hu-002') ? 'hu-002-x' : 'main');
  const run = (cmd) => evaluate(cmd, branchOf, '/repo').block;

  it('permite commitear en un worktree con cd', () =>
    expect(run('cd /wt/hu-002 && git add -A && git commit -m x')).toBe(false));
  it('permite commitear en un worktree con git -C', () =>
    expect(run('git -C /wt/hu-002 commit -m x')).toBe(false));
  it('resuelve -C relativo al cd previo', () =>
    expect(run('cd /wt && git -C hu-002 commit -m x')).toBe(false));
  it('bloquea si el cd va al checkout en main', () =>
    expect(run('cd /repo && git commit -m x')).toBe(true));
  it('sin cd ni -C usa el cwd del hook', () => expect(run('git commit -m x')).toBe(true));
  it('cada segmento usa su propio directorio', () =>
    expect(run('cd /wt/hu-002 && git commit -m a; cd /repo && git commit -m b')).toBe(true));
  it('fuera de un repo las reglas de rama no aplican, el push explícito a main sí', () => {
    expect(evaluate('cd /tmp && git commit -m x', () => '', '/repo').block).toBe(false);
    expect(evaluate('cd /tmp && git push origin main', () => '', '/repo').block).toBe(true);
  });
  it('devuelve el directorio del gh pr merge', () =>
    expect(evaluate('cd /wt/hu-002 && gh pr merge 5', branchOf, '/repo').needsChecks).toEqual({
      pr: '5',
      dir: '/wt/hu-002',
    }));
  it('segmentsWithDir sigue la cadena de cd', () =>
    expect(segmentsWithDir('cd a && cd ../b && ls', '/x').map((s) => s.dir)).toEqual([
      '/x/a',
      '/x/b',
      '/x/b',
    ]));
});

describe('push', () => {
  each([
    'git push origin main',
    'git push origin HEAD:main',
    'git push origin feature:refs/heads/main',
    'git push --force origin main',
    'git push -f origin +main',
    'git push origin --delete main',
    'git push origin :main',
    'git push --all origin',
    'GIT_TRACE=1 git push origin main',
    'git -C /repo push origin main',
  ])('bloquea %s', (cmd) => expect(blocked(cmd)).toBe(true));

  it('bloquea un push sin refspec estando en main', () =>
    expect(blocked('git push', 'main')).toBe(true));
  it('bloquea HEAD estando en main', () =>
    expect(blocked('git push origin HEAD', 'main')).toBe(true));

  each([
    'git push -u origin hu-048-proteccion-local-de-main',
    'git push --force-with-lease',
    'git push origin hu-048-x:hu-048-x',
    'git push -o ci.skip origin hu-048-x',
  ])('permite %s en una rama de HU', (cmd) => expect(blocked(cmd)).toBe(false));
});

describe('gh', () => {
  it('pide verificar checks para gh pr merge', () =>
    expect(evaluate('gh pr merge 35 --squash --delete-branch', 'x')).toEqual({
      block: false,
      needsChecks: { pr: '35', dir: '.' },
    }));
  it('bloquea --admin', () => expect(blocked('gh pr merge 35 --admin --squash')).toBe(true));
  it('bloquea borrar main por la API', () =>
    expect(blocked('gh api -X DELETE repos/o/r/git/refs/heads/main')).toBe(true));
  it('permite leer main por la API', () =>
    expect(blocked('gh api repos/o/r/branches/main')).toBe(false));
});

describe('checksProblem', () => {
  it('ok con todo en SUCCESS', () =>
    expect(checksProblem([{ name: 'check', conclusion: 'SUCCESS' }])).toBeNull());
  it('sin checks no se mergea', () => expect(checksProblem([])).toMatch(/no tiene checks/));
  it('nombra el check que falta', () =>
    expect(
      checksProblem([
        { name: 'check', conclusion: 'SUCCESS' },
        { name: 'e2e', conclusion: '', status: 'IN_PROGRESS' },
      ]),
    ).toBe('e2e: IN_PROGRESS'));
});

describe('prePushProblem', () => {
  it('rechaza refs/heads/main', () =>
    expect(prePushProblem('refs/heads/main abc refs/heads/main def\n')).toMatch(/rechazado/));
  it('acepta otras ramas', () =>
    expect(prePushProblem('refs/heads/hu-1 abc refs/heads/hu-1 def\n')).toBeNull());
});

describe('configurable', () => {
  it('protege otra rama y habla en inglés', () => {
    const v = evaluate('git push origin trunk', 'x', '.', { protectedBranch: 'trunk', lang: 'en' });
    expect(v.block).toBe(true);
    expect(v.reason).toMatch(/Do not push to `trunk`/);
    expect(evaluate('git push origin main', 'x', '.', { protectedBranch: 'trunk' }).block).toBe(false);
  });
  it('pre-push usa la rama del config', () => {
    expect(prePushProblem('a b refs/heads/trunk c', { protectedBranch: 'trunk' })).toMatch(/trunk/);
    expect(prePushProblem('a b refs/heads/main c', { protectedBranch: 'trunk' })).toBeNull();
  });
});
