---
name: doc-wiki
description: Publicar .pm/ (backlog, decisiones, épicas e historias) en la wiki de {{forgeName}}. Usar cuando el usuario pide actualizar la wiki o después de cambios grandes en .pm/ (historias nuevas, ADRs, replanteos).
---

# /doc-wiki — Publicar .pm/ en la wiki

```bash
npm run pm:wiki -- --dry-run     # qué páginas crea, actualiza o borra, sin tocar nada
npm run pm:wiki
```

- Los títulos de página salen de los nombres de épicas, historias y decisiones (sin acentos, cortados por
  palabra). Renombrar una historia cambia su página: con `wiki.prune` la vieja se borra y se pierde su historial.
- Con `wiki.prune: true`, cualquier página que no salga de `.pm/` se borra salvo las de `wiki.keep`. Si el
  `--dry-run` muestra borrados que no esperabas, pará y preguntá.
- Reportá el resumen (nuevas, actualizadas, borradas) y el link de la wiki.
