# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`GLOSSARY.md`** at the repo root, or
- **`GLOSSARY-MAP.md`** at the repo root if it exists (it does not; this is a single-context repo), and
- **`docs/adr/`** if it exists (it does not yet; create ADRs lazily with `/domain-modeling` as decisions land).

If `GLOSSARY.md` is absent, **proceed silently**; do not flag its absence as a problem.

## File structure

Single-context repo:

```
/
├── GLOSSARY.md
├── docs/adr/                          ← created when the first ADR lands
└── src/
```

## Use the glossary's vocabulary

When your output names a domain concept (an issue title, a refactor proposal, a test name), use the term as defined in `GLOSSARY.md`. Do not drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, either you're inventing language the project doesn't use (reconsider) or there's a real gap — note it for `/domain-modeling`.

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007, but worth reopening because…_
