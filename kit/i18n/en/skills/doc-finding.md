---
name: doc-finding
description: Record a finding in {{docs.findings}}/: a non-obvious problem, a trap, a hypothesis that turned out false, with its measured cause and the procedure that works. Use after debugging something costly, or when the user says "document this".
---

# /doc-finding — Record a finding

A finding exists so the next session does not lose the same hour.

1. Number: the next one after `ls {{docs.findings}}/{{docs.findingPrefix}}-*.md`.
2. Copy `{{docs.findings}}/template.md` to `{{docs.findings}}/{{docs.findingPrefix}}-NNN-<slug>.md`.
3. Literal **symptom**, measured **cause** (if it is a hypothesis, say so), **what to do** with commands and **how to recognize it**.
4. Row in `{{docs.findings}}/README.md` and a link from the story (`/story-log`).
