---
name: hu-adoptar-issue
description: Convertir issues de GitHub/GitLab creados a mano en historias de .pm/. Usar cuando el usuario dice "adoptá el issue #N", "procesá los issues nuevos", o cuando `npm run pm:issue -- --verificar` reporta issues sin README.
---

# /hu-adoptar-issue — Adoptar issues como historias

1. Qué adoptar: con número, ese issue; sin número, `npm run pm:adopt -- --listar --json` (abiertos que ninguna
   historia reclama y sin `[HU-NNN]` en el título).
2. Por cada issue:
   - Ubicá la épica leyendo los README de `.pm/E*/`. Si no es obvio, preguntá con las épicas como opciones.
   - Id con `npm run pm:next-id` (si adoptás varios, corrélo antes de cada uno: el anterior ya ocupa su número).
   - Creá el README desde `.pm/templates/` con el contenido del issue; marcá `(inferido)` lo que no venga de él.
     LISTO sólo si alcanza para implementar; si no, REFINANDO con las preguntas.
   - Poné `github_issue: <N>` en el frontmatter y corré `npm run pm:adopt -- <N> HU-NNN`: renombra el issue a
     `[HU-NNN] <nombre>`, le pone labels y milestone, y comenta dónde quedó la historia.
3. `npm run pm:issue -- --verificar` y resumí: `#61 → HU-037 — REFINANDO (falta: …)`.
