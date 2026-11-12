// Backlog Kit para VS Code: tablero, panel lateral, enlaces y hover de ids, errores del guard en
// Problemas e init del proyecto.
import * as vscode from 'vscode';
import { changed, logStory, openPr, openReadme, pickAndMove, startStory } from './actions';
import { workWithClaude } from './claude';
import { BoardPanel } from './board/panel';
import { createStory } from './board/create';
import { runGuard } from './editor/diagnostics';
import { ProjectIndex } from './editor/index';
import { registerLinks } from './editor/links';
import { StoryTree, storyFromArg } from './editor/tree';
import { runUpgrade, runWizard } from './init/wizard';
import { configOf, currentBranch, findRoot, storyByBranch } from './project';

export function activate(context: vscode.ExtensionContext) {
  let index: ProjectIndex | undefined;
  const getIndex = () => index;
  const tree = new StoryTree(getIndex);
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
  status.command = 'backlogKit.openBoard';

  const rebuild = () => {
    const root = findRoot();
    try {
      index = root ? new ProjectIndex(root) : undefined;
    } catch {
      index = undefined;
    }
    void vscode.commands.executeCommand('setContext', 'backlogKit.active', Boolean(index));
    tree.refresh();
  };

  // La historia de la rama actual, siempre a la vista. Clic: abre el tablero.
  const updateStatus = async () => {
    const root = findRoot();
    if (!root) return status.hide();
    try {
      const branch = await currentBranch(root);
      tree.branch = branch;
      const story = storyByBranch(root, branch);
      const en = configOf(root).language === 'en';
      status.text = story ? `$(project) ${story.id} · ${story.status} · ${story.criteria.done}/${story.criteria.total}` : '$(project) Backlog';
      status.tooltip = story ? `${story.title}\n${en ? 'Open board' : 'Abrir tablero'}` : en ? 'Open board' : 'Abrir tablero';
      status.show();
    } catch {
      status.hide();
    }
  };

  let guardTimer: NodeJS.Timeout | undefined;
  const scheduleGuard = () => {
    clearTimeout(guardTimer);
    guardTimer = setTimeout(() => {
      const root = findRoot();
      if (root && index) void runGuard(root, index);
    }, 400);
  };
  const refreshAll = () => {
    rebuild();
    void updateStatus();
    scheduleGuard();
  };

  const withRoot = (fn: (root: string) => unknown) => () => {
    const root = findRoot();
    if (!root) return vscode.window.showWarningMessage('Este proyecto no tiene .pm/config.json / This project has no .pm/config.json');
    return fn(root);
  };
  const storyCommand = (fn: (root: string, s: { id: string; status: string; path: string }) => unknown) => (arg: any) => {
    const root = findRoot();
    const s = storyFromArg(arg) ?? (typeof arg === 'string' ? index?.stories.get(arg) : undefined);
    if (root && s) return fn(root, s);
  };

  context.subscriptions.push(
    status,
    changed,
    vscode.window.registerTreeDataProvider('backlogKit.stories', tree),
    registerLinks(getIndex),
    vscode.commands.registerCommand('backlogKit.openBoard', async () => {
      let root = findRoot();
      if (!root) {
        const init = 'Inicializar / Initialize';
        const choice = await vscode.window.showWarningMessage('Este proyecto no tiene .pm/config.json / This project has no .pm/config.json', init);
        if (choice !== init) return;
        root = await runWizard(context);
        if (!root) return;
        refreshAll();
      }
      BoardPanel.show(context, root);
    }),
    vscode.commands.registerCommand('backlogKit.openStory', (id: string) => {
      const root = findRoot();
      if (!root) return;
      const panel = BoardPanel.show(context, root);
      setTimeout(() => panel.select(id), BoardPanel.current === panel ? 0 : 400);
    }),
    vscode.commands.registerCommand('backlogKit.init', async () => {
      if (await runWizard(context)) refreshAll();
    }),
    vscode.commands.registerCommand('backlogKit.upgrade', () => runUpgrade(context)),
    vscode.commands.registerCommand('backlogKit.refresh', () => {
      refreshAll();
      return BoardPanel.current?.refresh(true);
    }),
    vscode.commands.registerCommand('backlogKit.newStory', withRoot(async (root) => {
      const id = await createStory(root);
      if (id) vscode.commands.executeCommand('backlogKit.openStory', id);
    })),
    vscode.commands.registerCommand('backlogKit.story.move', storyCommand((root, s) => pickAndMove(root, s.id, s.status))),
    vscode.commands.registerCommand('backlogKit.story.start', storyCommand((root, s) => startStory(root, s.id))),
    vscode.commands.registerCommand('backlogKit.story.log', storyCommand((root, s) => logStory(root, s.id))),
    vscode.commands.registerCommand('backlogKit.story.pr', storyCommand((root, s) => openPr(root, s.id))),
    vscode.commands.registerCommand('backlogKit.story.claude', storyCommand((root, s) => workWithClaude(root, s.id, s.status))),
    vscode.commands.registerCommand('backlogKit.story.readme', storyCommand((_root, s) => openReadme(s.path, false))),
  );

  // Cambios en .pm/, en la rama o en las carpetas de docs: índice, panel, barra de estado y guard.
  const watcher = vscode.workspace.createFileSystemWatcher('**/{.pm/**,.git/HEAD,docs/**,wiki/decisiones/**,wiki/hallazgos/**}');
  let timer: NodeJS.Timeout | undefined;
  const onFs = () => {
    clearTimeout(timer);
    timer = setTimeout(refreshAll, 250);
  };
  watcher.onDidChange(onFs);
  watcher.onDidCreate(onFs);
  watcher.onDidDelete(onFs);
  context.subscriptions.push(watcher, changed.event(onFs));
  refreshAll();
}

export function deactivate() {}
