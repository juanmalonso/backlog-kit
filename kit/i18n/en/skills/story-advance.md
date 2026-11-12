---
name: story-advance
description: Move a story through its lifecycle ({{S.inProgress}}, {{S.review}}, {{S.done}}, {{S.blocked}}, back to {{S.ready}}). Use for "start {{storyPrefix}}-NNN", "send it to review", "close it", "it's blocked by X". Updates README, backlog{{#github}} and issue{{/github}} in one step.
---

# /story-advance — Change a story's status

The mechanics (validating the transition, frontmatter, log, backlog{{#github}}, labels, comment, closing or reopening the issue{{/github}}) are done by the script. Your job is to verify the change is true.

```bash
npm run pm:advance -- {{storyPrefix}}-NNN <STATUS> [--note "…"]
```

The VS Code board does the same when you drag a card.

## Before each transition

| To | Verify first |
|---|---|
| {{S.inProgress}} | It is {{S.ready}} and its dependencies are resolved. Then: `git fetch && git switch -c <printed branch> origin/{{mainBranch}}`. Read the whole README before touching code |
| {{S.review}} | `{{checkCommand}}` clean. Tick in the README **only** the criteria you verified. The script rejects unticked criteria; `--force` only with a `--note` explaining why |
| {{S.done}} | **Only if the user explicitly accepted it.** Never on your own |
| {{S.blocked}} | `--note "<what is missing> (depends on: <who/what>)"` is required |
{{#github}}
## When moving to {{S.review}}, open the PR

```bash
git push -u origin <branch>
gh pr create --base {{mainBranch}} --title "[{{storyPrefix}}-NNN] <title>" --body "<summary, how it was verified>

Closes #<issue>"
```

The issue number comes from `npm run pm:issue -- {{storyPrefix}}-NNN`, never from the id.
{{/github}}
## Report

Transition, README path{{#github}}, issue and PR links if any{{/github}}.
