## Backlog and workflow (backlog-kit)

Work lives in `.pm/`: one folder per epic (`{{epicPrefix}}NN-slug/`) and one per story
(`{{storyPrefix}}-NNN-slug/README.md`). A story's status lives **only** in its README frontmatter;
`.pm/backlog.md` is generated (`npm run pm:backlog`, and the hook does it automatically). Settings
are in `.pm/config.json`. Open the board in VS Code with "Backlog Kit: Open board".

### At the start of a session

1. Read `.pm/backlog.md`: what is in progress, in review or blocked.
2. If the user names a story (`{{storyPrefix}}-NNN`) or an epic, read that README **before** doing anything.
3. If a story is {{S.inProgress}}, resume from its "{{sections.log}}" and check you are on its branch.

### Building something new

```text
1. Does the story exist?
   - NO                                → /{{skillPrefix}}story-new
   - YES, {{S.backlog}} or {{S.refining}}     → /{{skillPrefix}}story-refine (resolve questions with the user)
   - YES, {{S.ready}}                      → step 2
2. npm run pm:start -- {{storyPrefix}}-NNN  → {{S.inProgress}} and branch from origin/{{mainBranch}}
3. Implement the plan. Milestone → /{{skillPrefix}}story-log. Cross-story decision → /{{skillPrefix}}doc-adr. Trap → /{{skillPrefix}}doc-finding.
4. `{{checkCommand}}` clean → criteria-reviewer subagent → tick what was verified
   → /{{skillPrefix}}story-advance {{storyPrefix}}-NNN {{S.review}}{{#github}} → npm run pm:pr (builds the PR with "Closes #<issue>"){{/github}}
5. The user accepts → /{{skillPrefix}}story-advance {{storyPrefix}}-NNN {{S.done}}
```

### Statuses

```text
{{S.backlog}} → {{S.refining}} → {{S.ready}} → {{S.inProgress}} → {{S.review}} → {{S.done}}
Side states: {{S.blocked}} (with a note on what/who) and {{S.discarded}}.
```

- **{{S.ready}}**: binary criteria, plan, test cases and zero open questions.
- **{{S.review}}**: every criterion ticked and checks clean. `pm:advance` enforces it.
- **{{S.done}}**: only when the user accepts it. Never mark it done yourself.

### Hard rules

- **One story = one branch = one PR.**
- **No code changes without a story in {{S.ready}} or {{S.inProgress}}**, except trivial fixes.
- **The next id comes from `npm run pm:next-id`** (checks remote branches and issues). Never guess it.
{{#github}}- **The story id is not the issue number**: it comes from `{{K.issue}}` (`npm run pm:issue -- <ID>`).
{{/github}}{{#gitGuard}}- **`{{mainBranch}}` only changes through a merged PR with green CI.** Enforced by `scripts/hooks/git-guard.mjs` and `.githooks/pre-push`. If a hook blocks, do not work around it.
{{/gitGuard}}- **If the guard (`pm:check`) or the hook blocks, fix the cause.**

| Moment | Skill |
|---|---|
| New idea or request | `/{{skillPrefix}}story-new` |
| Story without criteria, plan, or with questions | `/{{skillPrefix}}story-refine` |
| Start, send to review, close, block | `/{{skillPrefix}}story-advance` |
| Milestone within a story | `/{{skillPrefix}}story-log` |
| "What's next?" | `/{{skillPrefix}}story-backlog` |
{{#github}}| Someone opened an issue by hand | `/{{skillPrefix}}story-adopt-issue` |
{{/github}}| Decision beyond one story | `/{{skillPrefix}}doc-adr` |
| Trap or false hypothesis | `/{{skillPrefix}}doc-finding` |
| Several ready stories in parallel | `/{{skillPrefix}}story-wave` |

### Tools for Claude

- **Automatic context**: at startup Claude gets the branch's story; if a message names a story, its README.
  When a turn ends with code changed and no log entry today, it is reminded to record progress.
- **Subagents**: `criteria-reviewer` (does the diff meet each criterion?, with evidence) and `refiner` (proposes criteria, plan and questions).
{{#mcp}}- **`backlog` MCP**: `story_list`, `story_get`, `story_next`, `backlog_stats` (read) and `story_advance`, `story_log`,
  `story_create`, `story_check_criterion` (they run the same scripts, with the same rules).
{{/mcp}}- **Scripts**: `pm:next` (what to pick), `pm:start`, `pm:pr`, `pm:new`, `pm:stats`. Commits get the branch's story id automatically.
