// Errores del guard (`scripts/pm/check.mjs`) en la pestaña Problemas, en la línea del README que
// corresponde, apenas se guarda algo en .pm/.
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import * as vscode from 'vscode';
import { run } from '../project';
import type { ProjectIndex } from './index';

export const collection = vscode.languages.createDiagnosticCollection('backlog-kit');

/** Línea del frontmatter donde está la clave que nombra el mensaje. */
function lineFor(file: string, message: string, keys: string[]): number {
  try {
    const lines = readFileSync(file, 'utf8').split('\n');
    const key = keys.find((k) => new RegExp(`(^|[\\s"(])${k}\\b`).test(message));
    if (key) {
      const i = lines.findIndex((l) => l.startsWith(`${key}:`));
      if (i >= 0) return i;
    }
  } catch {
    // archivo inexistente: primera línea
  }
  return 0;
}

export function parseGuardOutput(out: string, root: string, ix: ProjectIndex) {
  const keys = [...Object.values(ix.cfg.keys as Record<string, string>), ...ix.cfg.fields.map((f: any) => f.key), 'epica', 'épica'];
  const byFile = new Map<string, vscode.Diagnostic[]>();
  const add = (file: string, line: number, message: string) => {
    const d = new vscode.Diagnostic(new vscode.Range(line, 0, line, 200), message, vscode.DiagnosticSeverity.Error);
    d.source = 'pm:check';
    byFile.set(file, [...(byFile.get(file) ?? []), d]);
  };
  for (const raw of out.split('\n')) {
    const m = raw.match(/^\s+- (.*)$/);
    if (!m) continue;
    const item = m[1];
    const fm = item.match(/^([^\s:]+\.md): (.*)$/);
    if (fm) {
      const file = path.join(root, fm[1]);
      add(file, lineFor(file, fm[2], keys.map((k) => k.replace('é', 'e'))), fm[2]);
      continue;
    }
    // Sin archivo (duplicados, ciclos, dependencias): al README de la primera historia que nombra.
    const id = item.match(ix.storyRe)?.[0];
    ix.storyRe.lastIndex = 0;
    const story = id ? ix.stories.get(id) : undefined;
    const file = story?.path ?? path.join(root, '.pm', 'backlog.md');
    add(file, story ? lineFor(file, item, [ix.cfg.keys.status]) : 0, item);
  }
  return byFile;
}

export async function runGuard(root: string, ix: ProjectIndex) {
  if (!existsSync(path.join(root, 'scripts', 'pm', 'check.mjs'))) return;
  const r = await run(root, 'node', [path.join('scripts', 'pm', 'check.mjs'), '--quiet']);
  collection.clear();
  if (r.ok) return;
  for (const [file, diags] of parseGuardOutput(r.out, root, ix)) collection.set(vscode.Uri.file(file), diags);
}
