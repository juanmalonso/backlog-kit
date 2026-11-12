---
name: doc-hallazgo
description: Registrar un hallazgo en {{docs.findings}}/: un problema no obvio, una trampa, una hipótesis que resultó falsa, con su causa medida y el procedimiento que funciona. Usar después de depurar algo que costó, o cuando el usuario dice "documentá esto".
---

# /doc-hallazgo — Registrar un hallazgo

Un hallazgo existe para que la próxima sesión no pierda la misma hora.

1. Número: el siguiente a `ls {{docs.findings}}/{{docs.findingPrefix}}-*.md`.
2. Copiá `{{docs.findings}}/plantilla.md` a `{{docs.findings}}/{{docs.findingPrefix}}-NNN-<slug>.md`.
3. **Síntoma** literal, **causa** medida (si es hipótesis, decilo), **qué hacer** con comandos y **cómo reconocerlo**.
4. Fila en `{{docs.findings}}/README.md` y enlace desde la historia (`/hu-log`).
