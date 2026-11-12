// expect() mínimo sobre node:assert, para no sumar un runner de tests.
import assert from 'node:assert/strict';

export function expect(actual) {
  const api = {
    toBe: (v) => assert.strictEqual(actual, v),
    toEqual: (v) => assert.deepStrictEqual(actual, v),
    toBeNull: () => assert.strictEqual(actual, null),
    toBeTruthy: () => assert.ok(actual),
    toBeFalsy: () => assert.ok(!actual),
    toMatch: (re) => assert.match(String(actual), typeof re === 'string' ? new RegExp(re.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) : re),
    toContain: (v) => assert.ok(actual.includes(v), `${JSON.stringify(actual)} no contiene ${JSON.stringify(v)}`),
    toMatchObject: (v) => {
      for (const [k, x] of Object.entries(v)) assert.deepStrictEqual(actual[k], x);
    },
  };
  api.not = {
    toBe: (v) => assert.notStrictEqual(actual, v),
    toContain: (v) => assert.ok(!actual.includes(v), `${JSON.stringify(actual)} contiene ${JSON.stringify(v)}`),
    toMatch: (re) => assert.doesNotMatch(String(actual), re),
    toBeNull: () => assert.notStrictEqual(actual, null),
  };
  return api;
}
