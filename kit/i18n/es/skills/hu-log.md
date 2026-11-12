---
name: hu-log
description: Registrar progreso en una historia (log del README{{#github}} y comentario en el issue{{/github}}) sin cambiar su estado. Usar después de un hito, una decisión o un hallazgo, o al cerrar una sesión de trabajo.
---

# /hu-log — Registrar progreso

Un hito significativo, no cada commit: qué pasó, artefactos (archivo, test) y qué falta.

```bash
npm run pm:log -- {{storyPrefix}}-NNN "Tablero con filtros. Test: board.test.mjs. Falta: atajos de teclado."
```

Si el progreso cambió el alcance, actualizá también "Alcance" o "Tareas": el log no reemplaza
tener el README al día. Si cambió el estado, usá `/hu-avanzar` (ya incluye el log).
