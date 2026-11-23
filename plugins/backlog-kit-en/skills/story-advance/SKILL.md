---
name: story-advance
description: Move a story through its lifecycle (IN_PROGRESS, IN_REVIEW, DONE, BLOCKED, back to READY). Use for "start US-NNN", "send it to review", "close it", "it's blocked by X". Updates README, backlog and issue in one step.
---

# /story-advance — Change a story's status

The mechanics (validating the transition, frontmatter, log, backlog, labels, comment, closing or reopening the issue) are done by the script. Your job is to verify the change is true.

```bash
npm run pm:advance -- US-NNN <STATUS> [--note "…"]
```

The VS Code board does the same when you drag a card.

## Before each transition

| To | Verify first |
|---|---|
| IN_PROGRESS | It is READY and its dependencies are resolved. Then: `git fetch && git switch -c <printed branch> origin/main`. Read the whole README before touching code |
| IN_REVIEW | `npm run pm:check` clean and the `criteria-reviewer` subagent reports nothing missing. Tick in the README **only** the criteria you verified. The script rejects unticked criteria; `--force` only with a `--note` explaining why |
| DONE | **Only if the user explicitly accepted it.** Never on your own |
| BLOCKED | `--note "<what is missing> (depends on: <who/what>)"` is required |

## When moving to IN_REVIEW, open the PR/MR

```bash
npm run pm:pr        # push + PR/MR with story, criteria, last log and Closes #<issue>
```

The issue number comes from `npm run pm:issue -- US-NNN`, never from the id. Merge with
`npm run pm:merge -- <n>` (only with green CI and no conflicts; `--dry-run` shows the commits that go in).

## When the issue does not match

`pm:advance` and `pm:issue` check that the issue in `github_issue` has this story's title. If they fail, **fix the
data** (`npm run pm:issue -- --verify` audits them all): the degraded mode is writing to someone else's story. Do not
change labels by hand: the script sends the full list in one request, because adding and removing labels in the same
request clash and the API still answers 200.

Kiwi: every transition syncs the test cases with Kiwi TCMS. If Kiwi does not answer, it warns and the status change
goes on; re-sync later with `npm run pm:kiwi -- US-NNN`.

## Report

Transition, README path, issue and PR/MR links if any.
