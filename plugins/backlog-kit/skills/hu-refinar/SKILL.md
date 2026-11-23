---
name: hu-refinar
description: Refinar una historia hasta LISTO: criterios de aceptación, plan, tareas, casos de prueba y resolver las preguntas abiertas con el usuario. Usar para "refiná la HU-NNN", "definamos los criterios", "planificá X".
---

# /hu-refinar — Llevar una historia a LISTO

## 1. Leer

- El README completo. Si está en LISTO o más adelante, confirmá con el usuario antes de reescribir.
- Las decisiones (`docs/decisiones/`) y las historias de las que depende.
- El código existente que la historia extiende.

Para ganar tiempo, lanzá el subagente `refinador`: propone criterios, plan, casos y las preguntas.

## 2. Resolver las preguntas con el usuario

Presentalas todas juntas, cada una con **opciones concretas y un ejemplo**, y tu recomendación primero.
No inventes respuestas. Cada respuesta pasa a "Decisiones" con fecha. Si una decisión
trasciende la historia → `/doc-adr`.

## 3. Completar

- **Criterios de aceptación** binarios, en Dado/cuando/entonces. Incluir lo que **no** debe pasar.
- **Plan de implementación** en orden lógico, nombrando archivos reales.
- **Tareas**, incluido `npm run pm:check` limpio.
- **Casos de prueba**: filas reales en una tabla `| # | Escenario | Pasos | Resultado esperado |`;
  se copian al issue como checklist de QA manual; cada fila es un caso en Kiwi TCMS (las columnas se
  leen del encabezado, así que conservá esos nombres).
- **Dependencias**: historias que tienen que estar antes.

Según el tipo de historia:

- **Migración de base**: verificación después de aplicarla (conteos, la función o vista que cambió) y rollback si aplica.
- **UI**: un criterio de accesibilidad básica y de pantallas chicas, y el smoke test que lo verifica.
- **IA / integración externa**: qué pasa cuando falla o devuelve algo inválido (falla limpia, visible).
- **Bloqueada**: el bloqueador y de quién depende; no pasa a LISTO hasta destrabarse.

Si quedó XL, proponé partirla (`/hu-nueva` por cada parte) antes de pasar a LISTO.

## 4. Pasar a LISTO

Solo con cero preguntas pendientes:

```bash
npm run pm:advance -- HU-NNN LISTO --nota "Decisiones clave: …"
```

Si estaba en BACKLOG, primero `npm run pm:advance -- HU-NNN REFINANDO`.
