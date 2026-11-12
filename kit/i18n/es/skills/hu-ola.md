---
name: hu-ola
description: Implementar varias historias en paralelo, una por worktree, en el orden que permite el grafo de dependencias. Usar cuando el usuario pide "arrancá una ola", "hacé las listas en paralelo" o "avanzá con todo lo que se pueda".
---

# /hu-ola — Una ola de historias en paralelo

Una ola son las historias en {{S.ready}} sin dependencias pendientes que no se pisan entre sí.
Cada una va en su worktree y su rama, con un implementador y después un revisor independiente.
Nadie mergea: cada historia termina en un PR{{#github}} con CI en verde{{/github}}.

## 1. Elegir la ola

```bash
npm run pm:next -- --json      # review, listas libres (por etapa, lo que destraba, prioridad) y las que esperan
```

Proponé al usuario 2 a 4 historias de `next` que no toquen los mismos archivos ni recursos
compartidos (una migración por ola, una sola que resetee la base). Esperá su confirmación.

## 2. Preparar los worktrees

Por cada historia:

```bash
npm run pm:start -- {{storyPrefix}}-NNN           # en curso + rama desde origin/{{mainBranch}}
git switch {{mainBranch}}                          # el checkout principal vuelve a su rama
git worktree add ../wt/{{storyPrefix}}-NNN <rama>  # un directorio por historia
```

Instalá dependencias en cada worktree antes de lanzar a nadie.

## 3. Implementar y revisar (subagentes, en paralelo)

Por historia, un subagente implementador en su worktree, con este encargo: leer el README,
implementar el plan, `{{checkCommand}}` limpio, tildar solo lo verificado, `npm run pm:log`,
`npm run pm:advance -- {{storyPrefix}}-NNN {{S.review}}`{{#github}} y `npm run pm:pr`{{/github}}.

Cuando termina, el subagente `revisor-criterios` revisa ese worktree. Si encuentra faltantes,
vuelve al implementador con la lista. Si dos subagentes van a reservar números (ADR, hallazgos,
migraciones), asignáselos antes de lanzarlos.

## 4. Cerrar la ola

- Resumí por historia: PR, estado{{#github}} del CI{{/github}}, lo que quedó abierto y las decisiones que necesitan al usuario.
- El merge lo pide el usuario. Después, rebaseá las ramas que chocan en `.pm/backlog.md` (se regenera con `npm run pm:backlog`).
- `git worktree remove` de las que ya se mergearon y `npm run pm:next` para la ola siguiente.
