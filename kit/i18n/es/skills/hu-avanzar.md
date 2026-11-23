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
| {{S.review}} | `{{checkCommand}}` limpio y el subagente `revisor-criterios` sin faltantes. Tildá en el README **solo** los criterios que verificaste. El script rechaza criterios sin tildar; `--forzar` solo con una `--nota` que explique por qué |
| {{S.done}} | **Solo si el usuario lo aceptó explícitamente.** Nunca por iniciativa propia |
| {{S.blocked}} | `--nota "<qué falta> (depende de: <quién/qué>)"` es obligatoria |
{{#github}}
## Al pasar a {{S.review}}, abrir el {{prName}}

```bash
npm run pm:pr        # push + {{prName}} con historia, criterios, último log y Closes #<issue>
```

El número del issue sale de `npm run pm:issue -- {{storyPrefix}}-NNN`, nunca del id. Mergear: `npm run pm:merge -- <n>`
(sólo con CI en verde y sin conflictos; `--dry-run` muestra los commits que entran).

## Si el issue no cierra

`pm:advance` y `pm:issue` verifican que el issue de `{{K.issue}}` tenga el título de esta historia. Si fallan,
**arreglá el dato** (`npm run pm:issue -- --verificar` las audita todas): el modo degradado es escribirle a la
historia de otro. No cambies labels a mano: el script manda la lista completa en un solo pedido, porque agregar y
quitar labels en el mismo pedido se pisa y la API responde 200 igual.
{{/github}}{{#kiwi}}
Kiwi: cada transición sincroniza los casos de prueba con Kiwi TCMS. Si Kiwi no responde, avisa y el cambio de estado
sigue; re-sincronizá después con `npm run pm:kiwi -- {{storyPrefix}}-NNN`.
{{/kiwi}}
## Reportar

Transición, ruta del README{{#github}}, link del issue y del {{prName}} si lo hay{{/github}}.
