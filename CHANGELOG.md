# Changelog

## 0.2.0

- `backlog-kit upgrade` y el comando "Backlog Kit: Actualizar scripts": actualizan solo scripts y
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
