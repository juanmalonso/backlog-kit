// Backlog Kit para VS Code: tablero kanban sobre .pm/ e init del proyecto.
import * as vscode from 'vscode';
import { BoardPanel } from './board/panel';
import { runUpgrade, runWizard } from './init/wizard';
import { configOf, currentBranch, findRoot, storyByBranch } from './project';

export function activate(context: vscode.ExtensionContext) {
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
  status.command = 'backlogKit.openBoard';
  context.subscriptions.push(status);

  // La historia de la rama actual, siempre a la vista. Clic: abre el tablero.
  const updateStatus = async () => {
    const root = findRoot();
    if (!root) return status.hide();
    try {
      const story = storyByBranch(root, await currentBranch(root));
      const en = configOf(root).language === 'en';
      if (story) {
        status.text = `$(project) ${story.id} · ${story.status} · ${story.criteria.done}/${story.criteria.total}`;
        status.tooltip = `${story.title}\n${en ? 'Open board' : 'Abrir tablero'}`;
      } else {
        status.text = '$(project) Backlog';
        status.tooltip = en ? 'Open board' : 'Abrir tablero';
      }
      status.show();
    } catch {
      status.hide();
    }
  };

  context.subscriptions.push(
    vscode.commands.registerCommand('backlogKit.openBoard', async () => {
      let root = findRoot();
      if (!root) {
        const init = 'Inicializar / Initialize';
        const choice = await vscode.window.showWarningMessage(
          'Este proyecto no tiene .pm/config.json / This project has no .pm/config.json',
          init,
        );
        if (choice !== init) return;
        root = await runWizard(context);
        if (!root) return;
      }
      BoardPanel.show(context, root);
    }),
    vscode.commands.registerCommand('backlogKit.init', async () => {
      if (await runWizard(context)) void updateStatus();
    }),
    vscode.commands.registerCommand('backlogKit.refresh', () => BoardPanel.current?.refresh()),
    vscode.commands.registerCommand('backlogKit.upgrade', () => runUpgrade(context)),
  );

  const watcher = vscode.workspace.createFileSystemWatcher('**/{.pm/**,.git/HEAD}');
  watcher.onDidChange(updateStatus);
  watcher.onDidCreate(updateStatus);
  context.subscriptions.push(watcher);
  void updateStatus();
}

export function deactivate() {}
