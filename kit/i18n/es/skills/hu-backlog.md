---
name: hu-backlog
description: Mostrar el estado del proyecto y sugerir qué hacer. Usar para "¿qué hay?", "¿en qué estamos?", "¿qué sigue?", "¿qué está listo?", "¿qué está bloqueado?". Solo lectura.
---

# /hu-backlog — Estado y próximo paso

1. Leé `.pm/backlog.md` (generado; si dudás, `npm run pm:backlog` primero).
2. Si hay algo en {{S.inProgress}}, leé el final de su "{{sections.log}}".
{{#github}}3. Si el usuario pregunta por GitHub: `npm run pm:issue -- --verificar`.
{{/github}}
Respuesta corta y accionable:

```text
Activo: {{storyPrefix}}-004 ({{S.inProgress}}) — último log: …
En review: {{storyPrefix}}-003 — esperando tu aceptación
Listas: {{storyPrefix}}-007, {{storyPrefix}}-009
Bloqueadas: {{storyPrefix}}-020 — falta …
Sugerencia: tomar {{storyPrefix}}-007 porque destraba {{storyPrefix}}-008.
```

Para sugerir: dependencias resueltas primero, después prioridad, y lo que destraba más historias.
Si hay algo en {{S.review}}, eso va primero: necesita al usuario.
