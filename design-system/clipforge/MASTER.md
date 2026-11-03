# ClipForge — Design System (Master)

> **LOGIC:** When building/reviewing any ClipForge surface, check `design-system/clipforge/pages/[page].md` first.
> If it exists, its rules **override** this Master. Otherwise follow Master.

**Project:** ClipForge — open-source browser video editor
**Stack:** React 19 · TypeScript · Vite · Canvas 2D · Web Audio · MediaRecorder
**Established with:** ui-ux-pro-max (`--design-system`) + awesome-design-md (Linear/Vercel/Raycast references — token inspiration only, never copied assets)
**Updated:** 2026-11-03

---

## 1. Direction

Dark, cinematic, precision tool — the editor is the star, chrome is a quiet frame.
Reference class: Linear / Vercel / Raycast (dark dev-tool precision) with a single
"video" accent. OLED-friendly near-black canvas, hairline borders, surface
ladder (no shadows for hierarchy), scarce saturated color.

**Anti-goals:** pure white anything, neon everywhere, emoji icons, shadow-heavy cards, decorative gradients, marketing hero inside the app.

## 2. Color tokens

### Primitives (CSS vars in `src/styles.css`)

| Token | Hex | Notes |
|---|---|---|
| `--canvas` | `#0a0b0e` | app background (own value, not Linear's #010102) |
| `--surface-1` | `#101216` | panels (media/inspector/timeline) |
| `--surface-2` | `#15181d` | cards, inputs, raised rows |
| `--surface-3` | `#1b1f26` | hovered/selected rows, chips |
| `--surface-4` | `#22262e` | deepest lift, toolbars |
| `--hairline` | `rgba(255,255,255,.07)` | 1px borders |
| `--hairline-strong` | `rgba(255,255,255,.12)` | input borders, focus |
| `--ink` | `#f5f6f8` | primary text |
| `--ink-muted` | `#a6adba` | secondary text |
| `--ink-subtle` | `#7d8492` | tertiary, placeholders, disabled (≥ 4.5:1) |
| `--accent` | `#ec4899` | primary CTA, active states, focus ring |
| `--accent-hover` | `#f472b6` | hover |
| `--accent-press` | `#db2777` | active/pressed |
| `--accent-soft` | `rgba(236,72,153,.14)` | selected fills, chips |
| `--blue` | `#3b82f6` | video clip lane (functional) |
| `--green` | `#22c55e` | audio clip lane |
| `--violet` | `#a855f7` | text clip lane |
| `--amber` | `#f59e0b` | image clip lane |
| `--red` | `#ff5d5d` | playhead, destructive |
| `--success` | `#27a644` | only status green |

Contrast: body text ≥ 4.5:1; `--ink-muted` on `--surface-1` passes. Never raw hex in components — use vars.

## 3. Typography

Inter (300/400/500/600/700) via Google Fonts `display=swap`, fallbacks `-apple-system, system-ui, "Segoe UI", Roboto`.
Timecodes & technical numerals: `ui-monospace, SF Mono, Menlo` with `tabular-nums`.

| Use | Size | Weight | Tracking |
|---|---|---|---|
| Panel title (eyebrow) | 11px | 700 | +0.12em uppercase |
| Body / labels | 13px | 400–500 | 0 |
| Clip labels | 11px | 600 | 0 |
| Timecode | 13px | 500 mono | 0 |
| Brand wordmark | 17px | 800 | 0.02em |
| Button | 13px | 700 | 0 |

Line-height 1.5 for prose, 1.2–1.3 for labels. Never < 10.5px.

## 4. Spacing & radii

4 / 8 / 12 / 16 / 24 / 32 / 48. Panels pad 14px. Radius: 6 (chips) / 8–10 (controls) / 12 (panels, cards) / 999 (pills). Shadow only for overlays (`0 16px 48px rgba(0,0,0,.5)`), never for static hierarchy.

## 5. Components

- **Buttons** — primary: `--accent` bg, `#2b0416` text, 800 weight, 8px radius, `cursor:pointer`, hover `--accent-hover`, 150–200ms ease, `translateY(1px)` on press. Ghost: `--surface-2`, hairline border, hover border-accent + accent text. Danger: transparent + red border, soft red fill on hover.
- **Inputs** — `--surface-2`, hairline border, 8px radius; focus: accent border + 3px `--accent-soft` ring; labels above fields (never placeholder-only), 10.5px uppercase eyebrow labels.
- **Panels** — `--surface-1` with hairline right/left border; section padding 14px; section gap via inner stacks.
- **Focus** — every interactive element: `:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px }`. Never remove outlines without replacement.
- **Icons** — inline SVG only, stroke 1.8–2, currentColor, Lucide/Feather-style paths (`src/icons.tsx`). **No emoji anywhere in UI.**
- **Timeline clips** — lane tint fills at ~45%/20%, 1px inner white border, 8px radius, drag = `grab/grabbing`, trim handles reveal on hover/selected, selected = 2px accent outline.
- **Motion** — 150–200ms `ease`, transform/opacity only; `prefers-reduced-motion: reduce` disables transitions/animations.
- **Empty states** — icon in 56px `--surface-2` tile + one-line what + one primary CTA.

## 6. Layout

- App shell: top bar (52px) → workspace grid (280 / 1fr / 300) → timeline (232px).
- Breakpoints: `1280 / 1024 / 768` — below 1024px inspector collapses to overlay? **MVP: fixed min-width 1180px with horizontal scroll note; responsive polish is roadmap, not silent breakage.**
- No horizontal page scroll; timeline scrolls inside its own region only.

## 7. Accessibility (CRITICAL, non-negotiable)

Contrast ≥ 4.5:1 body, ≥ 3:1 large/bold · full keyboard path (`Tab` order, `Space` play/pause, `Delete` delete, `Ctrl/Cmd+B` split, ruler arrow keys) · `aria-label` on every icon-only button · visible focus everywhere · `prefers-reduced-motion` · color never the only signal (clip kind also shown by label icon/shape).

## 8. Pre-delivery checklist

- [ ] No emoji icons (SVG only, consistent set)
- [ ] `cursor: pointer` on all clickable elements
- [ ] 150–300ms hover/focus transitions
- [ ] Visible focus states; contrast ≥ 4.5:1
- [ ] `prefers-reduced-motion` respected
- [ ] No raw hex in components — tokens only
- [ ] No layout-shifting hovers;  CLS < 0.1
- [ ] Icons labeled or decorative-hidden correctly
- [ ] Responsive ≥ 1180px; no horizontal page scroll

## 9. Out of scope (for now)

Marketing/landing patterns (Hero-Centric etc. from the generator output do not apply to the app shell), theming beyond dark, print.
