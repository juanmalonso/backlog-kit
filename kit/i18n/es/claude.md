## Backlog y workflow (backlog-kit)

El trabajo vive en `.pm/`: una carpeta por épica (`{{epicPrefix}}NN-slug/`) y una por historia
(`{{storyPrefix}}-NNN-slug/README.md`). El estado de una historia vive **solo** en el frontmatter de
su README; `.pm/backlog.md` se genera (`npm run pm:backlog`, y el hook lo hace solo). La
configuración está en `.pm/config.json`. El tablero se abre en VS Code con "Backlog Kit: Abrir tablero".

### Al iniciar la sesión

1. Mirá `.pm/backlog.md`: qué hay en curso, en review o bloqueado.
2. Si el usuario nombra una historia (`{{storyPrefix}}-NNN`) o una épica, leé ese README **antes** de ejecutar nada.
3. Si hay una historia en {{S.inProgress}}, retomala desde su "{{sections.log}}" y verificá que estás en su rama.

### Construir algo nuevo

```text
1. ¿Existe la historia?
   - NO                                → /{{skillPrefix}}hu-nueva
   - SÍ, {{S.backlog}} o {{S.refining}}       → /{{skillPrefix}}hu-refinar (resolver preguntas con el usuario)
   - SÍ, {{S.ready}}                       → paso 2
2. npm run pm:start -- {{storyPrefix}}-NNN  → {{S.inProgress}} y rama desde origin/{{mainBranch}}
3. Implementar según el plan. Hito → /{{skillPrefix}}hu-log. Decisión que trasciende → /{{skillPrefix}}doc-adr. Trampa → /{{skillPrefix}}doc-hallazgo.
4. `{{checkCommand}}` limpio → subagente revisor-criterios → tildar lo verificado
   → /{{skillPrefix}}hu-avanzar {{storyPrefix}}-NNN {{S.review}}{{#github}} → npm run pm:pr (arma el PR con "Closes #<issue>"){{/github}}
5. El usuario acepta → /{{skillPrefix}}hu-avanzar {{storyPrefix}}-NNN {{S.done}}
```

### Estados

```text
{{S.backlog}} → {{S.refining}} → {{S.ready}} → {{S.inProgress}} → {{S.review}} → {{S.done}}
Laterales: {{S.blocked}} (con nota de qué/quién) y {{S.discarded}}.
```

- **{{S.ready}}**: criterios binarios, plan, casos de prueba y cero preguntas pendientes.
- **{{S.review}}**: todos los criterios tildados y chequeos limpios. `pm:advance` lo exige.
- **{{S.done}}**: solo cuando el usuario lo acepta. Nunca la marques hecha vos.

### Reglas firmes

- **Una historia = una rama = un PR.**
- **No tocar código sin una historia en {{S.ready}} o {{S.inProgress}}**, salvo arreglos triviales.
- **El próximo id sale de `npm run pm:next-id`** (mira ramas remotas e issues). Nunca lo deduzcas.
{{#github}}- **El id de la historia no es el número del issue**: sale de `{{K.issue}}` (`npm run pm:issue -- <ID>`).
{{/github}}{{#gitGuard}}- **`{{mainBranch}}` solo cambia por PR mergeado con CI en verde.** Lo hacen cumplir `scripts/hooks/git-guard.mjs` y `.githooks/pre-push`. Si un hook corta, no se busca la vuelta.
{{/gitGuard}}- **Si el guard (`pm:check`) o el hook cortan, se arregla la causa.**

| Momento | Skill |
|---|---|
| Idea o pedido nuevo | `/{{skillPrefix}}hu-nueva` |
| Historia sin criterios, plan o con preguntas | `/{{skillPrefix}}hu-refinar` |
| Empezar, pasar a review, cerrar, bloquear | `/{{skillPrefix}}hu-avanzar` |
| Hito dentro de una historia | `/{{skillPrefix}}hu-log` |
| "¿Qué hacemos ahora?" | `/{{skillPrefix}}hu-backlog` |
{{#github}}| Alguien creó un issue a mano | `/{{skillPrefix}}hu-adoptar-issue` |
{{/github}}| Decisión que trasciende una historia | `/{{skillPrefix}}doc-adr` |
| Trampa o hipótesis que resultó falsa | `/{{skillPrefix}}doc-hallazgo` |
| Varias listas a la vez, en paralelo | `/{{skillPrefix}}hu-ola` |

### Herramientas para Claude

- **Contexto automático**: al arrancar, Claude recibe la historia de la rama; si el mensaje nombra una historia, su README.
  Al cerrar un turno con código tocado y sin log del día, se le recuerda registrar el avance.
- **Subagentes**: `revisor-criterios` (¿el diff cumple cada criterio?, con evidencia) y `refinador` (propone criterios, plan y preguntas).
{{#mcp}}- **MCP `backlog`**: `story_list`, `story_get`, `story_next`, `backlog_stats` (lectura) y `story_advance`, `story_log`,
  `story_create`, `story_check_criterion` (corren los mismos scripts, con las mismas reglas).
{{/mcp}}- **Scripts**: `pm:next` (qué tomar), `pm:start`, `pm:pr`, `pm:new`, `pm:stats`. Los commits llevan el id de la historia de la rama solos.
