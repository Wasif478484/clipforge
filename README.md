# ClipForge

A free, open-source video editor for the browser. Timeline editing, text overlays,
and one-click export — all media stays on your device, nothing is uploaded.

**Not affiliated with CapCut or ByteDance.** ClipForge is an independent project
built from public web standards (Canvas, WebCodecs-era APIs, MediaRecorder) as an
open alternative for people who want a CapCut-style editor they can own and modify.

## Features (MVP)

- Import video / audio / image files, or generate sample assets in-browser
- Multi-track timeline (V2 · V1 · A1 · T1) — drag to move, edge handles to trim
- 16:9 / 9:16 / 1:1 canvas, real-time preview compositor (Canvas 2D)
- Text overlays with size, color and position controls
- Per-clip volume, mute, frame fit (fill / letterbox)
- Split at playhead (`Ctrl/Cmd+B`), `Space` play/pause, `Delete` to remove
- Export to **WebM** (VP9) via `MediaRecorder` — plays through in real time

## Stack

React 19 · TypeScript · Vite · Canvas 2D · Web Audio API · MediaRecorder

No server, no upload, no account. Static hosting is enough (Vercel, Netlify, GitHub Pages).

## Develop

```bash
npm install
npm run dev      # local dev server
npm run build    # type-check + production build → dist/
npm run preview  # serve the production build locally
```

## Deploy (Vercel)

```bash
npx vercel        # preview deployment
npx vercel --prod # production
```

`vercel.json` SPA rewrites are included; the build output is `dist/`.

## Roadmap

- [ ] Export without real-time re-capture (WebCodecs + mp4box) or ffmpeg.wasm
- [ ] Server-side render option for faster exports (headless FFmpeg)
- [ ] Transitions, effects, keyframes
- [ ] Captions (Whisper WASM) and auto-subtitles
- [ ] Audio denoise (RNNoise) and background matting (MediaPipe)
- [ ] Project save/load (IndexedDB + portable `.clipforge.json`)
- [ ] Collaboration (Yjs CRDT)

## License

MIT — see [LICENSE](LICENSE).
