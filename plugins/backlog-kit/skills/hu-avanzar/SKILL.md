---
name: hu-avanzar
description: Mover una historia por su ciclo (EN_CURSO, EN_REVIEW, HECHO, BLOQUEADO, vuelta a LISTO). Usar para "arrancá la HU-NNN", "pasala a review", "cerrala", "está bloqueada por X". Actualiza README, backlog e issue en un paso.
---

# /hu-avanzar — Cambiar el estado de una historia

Lo mecánico (validar la transición, frontmatter, log, backlog, labels, comentario y cerrar o reabrir el issue) lo hace el script. Tu trabajo es verificar que el cambio sea verdad.

```bash
npm run pm:advance -- HU-NNN <ESTADO> [--nota "…"]
```

El tablero de VS Code hace lo mismo al arrastrar una tarjeta.

## Antes de cada transición

| A | Verificá antes |
|---|---|
| EN_CURSO | Está en LISTO y sus dependencias resueltas. Después: `git fetch && git switch -c <rama que imprime> origin/main`. Leé el README entero antes de tocar código |
| EN_REVIEW | `npm run pm:check` limpio y el subagente `revisor-criterios` sin faltantes. Tildá en el README **solo** los criterios que verificaste. El script rechaza criterios sin tildar; `--forzar` solo con una `--nota` que explique por qué |
| HECHO | **Solo si el usuario lo aceptó explícitamente.** Nunca por iniciativa propia |
| BLOQUEADO | `--nota "<qué falta> (depende de: <quién/qué>)"` es obligatoria |

## Al pasar a EN_REVIEW, abrir el PR

```bash
npm run pm:pr        # push + PR con historia, criterios, último log y Closes #<issue>
```

El número del issue sale de `npm run pm:issue -- HU-NNN`, nunca del id.

## Reportar

Transición, ruta del README, link del issue y del PR si lo hay.
