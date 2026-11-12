// Panel lateral en el Explorador: historias agrupadas por estado, con las acciones de siempre.
import * as vscode from 'vscode';
import type { IndexedStory, ProjectIndex } from './index';

const ICONS: Record<string, string> = {
  backlog: 'circle-outline',
  refining: 'edit',
  ready: 'pass',
  inProgress: 'play-circle',
  review: 'eye',
  done: 'check-all',
  blocked: 'error',
  discarded: 'circle-slash',
};

type Node = { kind: 'state'; role: string; name: string } | { kind: 'story'; story: IndexedStory };

export class StoryTree implements vscode.TreeDataProvider<Node> {
  private readonly emitter = new vscode.EventEmitter<Node | undefined>();
  readonly onDidChangeTreeData = this.emitter.event;
  branch = '';

  constructor(private index: () => ProjectIndex | undefined) {}

  refresh() {
    this.emitter.fire(undefined);
  }

  getTreeItem(node: Node): vscode.TreeItem {
    if (node.kind === 'state') {
      const count = this.storiesIn(node.name).length;
      const item = new vscode.TreeItem(`${node.name.replace(/_/g, ' ')} (${count})`, ['inProgress', 'review', 'blocked'].includes(node.role) ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed);
      item.iconPath = new vscode.ThemeIcon(ICONS[node.role] ?? 'circle-outline');
      item.contextValue = 'state';
      return item;
    }
    const s = node.story;
    const item = new vscode.TreeItem(`${s.id} ${s.title}`);
    const mine = this.branch && s.branch === this.branch;
    item.description = [mine ? '⎇' : '', s.priority, s.criteria.total ? `${s.criteria.done}/${s.criteria.total}` : '', s.pendingDeps.length ? `⧗ ${s.pendingDeps.join(', ')}` : ''].filter(Boolean).join(' · ');
    item.tooltip = new vscode.MarkdownString(`**${s.id}** — ${s.title}\n\n${s.status} · ${s.priority ?? '—'} · ${s.epic} ${s.epicTitle}`);
    item.iconPath = new vscode.ThemeIcon(ICONS[s.role] ?? 'circle-outline');
    item.contextValue = 'story';
    item.command = { command: 'backlogKit.openStory', title: s.id, arguments: [s.id] };
    item.resourceUri = vscode.Uri.file(s.path);
    return item;
  }

  private storiesIn(status: string) {
    const ix = this.index();
    if (!ix) return [];
    const prio = (p: string | null) => (p ? ix.cfg.priorities.indexOf(p) : 99);
    return [...ix.stories.values()].filter((s) => s.status === status).sort((a, b) => prio(a.priority) - prio(b.priority) || a.id.localeCompare(b.id));
  }

  getChildren(node?: Node): Node[] {
    const ix = this.index();
    if (!ix) return [];
    if (!node) return Object.entries(ix.cfg.states as Record<string, string>).map(([role, name]) => ({ kind: 'state' as const, role, name }));
    if (node.kind === 'state') return this.storiesIn(node.name).map((story) => ({ kind: 'story' as const, story }));
    return [];
  }
}

export function storyFromArg(arg: any): IndexedStory | undefined {
  return arg?.kind === 'story' ? arg.story : undefined;
}
