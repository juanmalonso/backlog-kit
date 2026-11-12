---
name: doc-adr
description: Registrar una decisión de arquitectura o de producto como ADR en docs/decisiones/. Usar cuando una decisión afecta a más de una historia (stack, modelo de dominio, contratos, convenciones) o cuando el usuario dice "anotá esta decisión".
---

# /doc-adr — Registrar una decisión

1. Número: el siguiente a `ls docs/decisiones/ADR-*.md` (mirá también las ramas remotas).
2. Copiá `docs/decisiones/plantilla.md` a `docs/decisiones/ADR-NNN-<slug>.md`.
3. Contexto, decisión en presente, alternativas con pros y contras reales y consecuencias.
4. Estado `Propuesto` si el usuario no la confirmó; `Aceptado` si sí. Un ADR aceptado no se reescribe: se crea otro y el viejo pasa a `Reemplazado por ADR-NNN`.
5. Agregá la fila al índice `docs/decisiones/README.md` y enlazalo desde la historia que la originó.
