# Triage Labels

Five canonical triage roles. Default mapping (kept as-is on 2026-11-19) plus the repo's own vocabulary.

| Label in mattpocock/skills | Label in our tracker | Meaning                                  |
| -------------------------- | -------------------- | ---------------------------------------- |
| `needs-triage`             | `needs-triage`       | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info`         | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`    | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `ready-for-human`    | Requires human implementation            |
| `wontfix`                  | `wontfix`            | Will not be actioned                     |

Additional repo labels (owner's choice, 2026-11-19): `bug`, `enhancement`, `blocked` (for the native blocked-by dependency), `needs-repro` (alias for needs-info when a reproduction is missing).

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the corresponding label string from the table.

Edit the mapping column to change the vocabulary.
