# Issue tracker: GitHub

Issues and specs for this repo live as GitHub issues. Use the `gh` CLI for all operations.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- **Read an issue**: `gh issue view <number> --json number,title,body,labels,comments`.
- **List issues**: `gh issue list --state open --json number,title,body,labels --jq '[.[] | {number, title, body, labels: [.labels[].name]}]'`.
- **Make an issue a sub-issue**: `gh issue edit <parent> --add-sub-issue <child>` (`gh` 2.94+). Older `gh`: put `Part of #<parent>` at the top of the child body.
- **Blocking**: native issue dependencies (`gh issue create --blocked-by <n>,<n> ...`). Fall back to a `Blocked by: #<n>` line at the top of the child body. A ticket is unblocked when every blocker is closed.
- **Comment on an issue**: `gh issue comment <number> --body "..."`
- **Apply / remove labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Close**: comment the resolution, then `gh issue close <number>`.

Infer the repo from `git remote -v`; `gh` does this automatically inside a clone.

File issues only into the user's own repo. Before the first `gh issue create` of a session, check the target with `gh repo view --json nameWithOwner` and confirm it if it is not `Wasif478484/clipforge`.

## Pull requests as a triage surface

**PRs as a request surface: no.**

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Read it with `gh issue view`.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a single issue with **child** issues as tickets.

- **Map**: a single issue labelled `wayfinder:map`.
- **Child ticket**: linked to the map as a sub-issue (or listed in a task list in the map body). Labels: `wayfinder:<type>` (`research`/`prototype`/`grilling`/`task`). Once claimed, the ticket is assigned to the driving dev.
- **Blocking**: see Conventions.
- **Frontier query**: list the map's open children, drop any with an open blocker or an assignee; first in map order wins.
- **Claim**: `gh issue edit <n> --add-assignee @me`.
- **Resolve**: `gh issue comment <n> --body "<answer>"`, `gh issue close <n>`, then append a context pointer to the map's Decisions-so-far.
