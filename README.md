# Backlog Kit

Backlog de historias de usuario en markdown **dentro del repo**, con:

- **Tablero kanban en VS Code**: arrastrás una tarjeta y cambia de estado, con las mismas reglas
  que en la terminal (transiciones válidas, criterios tildados para pasar a review, nota al bloquear).
- **Init** que deja el proyecto listo: estructura `.pm/`, scripts `pm:*`, skills de Claude Code,
  sección de workflow en `CLAUDE.md`, hooks, sincronización con GitHub Issues, protección de la rama
  principal y CI.
- **Configurable**: idioma (español o inglés), prefijo de los ids, rama protegida, comando de
  chequeo y campos extra por historia.
- **Integrado con Claude Code**: la historia de la rama en contexto, subagentes que revisan criterios
  y refinan, servidor MCP del backlog, olas en paralelo y un plugin que se instala con `/plugin`.

El estado de cada historia vive en un solo lugar: el frontmatter de su README. El tablero, el
backlog generado y los issues de GitHub son vistas.

> English summary: a markdown backlog that lives in your repo, with a VS Code kanban board, an init
> that sets up scripts, Claude Code skills, hooks, GitHub Issues sync and main-branch protection.
> Spanish and English presets. See [Comandos](#comandos) and [Configuración](#configuración).

## Instalación

Desde un release (`backlog-kit-<versión>.vsix`):

```bash
code --install-extension backlog-kit-0.1.0.vsix
```

O desde el código:

```bash
git clone https://github.com/juanmalonso/backlog-kit && cd backlog-kit
npm install && npm run package
code --install-extension backlog-kit-0.1.0.vsix
```

Requisitos: Node 20+ y git. Para GitHub, el CLI [`gh`](https://cli.github.com) autenticado.

## Uso

1. Abrí tu proyecto en VS Code y corré **Backlog Kit: Inicializar proyecto** (`Ctrl+Shift+P`).
   Elegís idioma, prefijo, rama principal, comando de chequeo, primera épica, componentes y campos.
   Antes de escribir muestra qué va a crear, actualizar o fusionar.
2. **Backlog Kit: Abrir tablero**. También desde la barra de estado, que muestra la historia de la
   rama actual (`HU-012 · EN_CURSO · 3/5`).
3. En el tablero:
   - Cada tarjeta muestra prioridad, criterios, issue, PR con el semáforo del CI, "⧗ espera HU-x"
     si una dependencia no está lista, "↗ destraba N", el motivo si está bloqueada y "✳ Claude
     activo" si hay una sesión de Claude Code trabajando en su rama.
   - Clic: panel de detalle con la historia, **criterios tildables**, preguntas, log, dependencias y
     acciones (mover, loguear, empezar, abrir PR, trabajar con Claude, README, issue).
   - Arrastrar a otra columna, o `M`: corre `pm:advance` con las reglas de siempre. Al pasar a review
     ofrece que Claude revise los criterios contra el diff primero.
   - **Dependencias**: el grafo en capas; el borde más grueso es lo que más destraba.
   - Carriles por épica o etapa, filtros, "+ Nueva".
4. Fuera del tablero: panel **Backlog** en el Explorador, ids (`HU-012`, `ADR-004`) clicables con
   hover en cualquier archivo y los errores del guard en la pestaña Problemas.

Sin VS Code, el mismo init por terminal:

```bash
npx github:juanmalonso/backlog-kit init --lang es --fields phase,stage
```

En un proyecto que ya tiene `.pm/config.json` (por ejemplo, uno que adoptó backlog-kit con su
config escrita a mano), `upgrade` actualiza solo scripts y hooks, sin tocar nada más:

```bash
npx github:juanmalonso/backlog-kit upgrade
```

También desde VS Code: **Backlog Kit: Actualizar scripts**.

Opciones de `init`: `--lang es|en`, `--prefix HU`, `--main main`, `--check "npm test"`,
`--fields phase,stage,requirements,spec`, `--epic "Nombre"`, `--no-skills`, `--no-github`,
`--no-git-guard`, `--no-ci`, `--claude project|plugin`, `--no-mcp`, `--claude-action`, `--dry-run`.

## Qué instala

| Componente | Archivos |
|---|---|
| Estructura | `.pm/config.json`, `.pm/templates/story.md`, la primera épica, `.pm/backlog.md` (generado) |
| Scripts | `scripts/pm/*.mjs`, `scripts/lib/*.mjs` y los `pm:*` en `package.json`. Sin dependencias |
| Skills y CLAUDE.md | `.claude/skills/` (crear, refinar, avanzar, loguear, backlog, adoptar issue, ADR, hallazgo), bloque de workflow en `CLAUDE.md`, hook PostToolUse que corre el guard en `.claude/settings.json` |
| GitHub Issues | `pm:sync`, `pm:issue`, `pm:setup-github`: un issue por historia, labels por estado, prioridad, tipo y épica, milestone por épica |
| Protección de la rama | `scripts/hooks/git-guard.mjs` (PreToolUse de Claude Code) y `.githooks/pre-push` |
| CI | `.github/workflows/backlog.yml` corre el guard en cada PR |
| Docs | `docs/decisiones/` y `docs/hallazgos/` (o `docs/decisions/` y `docs/findings/`) con índice y plantilla |

El init es idempotente: los scripts se actualizan si cambiaron, lo que es del proyecto (config,
plantillas, skills, docs) no se pisa, y `package.json`, `.claude/settings.json` y `CLAUDE.md` se
fusionan. El bloque de `CLAUDE.md` va entre `<!-- backlog-kit:begin -->` y `<!-- backlog-kit:end -->`.

## Claude Code

Lo que el init deja (o el plugin trae):

| | Qué hace |
|---|---|
| Hook `SessionStart` | Si la rama es de una historia, Claude arranca con su estado, criterios pendientes, preguntas y último log |
| Hook `UserPromptSubmit` | Si el mensaje nombra una historia, le agrega su README |
| Hook `Stop` | Con código tocado y sin log del día (o "listo" con criterios pendientes), le recuerda registrar o verificar. Una vez por sesión |
| Statusline | `HU-044 · EN_CURSO · 2/5` en la terminal de Claude |
| Subagentes | `revisor-criterios` (¿el diff cumple cada criterio?, con evidencia) y `refinador` (criterios, plan y preguntas) |
| Skill de olas | `/hu-ola`: varias historias listas en paralelo, una por worktree, con revisión independiente |
| MCP `backlog` | `story_list`, `story_get`, `story_next`, `backlog_stats`, `story_advance`, `story_log`, `story_create`, `story_check_criterion` |
| GitHub (opcional) | `--claude-action`: "@claude" en issues y PRs con las mismas skills |

**Como plugin**, en vez de copiar todo al proyecto:

```text
/plugin marketplace add juanmalonso/backlog-kit
/plugin install backlog-kit@backlog-kit        # o backlog-kit-en
```

y el init con `--claude plugin` (o "Plugin de Claude Code" en el asistente): el proyecto queda con
`.pm/`, los scripts y la statusline; skills, subagentes, hooks y MCP los trae el plugin y se
actualizan con él. Las skills quedan como `/backlog-kit:hu-nueva`.

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run pm:check` | Guard: ids, carpetas, estados y campos fuera de catálogo, dependencias (inexistentes, ciclos, sin refinar), issue duplicado, backlog al día |
| `npm run pm:backlog` | Regenera `.pm/backlog.md` |
| `npm run pm:next-id` | Próximo id libre mirando el working tree, las ramas remotas y los issues |
| `npm run pm:advance -- <ID> <ESTADO> [--nota "…"] [--forzar]` | Valida la transición, actualiza frontmatter y log, regenera el backlog y sincroniza el issue |
| `npm run pm:log -- <ID> "texto"` | Agrega al log y comenta en el issue |
| `npm run pm:sync -- <ID>` / `-- --todas` | Crea o actualiza el issue |
| `npm run pm:issue -- <ID>` / `-- --verificar` | Resuelve y audita la relación historia ↔ issue |
| `npm run pm:setup-github` | Labels y milestones |
| `npm run pm:start -- <ID>` | En curso y rama desde `origin/<main>` (o se cambia a ella) |
| `npm run pm:pr [-- <ID>]` | Push y PR con historia, criterios, último log y `Closes #` (por defecto, la de la rama) |
| `npm run pm:next [-- --json]` | Qué tomar: review, listas sin dependencias pendientes y las que esperan |
| `npm run pm:stats [-- --json]` | Días por estado, cerradas por semana y antigüedad |
| `npm run pm:new -- --epic E00 --title "…"` | Historia nueva desde la plantilla con el próximo id |

Las banderas aceptan las dos formas: `--nota`/`--note`, `--forzar`/`--force`,
`--sin-github`/`--no-github`, `--todas`/`--all`, `--verificar`/`--verify`.

## Configuración

`.pm/config.json` guarda solo lo que difiere del preset del idioma:

```json
{
  "language": "es",
  "storyPrefix": "HU",
  "mainBranch": "main",
  "checkCommand": "npm run check",
  "fields": [
    { "key": "fase", "label": "Fase", "values": ["MVP", "V1", "DESPUES"] },
    { "key": "etapa", "label": "Etapa", "range": [0, 4] }
  ],
  "github": { "enabled": true },
  "gitGuard": { "enabled": true }
}
```

También se pueden pisar `states` (el nombre de cada uno de los 8 roles), `keys` (las claves del
frontmatter), `priorities`, `types`, `estimates`, `sections` (títulos de las secciones del README),
`docs` y `migrations` (`{ "dir": "db/migrations", "ext": ".sql", "pattern": "^(\\d{4})_[a-z0-9_]+\\.sql$" }`
para que el guard revise la numeración). Un campo con `"backlog": false` no aparece en `.pm/backlog.md`.
Los presets están en
[`kit/scripts/lib/config.mjs`](kit/scripts/lib/config.mjs).

Estados (roles fijos, nombres configurables):

```text
backlog → refining → ready → inProgress → review → done
Laterales: blocked (con nota) y discarded.
```

## Desarrollo

```bash
npm install
npm run check      # typecheck + tests (node:test)
npm run build      # dist/extension.js
npm run package    # backlog-kit-<versión>.vsix
```

`F5` en VS Code abre una ventana con la extensión cargada.

## Licencia

MIT
