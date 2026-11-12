// Crear una historia desde el tablero: pregunta épica, nombre, tipo, prioridad y estado, y corre
// `pm:new` del proyecto (próximo id, plantilla, backlog e issue, igual que en la terminal).
import path from 'node:path';
import * as vscode from 'vscode';
import { createPm } from '../../kit/scripts/lib/pm.mjs';
import { run } from '../project';

export async function createStory(root: string): Promise<string | undefined> {
  const pm = createPm(root);
  const { cfg } = pm;
  const en = cfg.language === 'en';
  const title0 = en ? 'New story' : 'Nueva historia';
  const epic = await vscode.window.showQuickPick(
    pm.loadEpics().map((e: any) => ({ label: e.id, description: e.title })),
    { title: title0, placeHolder: en ? 'Epic' : 'Épica', ignoreFocusOut: true },
  );
  if (!epic) return;
  const name = await vscode.window.showInputBox({ title: title0, prompt: en ? 'Title (max 80 characters)' : 'Nombre (máx. 80 caracteres)', ignoreFocusOut: true, validateInput: (v) => (v.trim().length > 80 ? '≤ 80' : null) });
  if (!name?.trim()) return;
  const type = await vscode.window.showQuickPick(cfg.types, { title: title0, placeHolder: en ? 'Type' : 'Tipo', ignoreFocusOut: true });
  if (!type) return;
  const priority = await vscode.window.showQuickPick(cfg.priorities, { title: title0, placeHolder: en ? 'Priority' : 'Prioridad', ignoreFocusOut: true });
  if (!priority) return;
  const status = await vscode.window.showQuickPick(
    [
      { label: cfg.states.refining, description: en ? 'will be worked on soon (creates the issue)' : 'se va a trabajar pronto (crea el issue)' },
      { label: cfg.states.backlog, description: en ? 'just noted' : 'solo se anota' },
    ],
    { title: title0, ignoreFocusOut: true },
  );
  if (!status) return;
  const r = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: `pm:new…` }, () =>
    run(root, 'node', [path.join('scripts', 'pm', 'new.mjs'), '--epic', epic.label, '--title', name.trim(), '--type', type, '--priority', priority, '--status', status.label]),
  );
  if (!r.ok) {
    vscode.window.showErrorMessage(r.out.replace(/^✗\s*/, ''));
    return;
  }
  const id = r.out.match(new RegExp(cfg.idPattern))?.[0];
  vscode.window.setStatusBarMessage(r.out.split('\n')[0], 5000);
  return id;
}
