// Issues, labels, milestones y PR/MR del proyecto, en GitHub (vía el CLI `gh`) o en GitLab (API
// REST con token). Los scripts hablan con esta interfaz y no saben cuál hay detrás.
//
// Config (`.pm/config.json`):
//   "forge": { "provider": "gitlab", "url": "https://gitlab.example.com", "project": "grupo/repo",
//              "tokenEnv": "GITLAB_TOKEN", "urlEnv": "GITLAB_URL" }
//   "labels": { "separator": "::", "epic": "folder" }
// Sin "forge", es GitHub. `url` y `project` se pueden omitir: salen de GITLAB_URL y del remote origin.
// El token sale del entorno o de `.env.local` / `.env` del proyecto, y nunca se imprime.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createGh } from './gh.mjs';

export const providerOf = (cfg) => (cfg.forge?.provider === 'gitlab' ? 'gitlab' : 'github');

/** Nombre del pedido de cambios según el proveedor: PR o MR. */
export const changeName = (cfg) => (providerOf(cfg) === 'gitlab' ? 'MR' : 'PR');

/** Separador de los labels con prefijo: "::" en GitLab (labels con alcance, exclusivos), ":" en GitHub. */
export const labelSeparator = (cfg) => cfg.labels?.separator ?? (providerOf(cfg) === 'gitlab' ? '::' : ':');

/** Label `<prefijo><sep><valor>`. La épica va por id ("E02") o por carpeta ("E02-pagos") según el config. */
export function labelFor(cfg, prefix, value) {
  return `${prefix}${labelSeparator(cfg)}${value}`;
}
export function epicLabelValue(cfg, epic) {
  return cfg.labels?.epic === 'folder' ? epic.folder : epic.id;
}

/**
 * Estado del CI de un PR/MR → 'pass' | 'fail' | 'pending' | 'none'. Acepta el statusCheckRollup de
 * GitHub (lista) o el status de un pipeline de GitLab (string).
 */
export function ciState(x) {
  if (typeof x === 'string') {
    const s = x.toLowerCase();
    if (['success'].includes(s)) return 'pass';
    if (['failed', 'canceled', 'cancelled'].includes(s)) return 'fail';
    if (!s || s === 'skipped') return 'none';
    return 'pending';
  }
  if (!x?.length) return 'none';
  const v = x.map((c) => String(c.conclusion || c.state || c.status || '').toUpperCase());
  if (v.some((s) => ['FAILURE', 'CANCELLED', 'TIMED_OUT', 'ACTION_REQUIRED', 'STARTUP_FAILURE', 'ERROR'].includes(s))) return 'fail';
  if (v.some((s) => ['', 'PENDING', 'QUEUED', 'IN_PROGRESS', 'EXPECTED', 'WAITING', 'REQUESTED'].includes(s))) return 'pending';
  return 'pass';
}

/** Lee una clave de `.env.local` o `.env` sin dotenv. */
export function fromEnvFiles(root, key) {
  for (const name of ['.env.local', '.env']) {
    const file = path.join(root, name);
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (m && m[1] === key) return m[2].trim().replace(/^(["'])(.*)\1$/, '$2') || null;
    }
  }
  return null;
}

/** `grupo/sub/repo` de una URL de remote (ssh://, git@host:, https://). */
export function projectFromRemote(url) {
  const m = url.trim().match(/^(?:[a-z+]+:\/\/)?(?:[^@/]+@)?[^/:]+(?::\d+)?[:/](.+?)(?:\.git)?\/?$/i);
  return m ? m[1].replace(/^\/+/, '') : null;
}

/** Título de página de wiki → slug de GitLab (espacios a guiones; la barra es carpeta). */
export const wikiSlug = (title) => title.replace(/ /g, '-');

/**
 * Sincroniza páginas `{ title, content }` con un directorio de wiki en disco (el clon git de la wiki
 * de GitHub): escribe las que cambiaron y, con `prune`, borra las que sobran. Devuelve el reporte.
 */
function syncWikiDir(dir, pages, { prune = false, keep = [] } = {}) {
  const file = (title) => path.join(dir, `${wikiSlug(title)}.md`);
  const report = { created: [], updated: [], deleted: [], unchanged: [] };
  const wanted = new Set(pages.map((p) => path.resolve(file(p.title))));
  for (const p of pages) {
    const f = file(p.title);
    const prev = existsSync(f) ? readFileSync(f, 'utf8') : null;
    if (prev === p.content) report.unchanged.push(p.title);
    else {
      mkdirSync(path.dirname(f), { recursive: true });
      writeFileSync(f, p.content);
      (prev === null ? report.created : report.updated).push(p.title);
    }
  }
  if (prune) {
    const walk = (d) =>
      readdirSync(d).flatMap((n) => {
        const full = path.join(d, n);
        if (n === '.git') return [];
        return statSync(full).isDirectory() ? walk(full) : [full];
      });
    for (const f of walk(dir).filter((f) => f.endsWith('.md'))) {
      const rel = path.relative(dir, f).replace(/\.md$/, '');
      if (!wanted.has(path.resolve(f)) && !keep.some((k) => k.toLowerCase() === rel.toLowerCase())) {
        rmSync(f);
        report.deleted.push(rel);
      }
    }
  }
  return report;
}

export function createForge(root, cfg) {
  return providerOf(cfg) === 'gitlab' ? createGitlab(root, cfg) : createGithub(root, cfg);
}

// ── GitHub ──────────────────────────────────────────────────────────────────────────────────────

function createGithub(root, cfg) {
  const gh = createGh(root, cfg);
  const sh = (args, input) =>
    execFileSync('gh', args, { cwd: root, encoding: 'utf8', input, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  const issue = (i) => ({
    number: i.number,
    title: i.title,
    body: i.body ?? '',
    state: i.state === 'closed' ? 'closed' : 'open',
    labels: (i.labels ?? []).map((l) => (typeof l === 'string' ? l : l.name)),
    milestone: i.milestone?.title ?? null,
  });
  return {
    provider: 'github',
    webUrl: () => `https://github.com/${gh.repo()}`,
    issueUrl: gh.issueUrl,
    blobUrl: gh.blobUrl,
    async getIssue(n) {
      return issue(gh.api('GET', `repos/{repo}/issues/${n}`));
    },
    async issues() {
      return gh.list('repos/{repo}/issues?state=all').filter((i) => !i.pull_request).map(issue);
    },
    async createIssue({ title, body, labels, milestone }) {
      return issue(gh.api('POST', 'repos/{repo}/issues', { title, body, labels, ...(milestone ? { milestone: milestone.id } : {}) }));
    },
    async updateIssue(n, { title, body, labels, milestone, state, reason }) {
      const payload = {
        ...(title !== undefined ? { title } : {}),
        ...(body !== undefined ? { body } : {}),
        ...(labels ? { labels } : {}),
        ...(milestone ? { milestone: milestone.id } : {}),
        ...(state ? { state, ...(state === 'closed' && reason ? { state_reason: reason === 'done' ? 'completed' : 'not_planned' } : {}) } : {}),
      };
      return issue(gh.api('PATCH', `repos/{repo}/issues/${n}`, payload));
    },
    async comment(n, body) {
      gh.api('POST', `repos/{repo}/issues/${n}/comments`, { body });
    },
    async labels() {
      return gh.list('repos/{repo}/labels').map((l) => ({ name: l.name, color: l.color.toLowerCase(), description: l.description ?? '' }));
    },
    async createLabel(l) {
      gh.api('POST', 'repos/{repo}/labels', l);
    },
    async updateLabel(name, { color, description }) {
      gh.api('PATCH', `repos/{repo}/labels/${encodeURIComponent(name)}`, { color, description });
    },
    async milestones() {
      return gh.list('repos/{repo}/milestones?state=all').map((m) => ({ id: m.number, title: m.title }));
    },
    async createMilestone(m) {
      gh.api('POST', 'repos/{repo}/milestones', m);
    },
    async updateMilestone(id, m) {
      gh.api('PATCH', `repos/{repo}/milestones/${id}`, m);
    },
    async findChange(branch) {
      try {
        const url = sh(['pr', 'view', branch, '--json', 'url', '-q', '.url']);
        return url ? { url } : null;
      } catch {
        return null;
      }
    },
    async createChange({ head, base, title, body, draft }) {
      return sh(['pr', 'create', '--base', base, '--head', head, '--title', title, '--body-file', '-', ...(draft ? ['--draft'] : [])], body);
    },
    async mergeChange(n, { dry = false } = {}) {
      const pr = JSON.parse(sh(['pr', 'view', String(n), '--json', 'number,title,headRefName,baseRefName,state,isDraft,mergeable,statusCheckRollup,commits,headRefOid']));
      const reasons = [];
      if (pr.state !== 'OPEN') reasons.push(`state=${pr.state}`);
      if (pr.baseRefName !== cfg.mainBranch) reasons.push(`base=${pr.baseRefName}`);
      if (pr.isDraft) reasons.push('draft');
      if (pr.mergeable === 'CONFLICTING') reasons.push('conflicts');
      const ci = ciState(pr.statusCheckRollup);
      if (ci !== 'pass') reasons.push(`ci=${ci}`);
      const result = {
        number: pr.number,
        title: pr.title,
        source: pr.headRefName,
        target: pr.baseRefName,
        commits: (pr.commits ?? []).map((c) => ({ id: String(c.oid).slice(0, 8), title: c.messageHeadline })),
        reasons,
        merged: false,
      };
      if (reasons.length || dry) return result;
      sh(['pr', 'merge', String(n), '--merge', '--match-head-commit', pr.headRefOid]);
      return { ...result, merged: true };
    },
    async syncWiki(pages, { prune = false, keep = ['Home'], dry = false } = {}) {
      const dir = mkdtempSync(path.join(os.tmpdir(), 'backlog-kit-wiki-'));
      try {
        const git = (...a) => execFileSync('git', ['-c', 'credential.helper=', '-c', 'credential.helper=!gh auth git-credential', ...a], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
        git('clone', '-q', `https://github.com/${gh.repo()}.wiki.git`, '.');
        const report = syncWikiDir(dir, pages, { prune, keep });
        if (!dry && (report.created.length || report.updated.length || report.deleted.length)) {
          git('add', '-A');
          git('-c', 'user.name=backlog-kit', '-c', 'user.email=backlog-kit@localhost', 'commit', '-q', '-m', 'backlog-kit: wiki desde .pm/');
          git('push', '-q');
        }
        return report;
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
    wikiUrl: () => `https://github.com/${gh.repo()}/wiki`,
    async openChanges() {
      const out = sh(['pr', 'list', '--state', 'open', '--limit', '200', '--json', 'number,headRefName,url,isDraft,statusCheckRollup']);
      return JSON.parse(out).map((p) => ({ number: p.number, branch: p.headRefName, url: p.url, draft: p.isDraft, ci: ciState(p.statusCheckRollup) }));
    },
  };
}

// ── GitLab ──────────────────────────────────────────────────────────────────────────────────────

function createGitlab(root, cfg) {
  const f = cfg.forge ?? {};
  const tokenEnv = f.tokenEnv ?? 'GITLAB_TOKEN';
  const urlEnv = f.urlEnv ?? 'GITLAB_URL';
  let cached;

  function settings() {
    if (cached) return cached;
    const url = (f.url || process.env[urlEnv] || fromEnvFiles(root, urlEnv) || '').replace(/\/+$/, '');
    if (!url) throw new Error(`GitLab: falta forge.url en .pm/config.json o ${urlEnv} / missing forge.url or ${urlEnv}`);
    let project = f.project;
    if (!project) {
      const remote = execFileSync('git', ['remote', 'get-url', 'origin'], { cwd: root, encoding: 'utf8' }).trim();
      project = projectFromRemote(remote);
      if (!project) throw new Error(`GitLab: no saco el proyecto del remote / cannot derive project from origin: ${remote}`);
    }
    return (cached = { url, project, api: `${url}/api/v4/projects/${encodeURIComponent(project)}` });
  }

  function token() {
    const t = process.env[tokenEnv] || fromEnvFiles(root, tokenEnv);
    if (!t) throw new Error(`GitLab: falta el token en ${tokenEnv} (entorno o .env.local) / missing token in ${tokenEnv}`);
    return t;
  }

  async function req(method, endpoint, body) {
    const { api } = settings();
    const res = await fetch(`${api}${endpoint}`, {
      method,
      headers: { 'PRIVATE-TOKEN': token(), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`GitLab ${method} ${endpoint}: ${res.status} ${text.slice(0, 300)}`);
    return text ? JSON.parse(text) : null;
  }

  async function list(endpoint) {
    const out = [];
    const sep = endpoint.includes('?') ? '&' : '?';
    for (let page = 1; ; page++) {
      const items = await req('GET', `${endpoint}${sep}per_page=100&page=${page}`);
      out.push(...items);
      if (items.length < 100) return out;
    }
  }

  const issue = (i) => ({
    number: i.iid,
    title: i.title,
    body: i.description ?? '',
    state: i.state === 'closed' ? 'closed' : 'open',
    labels: i.labels ?? [],
    milestone: i.milestone?.title ?? null,
  });
  const color = (c) => `#${String(c).replace(/^#/, '')}`;
  const web = () => `${settings().url}/${settings().project}`;

  return {
    provider: 'gitlab',
    webUrl: web,
    issueUrl: (n) => `${web()}/-/issues/${n}`,
    blobUrl: (relPath, ref = cfg.mainBranch) => `${web()}/-/blob/${ref}/${relPath.split('/').map(encodeURIComponent).join('/')}`,
    async getIssue(n) {
      return issue(await req('GET', `/issues/${n}`));
    },
    async issues() {
      return (await list('/issues?state=all&scope=all')).map(issue);
    },
    async createIssue({ title, body, labels, milestone }) {
      return issue(await req('POST', '/issues', { title, description: body, labels: labels.join(','), ...(milestone ? { milestone_id: milestone.id } : {}) }));
    },
    async updateIssue(n, { title, body, labels, milestone, state }) {
      const payload = {
        ...(title !== undefined ? { title } : {}),
        ...(body !== undefined ? { description: body } : {}),
        // La lista completa en `labels`: con add_labels y remove_labels en el mismo PUT, gana el remove.
        ...(labels ? { labels: labels.join(',') } : {}),
        ...(milestone ? { milestone_id: milestone.id } : {}),
        ...(state ? { state_event: state === 'closed' ? 'close' : 'reopen' } : {}),
      };
      return issue(await req('PUT', `/issues/${n}`, payload));
    },
    async comment(n, body) {
      await req('POST', `/issues/${n}/notes`, { body });
    },
    async labels() {
      return (await list('/labels')).map((l) => ({ name: l.name, color: String(l.color).replace(/^#/, '').toLowerCase(), description: l.description ?? '' }));
    },
    async createLabel(l) {
      await req('POST', '/labels', { name: l.name, color: color(l.color), description: l.description });
    },
    async updateLabel(name, { color: c, description }) {
      await req('PUT', `/labels/${encodeURIComponent(name)}`, { color: color(c), description });
    },
    async milestones() {
      return (await list('/milestones')).map((m) => ({ id: m.id, title: m.title }));
    },
    async createMilestone(m) {
      await req('POST', '/milestones', m);
    },
    async updateMilestone(id, m) {
      await req('PUT', `/milestones/${id}`, m);
    },
    async findChange(branch) {
      const mrs = await req('GET', `/merge_requests?state=opened&source_branch=${encodeURIComponent(branch)}`);
      return mrs[0] ? { url: `${web()}/-/merge_requests/${mrs[0].iid}`, number: mrs[0].iid } : null;
    },
    async createChange({ head, base, title, body, draft }) {
      const mr = await req('POST', '/merge_requests', {
        source_branch: head,
        target_branch: base,
        title: draft ? `Draft: ${title}` : title,
        description: body,
        remove_source_branch: true,
      });
      return `${web()}/-/merge_requests/${mr.iid}`;
    },
    async mergeChange(n, { dry = false } = {}) {
      let mr = await req('GET', `/merge_requests/${n}`);
      // GitLab calcula si se puede mergear en segundo plano: se espera a que termine.
      for (let i = 0; i < 20 && ['checking', 'unchecked', 'preparing', 'approvals_syncing'].includes(mr.detailed_merge_status); i++) {
        await new Promise((r) => setTimeout(r, 2000));
        mr = await req('GET', `/merge_requests/${n}`);
      }
      const reasons = [];
      if (mr.state !== 'opened') reasons.push(`state=${mr.state}`);
      if (mr.target_branch !== cfg.mainBranch) reasons.push(`base=${mr.target_branch}`);
      if (mr.draft || mr.work_in_progress) reasons.push('draft');
      if (mr.has_conflicts) reasons.push('conflicts');
      if (mr.detailed_merge_status && mr.detailed_merge_status !== 'mergeable') reasons.push(`merge_status=${mr.detailed_merge_status}`);
      if (mr.head_pipeline && ciState(mr.head_pipeline.status) !== 'pass') reasons.push(`ci=${mr.head_pipeline.status}`);
      const commits = await list(`/merge_requests/${n}/commits`);
      const result = {
        number: mr.iid,
        title: mr.title,
        source: mr.source_branch,
        target: mr.target_branch,
        commits: commits.map((c) => ({ id: c.short_id, title: c.title })),
        reasons,
        merged: false,
      };
      if (reasons.length || dry) return result;
      await req('PUT', `/merge_requests/${n}/merge`, { should_remove_source_branch: false, sha: mr.sha });
      return { ...result, merged: true };
    },
    async syncWiki(pages, { prune = false, keep = ['home'], dry = false } = {}) {
      const existing = new Map((await req('GET', '/wikis?with_content=1')).map((p) => [p.slug, p]));
      const report = { created: [], updated: [], deleted: [], unchanged: [] };
      const wanted = new Set(pages.map((p) => wikiSlug(p.title)));
      if (prune)
        for (const slug of existing.keys()) {
          if (wanted.has(slug) || keep.some((k) => k.toLowerCase() === slug.toLowerCase())) continue;
          if (!dry) await req('DELETE', `/wikis/${encodeURIComponent(slug)}`);
          report.deleted.push(slug);
        }
      for (const p of pages) {
        const slug = wikiSlug(p.title);
        if (existing.has(slug)) {
          if (existing.get(slug).content === p.content) {
            report.unchanged.push(p.title);
            continue;
          }
          if (!dry) await req('PUT', `/wikis/${encodeURIComponent(slug)}`, { title: p.title, content: p.content, format: 'markdown' });
          report.updated.push(p.title);
        } else {
          if (!dry) await req('POST', '/wikis', { title: p.title, content: p.content, format: 'markdown' });
          report.created.push(p.title);
        }
      }
      return report;
    },
    wikiUrl: () => `${web()}/-/wikis/home`,
    async openChanges() {
      const mrs = await list('/merge_requests?state=opened');
      return Promise.all(
        mrs.map(async (m) => {
          let ci = 'none';
          try {
            const [p] = await req('GET', `/pipelines?ref=${encodeURIComponent(m.source_branch)}&per_page=1`);
            ci = ciState(p?.status ?? '');
          } catch {
            // sin permiso a pipelines: sin semáforo
          }
          return { number: m.iid, branch: m.source_branch, url: `${web()}/-/merge_requests/${m.iid}`, draft: Boolean(m.draft ?? m.work_in_progress), ci };
        }),
      );
    },
  };
}
