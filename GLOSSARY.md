# GLOSSARY — ClipForge

Domain terms used across the codebase, tests and docs. Agents and humans: use these names exactly.

## Timeline model

- **Project** — the editable state of a video session: name, aspect (`16:9` | `9:16` | `1:1`), clips, text overlays, captions, markers, in/out points, track settings. Persisted as `.clipforge.json` (embedded media, format v2) or as a "recent" in IndexedDB.
- **Asset** (`MediaAsset`) — an imported media item (video/audio/image). Referenced by clips via `assetId`. Elements live in the transient `mediaEls` map; object URLs are revoked on reset.
- **Clip** — a placed instance of an asset on a video/audio track: timeline `start`/`duration`, source `trimStart`/`trimEnd`, `speed`, fades, keyframes, filter/transform/blend/mask/chroma.
- **Track** — `V2` / `V1` (video), `A1` (audio), `T1` (text). `TrackSettingsMap` carries per-track `locked` / `muted` / `hidden`.
- **Text overlay** — canvas-drawn text positioned in canvas fractions with an entrance animation; stickers are emoji texts in the same model.
- **Caption** — one timed subtitle line (from manual typing, `.srt`/`.vtt` import, or Whisper auto-transcription of an audio-capable clip).
- **Marker** — a timed point on the timeline (`♪` for Beats, `M{n}` manual).
- **Selection** — `{type:'clip'|'text', id}` plus multi-select `selectedIds`.
- **In/out points** — trim range markers for exports (used by export and preview loops).

## Project state & persistence

- **Recent** — IndexedDB-backed saved state list (name, aspect, thumb, blob media). "Save to recents" stores one.
- **Cloud project** — Supabase `cloud_projects` row + `project_assets` bucket media. Opt-in via `VITE_SUPABASE_CLOUD_PROJECTS`.
- **Share link** — public `#/share/<uid>/<uuid>.mp4` route rendering a read-only player; backed by the public `shared-videos` bucket. Created from the ⋯ menu.
- **Template** (`VideoTemplate`) — dashboard card seeding a new project with a 4-layer text scaffold (kicker/title/subtitle/handle) and aspect.
- **Hydration** (`hydrateClip`) — filling added-since fields of old v1 saves with defaults so old projects still load.

## Render & export

- **drawFrame** — the canvas compositor that renders clips (track order V1→V2), transitions, keyframes and texts at time `t`; preview and exports share it.
- **Composite canvas** — the export/preview canvas; `720p` exports draw on the preview canvas, larger sizes on a hidden one.
- **Chroma key / mask / blend mode** — per-clip pixel ops applied on the shared offscreen buffer before compositing (`render.ts`).
- **Offline export** — faster-than-real-time path: seek each active `<video>` to exact source time, `drawFrame(t)`, encode via Mediabunny + WebCodecs; ffmpeg.wasm + MediaRecorder remains as fallback.
- **Realtime export** — legacy capture: canvas `captureStream` + WebAudio MediaStreamDestination into MediaRecorder.
- **Envelope** (`clipVolumeAt`) — per-clip volume over time: volume × volume keyframes × volume fade in/out; live gains and offline mix both derive from it.

## People & surfaces

- **Local mode** — gate option "Continue without an account": full editor, nothing uploaded.
- **Landing** (`LandingPage`) — marketing page; `#/share/...` bypasses it (ShareView first).
- **Studio / dashboard** — post-gate home: recents, cloud projects, templates, settings.
- **Obsidian & Champagne** — house style; accent `#e6c476`; all "not affiliated with CapCut or ByteDance" notices are intentional, do not remove.
