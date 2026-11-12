---
name: hu-adoptar-issue
description: Convertir issues de GitHub creados a mano en historias de .pm/. Usar cuando el usuario dice "adoptá el issue #N", "procesá los issues nuevos", o cuando `npm run pm:issue -- --verificar` reporta issues sin README.
---

# /hu-adoptar-issue — Adoptar issues como historias

1. Con número: `gh issue view <N> --json number,title,body,labels`. Sin número: los abiertos sin label `estado:*`.
2. Por cada issue:
   - Ubicá la épica leyendo los README de `.pm/{{epicPrefix}}*/`. Si no es obvio, preguntá.
   - Id con `npm run pm:next-id`.
   - Creá el README desde `.pm/templates/story.md` con el contenido del issue; marcá `(inferido)` lo que no venga del issue.
   - Poné `{{K.issue}}: <N>` y renombrá el issue: `gh issue edit <N> --title "[{{storyPrefix}}-NNN] <nombre>"`.
   - `npm run pm:sync -- {{storyPrefix}}-NNN`.
3. `npm run pm:issue -- --verificar` y resumí: `#61 → {{storyPrefix}}-037 — {{S.refining}} (falta: …)`.
