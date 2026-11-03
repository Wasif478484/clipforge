# ClipForge v0.2.0 — first desktop release

ClipForge is a free, open-source video editor for the browser and the desktop.
All media stays on your device — nothing is uploaded, no account required.

## Downloads

| Platform | File | Notes |
|---|---|---|
| Windows (x64) | `ClipForge-0.2.0-Setup-x64.exe` | Guided installer — Start Menu + desktop shortcut |
| Windows (x64) | `ClipForge-0.2.0-Portable-x64.exe` | No install — download and run |
| macOS (universal) | `ClipForge-0.2.0-macOS-universal.dmg` | Apple silicon + Intel |
| Linux (x64) | `ClipForge-0.2.0-Linux-x64.AppImage` | `chmod +x`, then run |

Binaries are **not yet code-signed**:

- **Windows:** SmartScreen may warn — choose *More info → Run anyway*.
- **macOS:** Gatekeeper will block the first launch — right-click the app → *Open* (or *System Settings → Privacy & Security → Open Anyway*).
- **Linux:** no signing infrastructure on AppImage; verify size/hash if in doubt.

## What's in it

- Timeline editor — tracks V2 · V1 · A1 · T1, drag to move, edge handles to trim
- Import video/audio/images; generate sample assets in-browser
- Text overlays (size, color, position, timing); 16:9 / 9:16 / 1:1 canvas
- Split at playhead (`Ctrl/Cmd+B`), `Space` play/pause, `Delete` remove
- Export to WebM (VP9) via MediaRecorder — processed fully locally
- Self-contained: no server, no account, no telemetry, no upload

## Security & privacy

- 100% local processing — media never leaves your machine.
- The app makes no network requests except the font CDN when online (Inter; system fonts used otherwise).
- Report issues: https://github.com/Wasif478484/clipforge/issues or SECURITY.md.

## Known limitations

- Export re-captures in real time (a 6-minute edit takes ~6 minutes) and
  produces WebM only. WebCodecs + mp4box and server-side FFmpeg exports are on
  the roadmap.
- Desktop binaries are unsigned (see above).
- macOS/Linux builds come from CI on tagged releases.
