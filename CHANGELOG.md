# Changelog

## 0.5.0

**Módulos**
- **Kiwi TCMS** (`init --kiwi`, `pm:kiwi`): los casos de prueba del README como TestCases, un plan por épica;
  `pm:advance` y `pm:new` sincronizan solos y no frenan si Kiwi no responde. `--dry-run` sólo lee.
- **Wiki** (`init --wiki`, `pm:wiki`): `.pm/` publicado en la wiki de GitLab o de GitHub, con `--dry-run` y
  `prune` que no corre si algún README no se lee.

**Scripts**
- `pm:merge`: merge con controles (abierto, rama principal, sin borrador, sin conflictos, CI en verde) en GitHub y GitLab.
- `pm:adopt`: lista y adopta issues creados a mano; la skill de adoptar issues anda también en GitLab.
- `pm:setup-forge` (alias de `pm:setup-github`).
- `migrations.ledger` y `migrations.knownGaps` en el guard.

**Skills**
- Las lecciones de los proyectos que ya usaban el flujo: el id no es el número del issue, qué hacer si `pm:issue`
  falla, qué revisar al refinar según el tipo de historia, columnas de casos de prueba que lee Kiwi. Skill nueva
  `/doc-wiki`.

**Arreglos**
- El guard reportaba como hueco cada migración posterior a un hueco (cientos de errores por uno solo).
- Una clave repetida en el frontmatter es error: unas herramientas leían la primera y otras la última.
- `pm:new` no esperaba la creación del issue (un error quedaba sin capturar) y un título con `$&` se corrompía.

## 0.4.0

**GitLab**
- `forge.provider: "gitlab"` (o `init --forge gitlab`): issues, labels, milestones, comentarios y MR
  por la API REST, también self-hosted. Token en `GITLAB_TOKEN` (entorno o `.env.local`), labels con
  alcance `estado::X` y épica por carpeta opcional. El tablero muestra los MR con su pipeline.
- `pm:sync` conserva los labels ajenos al kit y no pisa la descripción de un issue que no generó
  (`--cuerpo` para reemplazarla). `pm:setup-github` ya no cambia lo existente sin `--actualizar`.

**Arreglos**
- Tildar un criterio o cambiar un campo con `$1` / `$&` en el texto corrompía el README.
- `#12` en un nombre ya no se lee como comentario (un comentario es ` # `), y los valores con ` # `
  se escriben entre comillas.
- Las fechas del log son locales, no UTC (en UTC-3, después de las 21 h quedaban con fecha de mañana).
- El hook Stop reconoce "terminé" y limpia sus marcadores viejos.
- El guard de la rama mira adentro de `bash -c "…"`, `sh -c` y `eval`.
- Una historia con frontmatter roto da un error con el archivo, no un TypeError.

**Para adoptar el kit en un `.pm/` existente**
- `backlogFile`: el backlog generado en otro archivo de `.pm/`, sin pisar uno escrito a mano.
- `dependencies.mode: "first"` y `dependencies.skip`: dependencias sin falsos ciclos cuando la sección
  también nombra lo que viene después.
- `requireBranch: false`, y el guard ya no revisa las dependencias de las historias hechas.

## 0.3.0

**Scripts**
- `pm:start` (en curso + rama), `pm:pr` (PR armado desde el README), `pm:next` (qué tomar después),
  `pm:stats` (días por estado, cerradas por semana, antigüedad) y `pm:new` (historia desde la plantilla).
- `prepare-commit-msg`: los commits llevan el id de la historia de la rama, también los de Claude.

**Tablero**
- PR y semáforo de CI en cada tarjeta; "espera", "destraba N" y motivo del bloqueo.
- Panel de detalle con criterios tildables, log, dependencias y acciones (mover, loguear, empezar,
  PR, trabajar con Claude).
- Vista de dependencias (grafo en capas), carriles por épica o etapa y "+ Nueva".
- Actividad de Claude en vivo por rama y, al pasar a review, la opción de revisar con Claude primero.

**VS Code**
- Panel lateral "Backlog" en el Explorador, ids clicables con hover en cualquier archivo y errores
  del guard en Problemas.

**Claude Code**
- Hooks: la historia de la rama al arrancar, el README de la historia que nombrás, recordatorio de
  log o criterios al cerrar el turno (una vez por sesión) y statusline.
- Subagentes `revisor-criterios` / `criteria-reviewer` y `refinador` / `refiner`; skill de olas en
  paralelo (`hu-ola` / `story-wave`).
- Servidor MCP `backlog` (lectura en JSON; escrituras por los mismos scripts).
- Plugin de Claude Code (`backlog-kit` y `backlog-kit-en`) con marketplace en este repo; el init
  tiene un modo `--claude plugin` que no copia lo que trae el plugin.
- Plantilla opcional de GitHub Action para "@claude" (`--claude-action`).

## 0.2.0

- `backlog-kit upgrade` y el comando "Backlog Kit: Actualizar scripts": actualizan scripts, hooks y los comandos `pm:*` de `package.json`, y
  hooks según el `.pm/config.json` existente, sin archivos iniciales ni merges. Sirve para
  proyectos que adoptan backlog-kit con su config escrita a mano.
- `.pm/backlog.md` muestra los campos lista (por ejemplo requisitos) en la tabla por épica, salvo
  los que tienen `"backlog": false`, y la columna del campo de etapa en "Listas para tomar".

## 0.1.0

- Tablero kanban en VS Code sobre `.pm/`: arrastrar para avanzar con las reglas de `pm:advance`,
  filtros, historia de la rama actual en la barra de estado.
- Init (asistente en VS Code y CLI `backlog-kit init`): estructura `.pm/`, scripts `pm:*`, skills de
  Claude Code, bloque de workflow en `CLAUDE.md`, hooks, GitHub Issues, protección de la rama
  principal y CI. Presets en español e inglés.
