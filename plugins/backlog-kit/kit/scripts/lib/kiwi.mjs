// Módulo Kiwi TCMS: los casos de prueba del README de cada historia, como TestCases de Kiwi.
//
// Config (`.pm/config.json`):
//   "kiwi": { "enabled": true, "classification": "Empresa", "product": "mi-proyecto", "version": "dev",
//             "insecure": false, "urlEnv": "KIWI_URL", "userEnv": "KIWI_USERNAME", "passwordEnv": "KIWI_PASSWORD" }
// La URL es la del endpoint JSON-RPC (https://kiwi.example.com/json-rpc/). Credenciales del entorno o
// de `.env.local`; nunca se imprimen. `insecure: true` acepta un certificado self-signed (sólo para
// un host propio).
//
// Un TestPlan y una Category por épica; un TestCase por fila de la tabla de casos de prueba, con
// resumen "<ID> #<fila> · <escenario>". Idempotente: busca por ese prefijo antes de crear.
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';
import { fromEnvFiles } from './forge.mjs';
import { section } from './pm.mjs';

export function createKiwi(root, cfg) {
  const k = cfg.kiwi ?? {};
  const env = (name, fallback) => {
    const key = k[name] ?? fallback;
    return process.env[key] || fromEnvFiles(root, key);
  };
  let cookie = null;
  let seq = 1;

  function settings() {
    const url = env('urlEnv', 'KIWI_URL');
    const user = env('userEnv', 'KIWI_USERNAME');
    const password = env('passwordEnv', 'KIWI_PASSWORD');
    if (!url || !user || !password) throw new Error('Kiwi: faltan KIWI_URL / KIWI_USERNAME / KIWI_PASSWORD (entorno o .env.local) / missing Kiwi credentials');
    return { url, user, password };
  }

  // Node no trae cookie jar ni deja pasar un Agent a fetch: request a mano, con la cookie de sesión.
  function post(url, body, sessionCookie) {
    return new Promise((resolve, reject) => {
      const u = new URL(url);
      const data = JSON.stringify(body);
      const lib = u.protocol === 'http:' ? http : https;
      const req = lib.request(
        {
          hostname: u.hostname,
          port: u.port || (u.protocol === 'http:' ? 80 : 443),
          path: u.pathname + u.search,
          method: 'POST',
          rejectUnauthorized: !k.insecure,
          timeout: 20_000,
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), ...(sessionCookie ? { Cookie: sessionCookie } : {}) },
        },
        (res) => {
          let out = '';
          res.on('data', (c) => (out += c));
          res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: out }));
        },
      );
      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`Kiwi: timeout (${u.host})`));
      });
      req.end(data);
    });
  }

  async function session() {
    if (cookie) return cookie;
    const { url, user, password } = settings();
    const r = await post(url, { jsonrpc: '2.0', method: 'Auth.login', params: [user, password], id: seq++ });
    const set = r.headers['set-cookie'] ?? [];
    if (!set.length) {
      let why = `status ${r.status}`;
      try {
        why = JSON.parse(r.body).error?.message ?? why;
      } catch {
        // cuerpo no JSON: queda el status
      }
      throw new Error(`Kiwi: el login no devolvió sesión / login failed (${why})`);
    }
    return (cookie = set.map((c) => c.split(';')[0]).join('; '));
  }

  async function rpc(method, params = []) {
    const { url } = settings();
    const r = await post(url, { jsonrpc: '2.0', method, params, id: seq++ }, await session());
    let parsed;
    try {
      parsed = JSON.parse(r.body);
    } catch {
      throw new Error(`Kiwi: ${method} no devolvió JSON (status ${r.status})`);
    }
    if (parsed.error) throw new Error(`Kiwi: ${method} → ${parsed.error.message ?? JSON.stringify(parsed.error)}`);
    return parsed.result;
  }

  async function getOrCreate(model, filter, values = filter, { dry = false } = {}) {
    const found = await rpc(`${model}.filter`, [filter]);
    if (found.length) return found[0];
    if (dry) return { id: null, ...values, dry: true };
    return rpc(`${model}.create`, [values]);
  }

  return { rpc, getOrCreate };
}

const PLACEHOLDER = /^(…|\.\.\.)?$/;

/** Filas reales de la tabla de casos de prueba: columnas leídas del encabezado, no por posición. */
export function kiwiCases(body, title) {
  const rows = section(body, title).split('\n').filter((l) => l.trim().startsWith('|'));
  if (rows.length < 2) return [];
  const cells = (r) => r.split('|').slice(1, -1).map((c) => c.trim());
  const head = cells(rows[0]).map((h) => h.toLowerCase());
  const col = (...names) => head.findIndex((h) => names.some((n) => h.includes(n)));
  const iN = head.findIndex((h) => h === '#');
  const iScenario = col('escenario', 'scenario', 'caso', 'case');
  const iSteps = col('paso', 'step');
  const iExpected = col('esperado', 'expected', 'resultado', 'result');
  if (iN < 0 || iScenario < 0 || iExpected < 0) return [];
  return rows
    .slice(1)
    .filter((r) => !/^\|\s*:?-+/.test(r))
    .map(cells)
    .map((c) => ({ n: c[iN], scenario: c[iScenario], steps: iSteps >= 0 ? c[iSteps] : '', expected: c[iExpected] }))
    .filter((c) => c.n && c.n !== '#' && !PLACEHOLDER.test(c.scenario ?? '') && !PLACEHOLDER.test(c.expected ?? '') && !/^(…|\.\.\.)$/.test(c.steps));
}

/** Sincroniza una historia con Kiwi. Con `dry`, sólo lee y cuenta lo que haría. */
export async function syncKiwi(pm, id, { dry = false, kiwi = createKiwi(pm.root, pm.cfg), log = console.log } = {}) {
  const { cfg } = pm;
  const k = cfg.kiwi ?? {};
  const en = cfg.language === 'en';
  const story = pm.findStory(id);
  const v = pm.view(story);
  const cases = kiwiCases(story.body, cfg.sections.tests);
  const productName = k.product ?? path.basename(pm.root);
  const opt = { dry };
  const classification = await kiwi.getOrCreate('Classification', { name: k.classification ?? productName }, undefined, opt);
  const product = await kiwi.getOrCreate('Product', { name: productName }, { name: productName, classification: classification.id }, opt);
  const version = product.id
    ? await kiwi.getOrCreate('Version', { value: k.version ?? 'dev', product: product.id }, undefined, opt)
    : { id: null };
  const epicName = `${story.epic.id} — ${story.epic.title}`;
  const category = product.id
    ? await kiwi.getOrCreate('Category', { name: story.epic.id, product: product.id }, { name: story.epic.id, product: product.id, description: epicName }, opt)
    : { id: null };
  // Un plan por épica, buscado por el prefijo "<épica> — ": el nombre lindo puede haber cambiado.
  let plan = product.id ? (await kiwi.rpc('TestPlan.filter', [{ product: product.id, name__startswith: `${story.epic.id} — ` }]))[0] : null;
  if (!plan && !dry) {
    const type = (await kiwi.rpc('PlanType.filter', [{ name: 'Function' }]))[0];
    plan = await kiwi.rpc('TestPlan.create', [
      { name: epicName, product: product.id, product_version: version.id, type: type?.id, text: en ? `Test cases of ${story.epic.id}, synced from the story READMEs.` : `Casos de prueba de ${story.epic.id}, sincronizados desde los README de las historias.` },
    ]);
  }
  const report = { id: v.id, plan: plan?.name ?? epicName, created: 0, updated: 0, cases: cases.length };
  for (const c of cases) {
    const summary = `${v.id} #${c.n} · ${c.scenario}`.slice(0, 255);
    const text = [c.steps && `**${en ? 'Steps' : 'Pasos'}**\n\n${c.steps}`, `**${en ? 'Expected result' : 'Resultado esperado'}**\n\n${c.expected}`].filter(Boolean).join('\n\n');
    const existing = category.id ? (await kiwi.rpc('TestCase.filter', [{ summary__startswith: `${v.id} #${c.n} · `, category: category.id }]))[0] : null;
    if (dry) {
      report[existing ? 'updated' : 'created'] += 1;
      continue;
    }
    let tc = existing;
    if (tc) {
      await kiwi.rpc('TestCase.update', [tc.id, { summary, text }]);
      report.updated += 1;
    } else {
      // CONFIRMED (2): sin eso no se puede sumar a una TestRun.
      tc = await kiwi.rpc('TestCase.create', [{ product: product.id, category: category.id, summary, text, priority: 2, case_status: 2, notes: `${v.id}` }]);
      report.created += 1;
    }
    try {
      await kiwi.rpc('TestPlan.add_case', [plan.id, tc.id]);
    } catch (err) {
      if (!/already/i.test(err.message)) throw err;
    }
  }
  log(
    en
      ? `✓ Kiwi ${v.id}: ${report.cases} case(s) → «${report.plan}» (${report.created} new, ${report.updated} updated)${dry ? ' [dry-run]' : ''}`
      : `✓ Kiwi ${v.id}: ${report.cases} caso(s) → «${report.plan}» (${report.created} nuevos, ${report.updated} actualizados)${dry ? ' [dry-run]' : ''}`,
  );
  return report;
}
