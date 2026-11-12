// Cliente mínimo de la API de GitHub vía el CLI `gh` (ya autenticado).
import { execFileSync } from 'node:child_process';

export function createGh(root, cfg) {
  let cachedRepo;
  const issueRe = new RegExp(`^\\[(${cfg.idPattern})\\]`);

  /** owner/name del repo. GH_REPO pisa lo que diga el remote origin. */
  function repo() {
    if (cachedRepo) return cachedRepo;
    if (process.env.GH_REPO) return (cachedRepo = process.env.GH_REPO);
    const url = execFileSync('git', ['remote', 'get-url', 'origin'], { cwd: root, encoding: 'utf8' }).trim();
    const m = url.match(/github\.com[:/]([^/]+\/[^/]+?)(\.git)?$/);
    if (!m) throw new Error(`El remote origin no es de GitHub / origin is not a GitHub remote: ${url}`);
    return (cachedRepo = m[1]);
  }

  function api(method, endpoint, body) {
    const args = ['api', '-X', method, endpoint.replace('{repo}', repo()), '-H', 'Accept: application/vnd.github+json'];
    if (body !== undefined) args.push('--input', '-');
    try {
      const out = execFileSync('gh', args, {
        cwd: root,
        encoding: 'utf8',
        input: body === undefined ? undefined : JSON.stringify(body),
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      return out.trim() ? JSON.parse(out) : null;
    } catch (err) {
      const detail = (err.stdout || err.stderr || err.message).toString().trim();
      throw new Error(`gh api ${method} ${endpoint}: ${detail}`, { cause: err });
    }
  }

  /** GET paginado: todos los elementos. */
  function list(endpoint) {
    const sep = endpoint.includes('?') ? '&' : '?';
    const out = execFileSync('gh', ['api', '--paginate', '--slurp', `${endpoint.replace('{repo}', repo())}${sep}per_page=100`], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return JSON.parse(out).flat();
  }

  const issueUrl = (n) => `https://github.com/${repo()}/issues/${n}`;
  const blobUrl = (relPath, ref = cfg.mainBranch) =>
    `https://github.com/${repo()}/blob/${ref}/${relPath.split('/').map(encodeURIComponent).join('/')}`;

  /** Issues (no PRs) cuyo título empieza con [<ID>]. */
  function storyIssues() {
    return list('repos/{repo}/issues?state=all')
      .filter((i) => !i.pull_request)
      .map((i) => ({ ...i, story: i.title.match(issueRe)?.[1] ?? null }));
  }

  return { repo, api, list, issueUrl, blobUrl, storyIssues };
}
