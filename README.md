# Backlog Kit

Backlog de historias de usuario en markdown **dentro del repo**, con:

- **Tablero kanban en VS Code**: arrastrás una tarjeta y cambia de estado, con las mismas reglas
  que en la terminal (transiciones válidas, criterios tildados para pasar a review, nota al bloquear).
- **Init** que deja el proyecto listo: estructura `.pm/`, scripts `pm:*`, skills de Claude Code,
  sección de workflow en `CLAUDE.md`, hooks, sincronización con issues de **GitHub o GitLab**,
  protección de la rama principal y CI.
- **Configurable**: idioma (español o inglés), prefijo de los ids, rama protegida, comando de
  chequeo y campos extra por historia.
- **Integrado con Claude Code**: la historia de la rama en contexto, subagentes que revisan criterios
  y refinan, servidor MCP del backlog, olas en paralelo y un plugin que se instala con `/plugin`.

El estado de cada historia vive en un solo lugar: el frontmatter de su README (YAML plano; un
comentario es ` # ` con espacio después del `#`, así que `#12` en un nombre es texto). El tablero, el
backlog generado y los issues de GitHub son vistas.

> English summary: a markdown backlog that lives in your repo, with a VS Code kanban board, an init
> that sets up scripts, Claude Code skills, hooks, GitHub Issues sync and main-branch protection.
> Spanish and English presets. See [Comandos](#comandos) and [Configuración](#configuración).

## Instalación

Desde un release (`backlog-kit-<versión>.vsix`):

```bash
code --install-extension backlog-kit-<versión>.vsix
```

O desde el código:

```bash
git clone https://github.com/juanmalonso/backlog-kit && cd backlog-kit
npm install && npm run package
code --install-extension backlog-kit-*.vsix
```

Requisitos: Node 20+ y git. Para GitHub, el CLI [`gh`](https://cli.github.com) autenticado. Para
GitLab, un token con scope `api` (ver [GitLab](#gitlab)).

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

**Adoptar en un proyecto que ya tiene su `.pm/`**: escribí primero `.pm/config.json` (ver
[Configuración](#configuración)) y después corré `init`. Con un config presente, `init` lo respeta por
encima de las banderas (rutas de decisiones y hallazgos, plantilla, forge, módulos) y no lo pisa. Si el
proyecto tiene scripts propios con el mismo nombre que los del kit (`scripts/lib/kiwi.mjs`, por
ejemplo), se frena y los lista: retiralos o renombralos en el mismo cambio.

Con el kit ya instalado, `upgrade` actualiza scripts, git hooks, los hooks de Claude en
`.claude/settings.json` (sin tocar lo demás) y el bloque del kit en `CLAUDE.md` si ya está:

```bash
npx github:juanmalonso/backlog-kit upgrade
```

Si `.claude/settings.json` no se commitea en tu proyecto, cada máquina corre `upgrade` una vez para
tener los hooks. Los hooks no hacen nada en una rama que todavía no tiene el kit.

También desde VS Code: **Backlog Kit: Actualizar scripts**.

Opciones de `init`: `--lang es|en`, `--prefix HU`, `--main main`, `--check "npm test"`,
`--fields phase,stage,requirements,spec`, `--epic "Nombre"`, `--no-skills`, `--no-github`,
`--no-git-guard`, `--no-ci`, `--claude project|plugin`, `--no-mcp`, `--claude-action`, `--dry-run`,
`--forge github|gitlab`, `--gitlab-url URL`, `--gitlab-project grupo/repo`, `--kiwi`, `--kiwi-product nombre`,
`--kiwi-classification nombre`, `--wiki`.

## Módulos

### Kiwi TCMS (`--kiwi`)

Cada fila de la tabla de casos de prueba del README (`| # | Escenario | Pasos | Resultado esperado |`, columnas
leídas del encabezado) es un TestCase en Kiwi, con resumen `HU-012 #1 · <escenario>`, en un TestPlan y una
Category por épica. `pm:advance` y `pm:new` sincronizan solos (si Kiwi no responde, avisan y siguen);
`npm run pm:kiwi -- <ID> [--dry-run]` o `-- --todas` a mano.

```json
"kiwi": { "enabled": true, "classification": "Empresa", "product": "mi-proyecto", "version": "dev", "insecure": false }
```

Credenciales en `KIWI_URL` (el endpoint `…/json-rpc/`), `KIWI_USERNAME` y `KIWI_PASSWORD`, del entorno o de
`.env.local`. `insecure: true` acepta un certificado self-signed.

### Wiki (`--wiki`)

`npm run pm:wiki [-- --dry-run]` publica `.pm/` en la wiki de GitLab (API) o de GitHub (el repo `.wiki.git`):
las páginas de `wiki.pages` (por defecto, el backlog), `Decisiones de Arquitectura/Indice` y una por decisión,
`Epicas/E01 <nombre>` e `Historias de Usuario/E01/HU-001 <nombre>`. Los títulos van sin acentos y cortados por
palabra, porque el título es el slug y un slug que cambia recrea la página. Con `wiki.prune: true` borra lo que ya
no corresponde (salvo `wiki.keep`), y no corre si algún README no se lee: su página se borraría.

```json
"wiki": { "enabled": true, "prune": true, "keep": ["home"], "pages": [{ "file": ".pm/glosario.md", "title": "Glosario" }] }
```

### Merge y adopción de issues

- `npm run pm:merge -- <n> [--dry-run]`: mergea el PR/MR sólo si está abierto, apunta a la rama principal, no es
  borrador, no tiene conflictos y el CI está en verde; antes lista los commits que entran.
- `npm run pm:adopt -- --listar` muestra los issues abiertos que ninguna historia reclama; `pm:adopt -- <n> <ID>`
  adopta uno (título, labels, milestone y un comentario). Lo usa la skill `/hu-adoptar-issue`, en GitHub y en GitLab.

### Migraciones

`migrations.ledger` (regex con un grupo) verifica que cada migración registre su propio nombre en el ledger, y
`migrations.knownGaps` acepta huecos históricos en la numeración:

```json
"migrations": { "dir": "db/migrations", "pattern": "^(\\d{3})_[a-z0-9_]+\\.sql$", "digits": 3, "knownGaps": [30, 31],
                "ledger": "INSERT\\s+INTO\\s+app_migration\\s*\\(id\\)\\s*VALUES\\s*\\(\\s*'([^']+)'" }
```

## GitLab

Con `--forge gitlab` (o `"forge": { "provider": "gitlab" }` en `.pm/config.json`), issues, labels,
milestones y MR van contra la API REST de GitLab (también self-hosted):

```json
{
  "forge": { "provider": "gitlab", "url": "https://gitlab.example.com", "project": "grupo/repo" },
  "labels": { "separator": "::", "epic": "folder" }
}
```

- **Token**: `GITLAB_TOKEN` del entorno o de `.env.local` / `.env` (se puede cambiar con
  `forge.tokenEnv`). Nunca se imprime. `url` puede salir de `GITLAB_URL` y `project` del remote `origin`.
- **Labels con alcance**: en GitLab el separador por defecto es `::` (`estado::LISTO`), así un issue
  tiene un solo estado. `labels.epic: "folder"` etiqueta la épica con la carpeta (`epica::E02-pagos`)
  en vez del id.
- `pm:pr` abre un **MR** (`Closes #<issue>` funciona igual), y el tablero muestra los MR abiertos con
  el estado del último pipeline de su rama.
- El CI del guard queda en `.gitlab/ci/backlog.yml`: sumalo con `include: { local: .gitlab/ci/backlog.yml }`.
- La skill de adoptar issues usa `gh` y no se instala con GitLab.

En GitHub y en GitLab, `pm:sync` **conserva los labels ajenos al kit** y **no pisa la descripción**
de un issue que no generó (para eso, `--cuerpo` / `--body`). `pm:setup-github` crea lo que falta y no
toca colores, descripciones ni títulos de milestone existentes salvo con `--actualizar` / `--update`.

## Qué instala

| Componente | Archivos |
|---|---|
| Estructura | `.pm/config.json`, `.pm/templates/story.md`, la primera épica, `.pm/backlog.md` (generado) |
| Scripts | `scripts/pm/*.mjs`, `scripts/lib/*.mjs` y los `pm:*` en `package.json`. Sin dependencias |
| Skills y CLAUDE.md | `.claude/skills/` (crear, refinar, avanzar, loguear, backlog, adoptar issue, ADR, hallazgo), bloque de workflow en `CLAUDE.md`, hook PostToolUse que corre el guard en `.claude/settings.json` |
| GitHub Issues | `pm:sync`, `pm:issue`, `pm:setup-github`: un issue por historia, labels por estado, prioridad, tipo y épica, milestone por épica |
| Protección de la rama | `scripts/hooks/git-guard.mjs` (PreToolUse de Claude Code) y `.githooks/pre-push` |
| CI | `.github/workflows/backlog.yml` (o `.gitlab/ci/backlog.yml`) corre el guard en cada PR/MR |
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

> **El guard de la rama es una baranda, no una barrera de seguridad.** Frena los errores de una sesión
> de Claude (commit en `main`, push directo o forzado, también dentro de `bash -c` o `eval`), pero
> alguien que quiera saltearlo puede. En GitLab, la protección real es *Protected branches*.

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

Para adoptar backlog-kit en un proyecto que ya tenía su `.pm/`:

- `"backlogFile": "tablero.md"`: el backlog generado va a `.pm/tablero.md` y no pisa un `backlog.md`
  escrito a mano.
- `"templates": { "story": "historia.md" }`: la plantilla de historia que usan `pm:new` y las skills
  (por defecto `story.md`).
- `"mirrors": [".pm/backlog.md"]`: índices escritos a mano con una tabla `| ID | … | ESTADO |`. `pm:advance`
  (y el tablero) actualiza la celda de estado de la fila de la historia, conservando lo que siga al estado
  («DESCARTADO — superseded por …»); los totales siguen a mano. `pm:check` avisa las filas que faltan o no
  coinciden, sin cortar.
- `"dependencies": { "cycles": "warn" }`: los ciclos de dependencias se avisan y no cortan el guard (para
  adoptar un `.pm/` que ya los tiene y arreglarlos de a poco).
- `"dependencies": { "mode": "first", "skip": "^(precede|no depende)" }`: de cada ítem de la sección de
  dependencias toma solo el primer id (el resto suele ser contexto) y saltea las relaciones inversas.
- `"requireBranch": false`: no exige el campo de rama en las historias en curso o en review.
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
