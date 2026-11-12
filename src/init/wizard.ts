// Asistente de init en VS Code: pregunta lo mínimo, muestra qué va a crear y aplica el mismo plan
// que la CLI (scaffold.mjs).
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import * as vscode from 'vscode';
import { applyInit, planInit } from './scaffold.mjs';

type Lang = 'es' | 'en';

const T = {
  es: {
    title: 'Backlog Kit: inicializar proyecto',
    prefix: 'Prefijo de las historias (HU-001, US-001, …)',
    main: 'Rama principal que se protege',
    check: 'Comando que tiene que pasar antes de review',
    epic: 'Nombre de la primera épica',
    components: 'Qué instalar (además de .pm/ y los scripts)',
    fields: 'Campos extra de cada historia (opcional)',
    skills: ['Skills y CLAUDE.md', 'Skills /hu-* /doc-*, sección de workflow en CLAUDE.md y hook del guard'],
    github: ['GitHub Issues', 'Un issue por historia con labels y milestone por épica (usa el CLI gh)'],
    gitGuard: ['Protección de la rama principal', 'git-guard para Claude Code y hook pre-push'],
    ci: ['Workflow de CI', '.github/workflows/backlog.yml corre el guard en cada PR'],
    fieldNames: { phase: 'Fase (MVP / V1 / DESPUES)', stage: 'Etapa (0–4)', requirements: 'Requisitos (lista)', spec: 'Códigos de spec (lista)' },
    confirm: (c: number, u: number, m: number, s: number) => `Crear ${c}, actualizar ${u}, fusionar ${m}, dejar ${s} como están`,
    apply: 'Aplicar',
    show: 'Ver la lista',
    done: 'Backlog Kit listo.',
    open: 'Abrir tablero',
    setup: 'Crear labels en GitHub',
    conflicts: (n: number) => `El proyecto ya tiene ${n} archivo(s) con el mismo nombre que no son de backlog-kit (la lista está abierta). No se cambió nada.`,
  },
  en: {
    title: 'Backlog Kit: initialize project',
    prefix: 'Story prefix (US-001, HU-001, …)',
    main: 'Main branch to protect',
    check: 'Command that must pass before review',
    epic: 'Name of the first epic',
    components: 'What to install (besides .pm/ and the scripts)',
    fields: 'Extra fields on each story (optional)',
    skills: ['Skills and CLAUDE.md', '/story-* /doc-* skills, workflow section in CLAUDE.md and guard hook'],
    github: ['GitHub Issues', 'One issue per story with labels and a milestone per epic (uses the gh CLI)'],
    gitGuard: ['Main branch protection', 'git-guard for Claude Code and a pre-push hook'],
    ci: ['CI workflow', '.github/workflows/backlog.yml runs the guard on every PR'],
    fieldNames: { phase: 'Phase (MVP / V1 / LATER)', stage: 'Stage (0–4)', requirements: 'Requirements (list)', spec: 'Spec codes (list)' },
    confirm: (c: number, u: number, m: number, s: number) => `Create ${c}, update ${u}, merge ${m}, leave ${s} untouched`,
    apply: 'Apply',
    show: 'Show the list',
    done: 'Backlog Kit is ready.',
    open: 'Open board',
    setup: 'Create GitHub labels',
    conflicts: (n: number) => `The project already has ${n} file(s) with the same name not created by backlog-kit (the list is open). Nothing was changed.`,
  },
};

function guessCheck(root: string) {
  try {
    const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
    if (pkg.scripts?.check) return 'npm run check';
    if (pkg.scripts?.test && !/no test specified/.test(pkg.scripts.test)) return 'npm test';
  } catch {
    // sin package.json
  }
  return 'npm run pm:check';
}

export async function runWizard(context: vscode.ExtensionContext): Promise<string | undefined> {
  const folder =
    (vscode.workspace.workspaceFolders?.length ?? 0) > 1
      ? await vscode.window.showWorkspaceFolderPick()
      : vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    vscode.window.showErrorMessage('Abrí una carpeta primero / Open a folder first.');
    return;
  }
  const root = folder.uri.fsPath;

  const langPick = await vscode.window.showQuickPick(
    [
      { label: 'Español', description: 'HU-001, EN_CURSO, skills /hu-*', value: 'es' as Lang },
      { label: 'English', description: 'US-001, IN_PROGRESS, /story-* skills', value: 'en' as Lang },
    ],
    { title: 'Backlog Kit', placeHolder: 'Idioma / Language', ignoreFocusOut: true },
  );
  if (!langPick) return;
  const lang = langPick.value;
  const t = T[lang];
  const ask = (prompt: string, value: string) => vscode.window.showInputBox({ title: t.title, prompt, value, ignoreFocusOut: true });

  const storyPrefix = await ask(t.prefix, lang === 'en' ? 'US' : 'HU');
  if (!storyPrefix) return;
  const mainBranch = await ask(t.main, 'main');
  if (!mainBranch) return;
  const checkCommand = await ask(t.check, guessCheck(root));
  if (checkCommand === undefined) return;
  const epicTitle = await ask(t.epic, lang === 'en' ? 'Foundations' : 'Fundaciones');
  if (!epicTitle) return;

  const comps = await vscode.window.showQuickPick(
    (['skills', 'github', 'gitGuard', 'ci'] as const).map((k) => ({ label: t[k][0], detail: t[k][1], key: k, picked: true })),
    { title: t.title, placeHolder: t.components, canPickMany: true, ignoreFocusOut: true },
  );
  if (!comps) return;
  const fields = await vscode.window.showQuickPick(
    (Object.entries(t.fieldNames) as [string, string][]).map(([key, label]) => ({ label, key })),
    { title: t.title, placeHolder: t.fields, canPickMany: true, ignoreFocusOut: true },
  );
  if (!fields) return;

  const on = new Set(comps.map((c) => c.key));
  const kitDir = vscode.Uri.joinPath(context.extensionUri, 'kit').fsPath;
  const plan = planInit(
    root,
    {
      language: lang,
      storyPrefix,
      mainBranch,
      checkCommand,
      epicTitle,
      fields: fields.map((f) => f.key),
      skills: on.has('skills'),
      github: on.has('github'),
      gitGuard: on.has('gitGuard'),
      ci: on.has('ci'),
    },
    kitDir,
  );
  if (plan.conflicts.length) {
    const doc = await vscode.workspace.openTextDocument({ content: plan.conflicts.join('\n') });
    await vscode.window.showTextDocument(doc, { preview: true });
    vscode.window.showErrorMessage(t.conflicts(plan.conflicts.length));
    return;
  }
  const count = (op: string) => plan.actions.filter((a: any) => a.op === op).length;
  const summary = t.confirm(count('create'), count('update'), count('merge'), count('skip'));
  let choice = await vscode.window.showInformationMessage(summary, { modal: true }, t.apply, t.show);
  if (choice === t.show) {
    const doc = await vscode.workspace.openTextDocument({
      content: plan.actions.map((a: any) => `${a.op.padEnd(6)} ${a.path}${a.reason ? ` (${a.reason})` : ''}`).join('\n'),
    });
    await vscode.window.showTextDocument(doc, { preview: true });
    choice = await vscode.window.showInformationMessage(summary, { modal: true }, t.apply);
  }
  if (choice !== t.apply) return;

  const output = vscode.window.createOutputChannel('Backlog Kit');
  try {
    const { notes } = applyInit(root, plan, { log: (l: string) => output.appendLine(l) });
    for (const n of notes) output.appendLine(`! ${n}`);
  } catch (err) {
    output.show();
    vscode.window.showErrorMessage((err as Error).message);
    return;
  }
  const buttons = [t.open, ...(on.has('github') && existsSync(path.join(root, '.git')) ? [t.setup] : [])];
  vscode.window.showInformationMessage(t.done, ...buttons).then((b) => {
    if (b === t.open) vscode.commands.executeCommand('backlogKit.openBoard');
    if (b === t.setup) {
      const term = vscode.window.createTerminal({ name: 'Backlog Kit', cwd: root });
      term.show();
      term.sendText('npm run pm:setup-github');
    }
  });
  return root;
}
