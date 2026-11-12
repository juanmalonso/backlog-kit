---
{{K.id}}: {{storyPrefix}}-NNN
{{K.epic}}: {{epicPrefix}}NN
{{K.title}}: <short title, max 80 characters>
{{K.type}}: feature            # {{typesList}}
{{K.status}}: {{S.refining}}        # {{statesList}}
{{K.priority}}: {{priorityDefault}}         # {{prioritiesList}}
{{K.estimate}}: M            # {{estimatesList}}
{{extraFields}}{{K.issue}}:            # issue number. Filled in by pm:sync. Never derive it from the id.
{{K.branch}}:                    # {{branchHint}}, set when moving to {{S.inProgress}}
{{K.updated}}: YYYY-MM-DD
---

# {{storyPrefix}}-NNN — <title>

## {{sections.story}}

**As** <user profile>
**I want** <capability>
**so that** <benefit>

## Context

<Which part of the product or spec applies and why. Decisions that constrain it.>

## Scope

**Includes**
- …

**Does not include**
- … (and which story it goes to)

## {{sections.criteria}}

Binary: met or not. `[ ]` until implemented and verified.

- [ ] Given <context>, when <action>, then <result>

## {{sections.questions}}

What must be resolved before moving to {{S.ready}}. Each answer moves to "{{sections.decisions}}".

- …

## {{sections.plan}}

1. …

## Tasks

- [ ] …
- [ ] `{{checkCommand}}` clean

## {{sections.tests}}

Copied to the issue as a manual QA checklist (`npm run pm:sync`).

| # | Scenario | Steps | Expected result |
|---|---|---|---|
| 1 | … | … | … |

## {{sections.dependencies}}

- {{storyPrefix}}-NNN — why

## {{sections.decisions}}

- YYYY-MM-DD — …

## {{sections.log}}

- YYYY-MM-DD — Created. ({{S.refining}})
