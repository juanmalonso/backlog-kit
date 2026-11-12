---
{{K.id}}: {{storyPrefix}}-NNN
{{K.epic}}: {{epicPrefix}}NN
{{K.title}}: <título corto, máx. 80 caracteres>
{{K.type}}: feature            # {{typesList}}
{{K.status}}: {{S.refining}}        # {{statesList}}
{{K.priority}}: {{priorityDefault}}         # {{prioritiesList}}
{{K.estimate}}: M            # {{estimatesList}}
{{extraFields}}{{K.issue}}:            # número del issue. Lo completa pm:sync. Nunca deducirlo del id.
{{K.branch}}:                    # {{branchHint}}, se completa al pasar a {{S.inProgress}}
{{K.updated}}: YYYY-MM-DD
---

# {{storyPrefix}}-NNN — <título>

## {{sections.story}}

**Como** <perfil de usuario>
**quiero** <capacidad>
**para** <beneficio>

## Contexto

<Qué parte del producto o de la spec aplica y por qué. Decisiones que la condicionan.>

## Alcance

**Incluye**
- …

**No incluye**
- … (y a qué historia queda)

## {{sections.criteria}}

Binarios: se cumplen o no. `[ ]` hasta que estén implementados y verificados.

- [ ] Dado <contexto>, cuando <acción>, entonces <resultado>

## {{sections.questions}}

Lo que hay que resolver antes de pasar a {{S.ready}}. Cada respuesta se mueve a "{{sections.decisions}}".

- …

## {{sections.plan}}

1. …

## Tareas

- [ ] …
- [ ] `{{checkCommand}}` limpio

## {{sections.tests}}

Se copian al issue como checklist de QA manual (`npm run pm:sync`).

| # | Escenario | Pasos | Resultado esperado |
|---|---|---|---|
| 1 | … | … | … |

## {{sections.dependencies}}

- {{storyPrefix}}-NNN — por qué

## {{sections.decisions}}

- YYYY-MM-DD — …

## {{sections.log}}

- YYYY-MM-DD — Creada. ({{S.refining}})
