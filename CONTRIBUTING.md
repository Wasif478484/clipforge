# Contributing to ClipForge

Thanks for helping build a free, open alternative video editor. Contributions
of all sizes are welcome — bug reports, docs, design, and code.

## Ground rules

- **License:** MIT. By contributing you agree your code is licensed under the
  same terms (inbound = outbound). No CLA.
- **Be kind:** see `CODE_OF_CONDUCT.md`.
- **Scope:** ClipForge is a local-first, privacy-respecting tool. Do not add
  telemetry, analytics pings, mandatory network calls, or anything that uploads
  user media — those PRs will be rejected.
- **No proprietary assets:** never commit CapCut/ByteDance (or any third
  party's) assets, icons, branding, or decompiled code. Keep everything
  original or permissively licensed (note third-party licenses in the PR).

## Development setup

```bash
git clone https://github.com/Wasif478484/clipforge
cd clipforge
npm install
npm run dev        # Vite dev server
npm run build      # type-check + production build
npm run preview    # serve the production build
npm run lint       # oxlint
npm run desktop:build   # Windows installer + portable exe → release/
```

## Pull requests

1. Fork, branch from `main`, keep branches focused (one concern per PR).
2. `npm run lint` and `npm run build` must pass — CI checks both.
3. For UI changes, follow `design-system/clipforge/MASTER.md` (tokens, SVG
   icons only, focus-visible states, no emoji icons) and include a before/after
   screenshot.
4. Write commit messages in the imperative mood ("Add …", "Fix …").
5. Open the PR against `main`; fill in the description honestly — what changed,
   why, how it was tested.

## Reporting bugs / requesting features

Use the GitHub issue templates. For security-sensitive issues, see `SECURITY.md`.
