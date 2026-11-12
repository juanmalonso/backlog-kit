# Backlog Kit

Backlog de historias de usuario en markdown **dentro del repo**, con:

- **Tablero kanban en VS Code**: arrastrás una tarjeta y cambia de estado, con las mismas reglas
  que en la terminal (transiciones válidas, criterios tildados para pasar a review, nota al bloquear).
- **Init** que deja el proyecto listo: estructura `.pm/`, scripts `pm:*`, skills de Claude Code,
  sección de workflow en `CLAUDE.md`, hooks, sincronización con GitHub Issues, protección de la rama
  principal y CI.
- **Configurable**: idioma (español o inglés), prefijo de los ids, rama protegida, comando de
  chequeo y campos extra por historia.

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
   - Clic o `Enter` en una tarjeta: abre su README al costado.
   - Arrastrar a otra columna, o `M` / botón **Mover…**: corre `pm:advance`. Las columnas válidas se
     marcan al arrastrar. Si el script rechaza el cambio, la tarjeta vuelve a su lugar y ves el motivo.
   - Al pasar a en curso, ofrece crear la rama de la historia.
   - Filtros por épica, prioridad y texto; ocultar cerradas.

Sin VS Code, el mismo init por terminal:

```bash
npx github:juanmalonso/backlog-kit init --lang es --fields phase,stage
```

Opciones: `--lang es|en`, `--prefix HU`, `--main main`, `--check "npm test"`,
`--fields phase,stage,requirements,spec`, `--epic "Nombre"`, `--no-skills`, `--no-github`,
`--no-git-guard`, `--no-ci`, `--dry-run`.

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
`docs` y `migrations` (`{ "dir": "db/migrations", "pattern": "^(\\d{4})_[a-z0-9_]+\\.sql$" }` para que
el guard revise la numeración). Los presets están en
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
