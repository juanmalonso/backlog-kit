// Índice en memoria de historias, ADRs y hallazgos para enlaces, hover y panel lateral. Se
// reconstruye cuando cambia algo en .pm/ o en las carpetas de decisiones y hallazgos.
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { createPm } from '../../kit/scripts/lib/pm.mjs';
import { dependencyIndex } from '../../kit/scripts/lib/insights.mjs';

export interface IndexedStory {
  id: string;
  title: string;
  status: string;
  role: string;
  priority: string | null;
  epic: string;
  epicTitle: string;
  branch: string | null;
  criteria: { done: number; total: number };
  pendingDeps: string[];
  path: string;
}

export class ProjectIndex {
  stories = new Map<string, IndexedStory>();
  docs = new Map<string, string>();
  cfg: any;
  storyRe!: RegExp;
  docRe!: RegExp;

  constructor(readonly root: string) {
    this.rebuild();
  }

  rebuild() {
    const pm = createPm(this.root);
    this.cfg = pm.cfg;
    const views = pm.loadStories().filter((s: any) => s.data).map((s: any) => pm.view(s));
    const idx = dependencyIndex(views, this.cfg);
    this.stories = new Map(
      views.map((v: any) => [
        v.id,
        {
          id: v.id,
          title: v.title,
          status: v.status,
          role: this.cfg.roleOf(v.status) ?? 'backlog',
          priority: v.priority,
          epic: v.epic,
          epicTitle: v.epicTitle,
          branch: v.branch,
          criteria: v.criteria,
          pendingDeps: idx.pending.get(v.id) ?? [],
          path: v.file,
        },
      ]),
    );
    // ADR-NNN-*.md y <HALLAZGO>-NNN-*.md en las carpetas de docs del config.
    this.docs = new Map();
    const docPrefixes = ['ADR', this.cfg.docs?.findingPrefix].filter(Boolean);
    for (const dir of [this.cfg.docs?.decisions, this.cfg.docs?.findings].filter(Boolean)) {
      const abs = path.join(this.root, dir);
      if (!existsSync(abs)) continue;
      for (const f of readdirSync(abs)) {
        const m = f.match(new RegExp(`^((?:${docPrefixes.join('|')})-\\d+)`));
        if (m) this.docs.set(m[1], path.join(abs, f));
      }
    }
    this.storyRe = new RegExp(`\\b${this.cfg.storyPrefix}-\\d{${this.cfg.idDigits}}\\b`, 'g');
    this.docRe = new RegExp(`\\b(?:${docPrefixes.join('|')})-\\d{3,}\\b`, 'g');
  }
}
