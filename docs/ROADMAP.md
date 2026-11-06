# ClipForge roadmap

## Delivered

- Local MediaPipe and FFmpeg assets
- Browser/Electron local-first editing
- WebM and MP4 export with capability checks and cancellation
- Project validation, embedded-media save/load, and recent projects
- Zustand-backed core editor state
- Timeline snapping, markers, and in/out points
- SRT/VTT caption import, preview, project persistence, and export
- Storage diagnostics and low-storage warnings
- Installable offline shell through a service worker and web manifest
- Electron IPC handlers for file dialogs and menu action events
- Persisted track lock/mute/hide settings with lock enforcement
- Functional ripple deletion on unlocked tracks

## In progress

- Extract playback, audio graph, renderer, export, and persistence hooks from `App.tsx`
- Full accessibility pass for timeline semantics and screen-reader announcements
- Audio editing improvements: crossfades, pan, meters, normalization, and recording
- Advanced local media tools: matting, face blur, and auto-reframe

## Planned infrastructure

These require additional runtime infrastructure and are not part of the static Vercel
deployment. The current app intentionally exposes no fake or partial online mode for
these capabilities:

- Headless/server-side rendering with a worker queue and object storage
- Local Whisper WASM transcription and automatic subtitle generation
- RNNoise WASM audio denoise
- Yjs collaboration, presence, persistence, and conflict resolution

## Production boundary

The browser and Electron targets remain local-first. A future infrastructure deployment
must provide authenticated APIs, object storage, background workers, quotas, observability,
and data-retention controls before enabling server rendering, collaboration, transcription,
or denoise. These features should ship behind explicit capability checks and feature flags,
not as client-side fallbacks that appear to succeed without completing the operation.

Each infrastructure item should be implemented behind a feature flag or separate
deployment target, with privacy and storage behavior documented before release.
