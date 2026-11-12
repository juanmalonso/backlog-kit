---
name: hu-nueva
description: Crear una historia de usuario nueva en .pm/ y su issue de GitHub. Usar cuando el usuario pide una funcionalidad, una historia, un ticket o un arreglo no trivial, o dice "agregá esto al backlog". También cuando aparece trabajo nuevo en medio de otra historia.
---

# /hu-nueva — Crear una historia

## 1. Juntar lo mínimo

Si no está claro, preguntá con ejemplos concretos:

- **Épica**: una de `.pm/E*/` (leé sus README). Si no encaja en ninguna, proponé una nueva antes de crearla.
- **Título** corto (≤ 80 caracteres) y **tipo**: feature | fix | spike | chore. Un `fix` lleva síntoma y causa probable.
- **Como / quiero / para**.
- **Prioridad**: bloqueante | alta | media | baja.

## 2. Id y carpeta

```bash
npm run pm:next-id        # nunca deduzcas el id: mira ramas remotas e issues
```

Creá `.pm/<épica>/HU-NNN-<slug-kebab-sin-acentos>/README.md` copiando `.pm/templates/story.md`.

## 3. Completar el README

- `estado: REFINANDO` si se va a trabajar pronto; `BACKLOG` si solo se anota.
- **Contexto**: qué parte del producto aplica y qué decisiones (`docs/decisiones/`) la condicionan.
- **Alcance**: qué incluye y, sobre todo, qué **no** y a qué historia queda.
- Criterios provisorios, plan tentativo y **preguntas pendientes reales**.
- Log: `- <hoy> — Creada. (<estado>)`.

El hook regenera el backlog y corre el guard al guardar. Si corta, arreglá lo que dice.

## 4. Issue

```bash
npm run pm:sync -- HU-NNN   # en BACKLOG no crea issue; si no, sí, y escribe github_issue
```

## Reportar

Id, ruta del README, link del issue y las preguntas pendientes para refinarla.
