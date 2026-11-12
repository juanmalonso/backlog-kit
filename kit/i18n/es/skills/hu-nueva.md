---
name: hu-nueva
description: Crear una historia de usuario nueva en .pm/{{#github}} y su issue de GitHub{{/github}}. Usar cuando el usuario pide una funcionalidad, una historia, un ticket o un arreglo no trivial, o dice "agregá esto al backlog". También cuando aparece trabajo nuevo en medio de otra historia.
---

# /hu-nueva — Crear una historia

## 1. Juntar lo mínimo

Si no está claro, preguntá con ejemplos concretos:

- **Épica**: una de `.pm/{{epicPrefix}}*/` (leé sus README). Si no encaja en ninguna, proponé una nueva antes de crearla.
- **Título** corto (≤ 80 caracteres) y **tipo**: {{typesList}}. Un `fix` lleva síntoma y causa probable.
- **Como / quiero / para**.
- **Prioridad**: {{prioritiesList}}.{{fieldsHint}}

## 2. Id y carpeta

```bash
npm run pm:next-id        # nunca deduzcas el id: mira ramas remotas{{#github}} e issues{{/github}}
```

Creá `.pm/<épica>/{{storyPrefix}}-NNN-<slug-kebab-sin-acentos>/README.md` copiando `.pm/templates/story.md`.

## 3. Completar el README

- `{{K.status}}: {{S.refining}}` si se va a trabajar pronto; `{{S.backlog}}` si solo se anota.
- **Contexto**: qué parte del producto aplica y qué decisiones (`{{docs.decisions}}/`) la condicionan.
- **Alcance**: qué incluye y, sobre todo, qué **no** y a qué historia queda.
- Criterios provisorios, plan tentativo y **preguntas pendientes reales**.
- Log: `- <hoy> — Creada. (<estado>)`.

El hook regenera el backlog y corre el guard al guardar. Si corta, arreglá lo que dice.
{{#github}}
## 4. Issue

```bash
npm run pm:sync -- {{storyPrefix}}-NNN   # en {{S.backlog}} no crea issue; si no, sí, y escribe {{K.issue}}
```
{{/github}}
## Reportar

Id, ruta del README{{#github}}, link del issue{{/github}} y las preguntas pendientes para refinarla.
