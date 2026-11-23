---
name: hu-refinar
description: Refinar una historia hasta {{S.ready}}: criterios de aceptación, plan, tareas, casos de prueba y resolver las preguntas abiertas con el usuario. Usar para "refiná la {{storyPrefix}}-NNN", "definamos los criterios", "planificá X".
---

# /hu-refinar — Llevar una historia a {{S.ready}}

## 1. Leer

- El README completo. Si está en {{S.ready}} o más adelante, confirmá con el usuario antes de reescribir.
- Las decisiones (`{{docs.decisions}}/`) y las historias de las que depende.
- El código existente que la historia extiende.

Para ganar tiempo, lanzá el subagente `refinador`: propone criterios, plan, casos y las preguntas.

## 2. Resolver las preguntas con el usuario

Presentalas todas juntas, cada una con **opciones concretas y un ejemplo**, y tu recomendación primero.
No inventes respuestas. Cada respuesta pasa a "{{sections.decisions}}" con fecha. Si una decisión
trasciende la historia → `/doc-adr`.

## 3. Completar

- **{{sections.criteria}}** binarios, en Dado/cuando/entonces. Incluir lo que **no** debe pasar.
- **{{sections.plan}}** en orden lógico, nombrando archivos reales.
- **Tareas**, incluido `{{checkCommand}}` limpio.
- **{{sections.tests}}**: filas reales en una tabla `| # | Escenario | Pasos | Resultado esperado |`{{#github}};
  se copian al issue como checklist de QA manual{{/github}}{{#kiwi}}; cada fila es un caso en Kiwi TCMS (las columnas se
  leen del encabezado, así que conservá esos nombres){{/kiwi}}.
- **{{sections.dependencies}}**: historias que tienen que estar antes.

Según el tipo de historia:

- **Migración de base**: verificación después de aplicarla (conteos, la función o vista que cambió) y rollback si aplica.
- **UI**: un criterio de accesibilidad básica y de pantallas chicas, y el smoke test que lo verifica.
- **IA / integración externa**: qué pasa cuando falla o devuelve algo inválido (falla limpia, visible).
- **Bloqueada**: el bloqueador y de quién depende; no pasa a {{S.ready}} hasta destrabarse.

Si quedó XL, proponé partirla (`/hu-nueva` por cada parte) antes de pasar a {{S.ready}}.

## 4. Pasar a {{S.ready}}

Solo con cero preguntas pendientes:

```bash
npm run pm:advance -- {{storyPrefix}}-NNN {{S.ready}} --nota "Decisiones clave: …"
```

Si estaba en {{S.backlog}}, primero `npm run pm:advance -- {{storyPrefix}}-NNN {{S.refining}}`.
