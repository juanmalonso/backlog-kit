---
name: hu-backlog
description: Mostrar el estado del proyecto y sugerir qué hacer. Usar para "¿qué hay?", "¿en qué estamos?", "¿qué sigue?", "¿qué está listo?", "¿qué está bloqueado?". Solo lectura.
---

# /hu-backlog — Estado y próximo paso

1. Leé `.pm/backlog.md` (generado; si dudás, `npm run pm:backlog` primero).
2. Si hay algo en EN_CURSO, leé el final de su "Log de progreso".
3. Si el usuario pregunta por GitHub: `npm run pm:issue -- --verificar`.

Respuesta corta y accionable:

```text
Activo: HU-004 (EN_CURSO) — último log: …
En review: HU-003 — esperando tu aceptación
Listas: HU-007, HU-009
Bloqueadas: HU-020 — falta …
Sugerencia: tomar HU-007 porque destraba HU-008.
```

Para sugerir: dependencias resueltas primero, después prioridad, y lo que destraba más historias.
Si hay algo en EN_REVIEW, eso va primero: necesita al usuario.
