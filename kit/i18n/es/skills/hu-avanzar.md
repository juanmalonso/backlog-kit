---
name: hu-avanzar
description: Mover una historia por su ciclo ({{S.inProgress}}, {{S.review}}, {{S.done}}, {{S.blocked}}, vuelta a {{S.ready}}). Usar para "arrancá la {{storyPrefix}}-NNN", "pasala a review", "cerrala", "está bloqueada por X". Actualiza README, backlog{{#github}} e issue{{/github}} en un paso.
---

# /hu-avanzar — Cambiar el estado de una historia

Lo mecánico (validar la transición, frontmatter, log, backlog{{#github}}, labels, comentario y cerrar o reabrir el issue{{/github}}) lo hace el script. Tu trabajo es verificar que el cambio sea verdad.

```bash
npm run pm:advance -- {{storyPrefix}}-NNN <ESTADO> [--nota "…"]
```

El tablero de VS Code hace lo mismo al arrastrar una tarjeta.

## Antes de cada transición

| A | Verificá antes |
|---|---|
| {{S.inProgress}} | Está en {{S.ready}} y sus dependencias resueltas. Después: `git fetch && git switch -c <rama que imprime> origin/{{mainBranch}}`. Leé el README entero antes de tocar código |
| {{S.review}} | `{{checkCommand}}` limpio. Tildá en el README **solo** los criterios que verificaste. El script rechaza criterios sin tildar; `--forzar` solo con una `--nota` que explique por qué |
| {{S.done}} | **Solo si el usuario lo aceptó explícitamente.** Nunca por iniciativa propia |
| {{S.blocked}} | `--nota "<qué falta> (depende de: <quién/qué>)"` es obligatoria |
{{#github}}
## Al pasar a {{S.review}}, abrir el PR

```bash
git push -u origin <rama>
gh pr create --base {{mainBranch}} --title "[{{storyPrefix}}-NNN] <nombre>" --body "<resumen, cómo se verificó>

Closes #<issue>"
```

El número del issue sale de `npm run pm:issue -- {{storyPrefix}}-NNN`, nunca del id.
{{/github}}
## Reportar

Transición, ruta del README{{#github}}, link del issue y del PR si lo hay{{/github}}.
