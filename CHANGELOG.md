# Changelog

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
