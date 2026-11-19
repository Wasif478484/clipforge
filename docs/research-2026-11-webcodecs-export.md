# WebCodecs MP4 export research — 2026-11 (ClipForge `src/lib/exporter.ts`)

Context: `src/lib/exporter.ts` (AVC→VP9 fallback, H.264+AAC MP4). `websearch` returned HTTP 402 — discovery used DuckDuckGo HTML; claims trace to the linked primaries. Chromium 40249559 needs sign-in — snippet-only.

## 1. VP9-in-MP4 & Safari WebCodecs

- MDN: H.264-in-MP4 yes; **VP9/AV1 partial**, playback-software dependent — pair VP9 with WebM ([Codec selection](https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API/Codec_selection)).
- Safari/QuickTime does not play VP9-in-MP4 reliably ([Apple Discussions](https://discussions.apple.com/thread/255828144); [immich](https://github.com/immich-app/immich/discussions/9535)). Chrome/Edge/Firefox decode it, varying by build — not share-safe.
- Safari generally ([caniuse](https://caniuse.com/mdn-api_videoencoder), Oct 2026): `VideoEncoder` since Safari 16.4; Firefox 130+; Chrome/Edge 94+. API presence ≠ encode ability ([webcodecsfundamentals](https://webcodecsfundamentals.org/codecs/avc1.42001f.html)): `avc1.42001f` ~99.7%, `avc1.4d0034` ~99.8%, `avc1.64003e` ~1.6%. `AudioEncoder` universal only on Safari 26+; Firefox/desktop Linux **can't encode AAC at all** ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API/Codec_selection)).
- Mediabunny ships `@mediabunny/aac-encoder` for exactly this gap ([footnote](https://mediabunny.dev/guide/supported-formats-and-codecs)).

## 2. AVC codec strings for arbitrary resolutions

- **Limited range is the safe default.** `VideoColorSpace.fullRange` is a boolean ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/VideoColorSpace); [W3C §videocolorspace](https://w3c.github.io/webcodecs/#videocolorspace)). MP4 H.264 assumes limited (16–235) range; full-range needs honored VUI/colr flags — players disagree.
- **Level ≈ resolution/fps envelope** ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API/Codec_selection)): 720p → `avc1.42001f` (Baseline 3.1, ~99.6%); 1080p30 → `avc1.640028` (High 4.0); 1080p60 → `avc1.64002a` (4.2); 4K30 → `avc1.640033` (5.1); 4K60 → `avc1.640034` (5.2). Asking below the envelope gets rejected or clamped.
- **`isConfigSupported` — soft "lie"**: answers "can configure this encoder", not "hardware-accelerated?" (Chromium 40249559: HW accel >1080p@30 disabled on many Windows 10/11 PCs; still reported supported). Unsupported-vs-invalid handling also differs (Chromium `{supported:false}` vs Safari throw, [w3c/webcodecs#744](https://github.com/w3c/webcodecs/issues/744)). Gate with the exact width/height/frameRate you encode — mediabunny's `getFirstEncodable*` passes the config through.

## 3. Chrome quirks: canvas capture & `currentTime` seeking

- `CanvasSource.add(t, duration)` captures **the canvas now** — `t` only labels the frame. Timestamps snap to the track `frameRate`; adding faster yields duplicate timestamps ([media sources](https://mediabunny.dev/guide/media-sources)).
- **Seeking:** `currentTime = x` = accurate seek (decode from nearest prior keyframe to exact target); `fastSeek` trades precision for speed ([MDN fastSeek](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/fastSeek); [WHATWG](https://html.spec.whatwg.org/multipage/media.html#seeking-and-seeked)). Chrome can't seek at all without HTTP 206 ranges — `seekable` reports 0.
- **.webm accurate seek:** cue-index based — exact-time seeks, not keyframe-only, but the decoder re-decodes from the prior keyframe each seek (costly for long GOPs).
- **`seeked` reliability:** fires when `seeking` flips false ([MDN seeked](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/seeked_event); Baseline since 2015). Gotchas: (a) same-position seeks are no-ops — `seeking`/`seeked` may never fire, so awaiting `seeked` can hang; (b) drawing right after `currentTime =` can capture the previous frame — draw only in the handler; (c) rapid seeks coalesce — one `seeked` for the last `t`. WHATWG guarantees the event, not paint timing.
- Mediabunny [releases](https://github.com/Vanilagy/mediabunny/releases): v1.64.0 stale-`VideoFrame` workaround (Chrome for Android) + chronological ISOBMFF chunks; v1.63.0 WebKit AVC-stall workaround + WebKit AAC first-1024-samples fix; v1.61.6 Firefox wrong-AVCC workaround.

## 4. AAC vs Opus in MP4

| | In MP4 | Chrome/Edge decode | Safari/QuickTime | Encoder |
|---|---|---|---|---|
| `mp4a.40.2` (AAC-LC) | ✓ standard | ✓ | ✓ (~78%) | Chrome/Edge ~99%, Linux ~49%/0.6%, Firefox ~0%, Safari ~78% (26+) |
| `opus` | technically ✓ | MSE-ok | **✗** ([Apple Forums](https://developer.apple.com/forums/thread/722399)) | ~100% Chrome/Edge, ~99.9% Firefox, ~78% Safari |

([webcodecsfundamentals](https://webcodecsfundamentals.org/codecs/mp4a.40.2.html) [opus](https://webcodecsfundamentals.org/codecs/opus.html); no caniuse page, [caniuse#6805](https://github.com/Fyrd/caniuse/issues/6805) open.)

**Yes — `mp4a.40.2` for max player support.** Avoid HE-AAC (SBR doubles sample rate). If AAC can't encode, polyfill `@mediabunny/aac-encoder` or use Opus+WebM/MKV.

## 5. Mediabunny quality & `fastStart`

- `Quality('very-low'…'very-high')` maps to bitrate/quantizer by codec + dimensions — no published fixed values. Explicit `new Quality({ bitrate })` is the predictable path for user-facing levels. Gate with `canEncodeVideo('avc', { width, height, frameRate, quality })`. Starting points: ~8 Mbps 1080p30, ~12–20 1080p60, ~35–45 4K.
- `fastStart: 'in-memory'` buffers chunks, writes `moov` up front (append-only; default for `BufferTarget`) ([output formats](https://mediabunny.dev/guide/output-formats)). Correct for **download-then-share** (the Blob is in memory anyway) and streams without ranges. Cost: peak memory ≈ file size + buffer — above ~100 MB prefer `StreamTarget` + File System Access API or `fastStart: 'reserve'` (needs `maximumPacketCount`). v1.66.0 reduced its peak memory ([releases](https://github.com/Vanilagy/mediabunny/releases)).
- Adding audio before video matches packet-buffering guidance (smaller-footprint track first).

## Implications for ClipForge

1. Keep AVC-first; the VP9-in-MP4 fallback is Chrome/Edge/Firefox-only — label it or use WebM+Opus.
2. Request resolution-matched limited-range strings (`avc1.640028/2a/33/34`, fallback `avc1.4d0034` → `avc1.42001f`); `isConfigSupported` ≠ HW speed — expect software fallback.
3. **Safari < 26 gets no AAC audio**; pin mediabunny ≥ 1.66 (WebKit AAC/AVC workarounds); consider `@mediabunny/aac-encoder` there.
4. **Await `seeked` before drawing**; tolerate no-op/coalesced seeks (t=0); fps-grid timestamps; prefer `VideoSampleSink`/`CanvasSink` over `<video>` seeks.
5. `mp4a.40.2` + `Quality('high')` + `fastStart: 'in-memory'` + BufferTarget is the download-then-share default; switch to `StreamTarget` + `showSaveFilePicker` above ~100 MB.

## Failed / partial sources
- `websearch`: HTTP 402. Chromium 40249559: sign-in required. MDN pages intermittently timed out. WebM-cue seek behavior is inferred from WHATWG/MDN semantics, not a dedicated Chromium doc.
