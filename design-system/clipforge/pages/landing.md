# ClipForge — Landing / Studio Home (Page Override)

> Overrides `MASTER.md` for the studio home (dashboard) surface only. Everything else follows MASTER.

**Updated:** 2026-11-05
**Palette reference:** Supabase design language — dark track (`#1c1c1c` / `#202020` canvas ladder, emerald `#3ecf8e` primary). Token inspiration only via awesome-design-md (`design-md/supabase/DESIGN.md`, MIT). No Supabase logos, wordmarks, screenshots or trade dress are used. ClipForge is not affiliated with Supabase.

## Palette mapping (dark track)

| Supabase token | Value | ClipForge var |
|---|---|---|
| `canvas-night` | `#1c1c1c` | `--canvas` (app background) |
| `canvas-night-soft` | `#202020` | `--surface-1` (panels) |
| — | `#262626` | `--surface-2` |
| — | `#2e2e2e` | `--surface-3` |
| — | `#383838` | `--surface-4` |
| `primary` | `#3ecf8e` | `--accent` (CTA, active, focus, logo) |
| `primary-soft` | `#4ade80` | `--accent-hover` |
| `primary-deep` | `#24b47e` | `--accent-press` |
| `on-primary` | `#171717` | `--on-accent` (near-black text on emerald, never white) |
| `on-dark` | `#ffffff` | `--ink` used near `#f5f5f5` (not pure white) |
| `ink-mute-2` | `#9a9a9a` | `--ink-muted` |
| — | `#8f8f8f` | `--ink-subtle` (≥ 4.5:1 on canvas) |

Hairlines are neutral `rgba(255,255,255,.08/.16)` — never warm-tinted.

## Landing-specific rules

- Emerald is scarce: one filled primary action per viewport (e.g. "New video project"); all other emphasis comes from the grey ladder, hairlines and type weight.
- Emerald on the logo mark only via `currentColor` (see `Logo` in `src/icons.tsx`) — never a second hue.
- Lane colors (video/audio/text/image) stay functional tints at ~20% alpha; they are not brand colors.
- No light-track styling. The landing page is always the dark track.
- No extras from the reference brand: no gradients, glows, pill-shaped CTA buttons (ClipForge shape lock: 6/10/16 radii wins), no decorative atmospheric hero art.

## Verification

- `npm run build` and `npm run lint` pass.
- `:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px }` intact.
- `@media (prefers-reduced-motion: reduce)` still disables transitions/animations.
