import { useEffect, useMemo, useRef, useState, type DragEvent as ReactDragEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { TRACKS, type Clip, type MediaKind, type Selection, type TextOverlay } from '../types';
import { clamp } from '../util';
import { FilmIcon, MusicIcon, TypeIcon } from '../icons';

interface Props {
  clips: Clip[];
  texts: TextOverlay[];
  assetKindById: Record<string, MediaKind | undefined>;
  waveforms: Record<string, number[]>;
  duration: number;
  currentTime: number;
  playing: boolean;
  pxPerSec: number;
  onPxPerSecChange: (v: number) => void;
  selection: Selection;
  selectedIds: string[];
  onSelect: (sel: Selection, shiftKey?: boolean) => void;
  onSeek: (t: number) => void;
  onPatchClip: (id: string, patch: Partial<Clip>) => void;
  onPatchText: (id: string, patch: Partial<TextOverlay>) => void;
  onDropAsset: (assetId: string, trackId: string, time: number) => void;
}

type DragState =
  | { kind: 'clip'; mode: 'move' | 'left' | 'right'; id: string; startClientX: number; orig: { start: number; duration: number; trimStart: number; trimEnd: number } }
  | { kind: 'text'; mode: 'move' | 'left' | 'right'; id: string; startClientX: number; orig: { start: number; duration: number } }
  | { kind: 'ruler' }
  | null;

const formatTick = (s: number): string =>
  `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

const TRACK_ICONS = { video: FilmIcon, audio: MusicIcon, text: TypeIcon } as const;
const TrackIcon = ({ kind }: { kind: 'video' | 'audio' | 'text' }) => {
  const Icon = TRACK_ICONS[kind];
  return <Icon size={13} strokeWidth={2.2} aria-hidden="true" />;
};

export default function Timeline({
  clips,
  texts,
  assetKindById,
  waveforms,
  duration,
  currentTime,
  playing,
  pxPerSec,
  onPxPerSecChange,
  selection,
  selectedIds,
  onSelect,
  onSeek,
  onPatchClip,
  onPatchText,
  onDropAsset,
}: Props) {
  const dragRef = useRef<DragState>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const userScrolledRef = useRef(false);
  const [dropTrackId, setDropTrackId] = useState<string | null>(null);

  // Auto-scroll the playhead into view during playback — until the user
  // scrolls manually, which disables it until the next play().
  useEffect(() => {
    if (!playing) { userScrolledRef.current = false; return; }
    const el = scrollRef.current;
    if (!el || userScrolledRef.current) return;
    const x = 56 + currentTime * pxPerSec;
    const visibleStart = el.scrollLeft;
    const visibleEnd = el.scrollLeft + el.clientWidth;
    if (x < visibleStart + 12) el.scrollLeft = Math.max(0, x - 72);
    else if (x > visibleEnd - 12) el.scrollLeft = x + 72 - el.clientWidth;
  }, [currentTime, playing, pxPerSec]);

  const totalSeconds = Math.max(duration + 30, 60);
  const totalWidth = totalSeconds * pxPerSec;

  const tickStep = useMemo(() => {
    const steps = [0.25, 0.5, 1, 2, 5, 10, 15, 30, 60];
    return steps.find((s) => s * pxPerSec >= 64) ?? 60;
  }, [pxPerSec]);

  const ticks = useMemo(() => {
    const out: { left: number; label: string; major: boolean }[] = [];
    for (let t = 0; t <= totalSeconds; t += tickStep) {
      const idx = Math.round(t / tickStep);
      out.push({ left: t * pxPerSec, label: formatTick(t), major: idx % 4 === 0 });
    }
    return out;
  }, [totalSeconds, tickStep, pxPerSec]);

  const clipsInLane = (trackId: string) => clips.filter((c) => c.trackId === trackId);

  const startDrag = (
    e: ReactPointerEvent<HTMLDivElement>,
    state: NonNullable<DragState>,
  ) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = state;
  };

  const handlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;

    if (drag.kind === 'ruler') {
      const lane = (e.currentTarget.closest('.timeline-inner') as HTMLElement | null);
      if (!lane) return;
      const rect = lane.getBoundingClientRect();
      onSeek(clamp((e.clientX - rect.left - 56) / pxPerSec, 0, totalSeconds));
      return;
    }

    const dx = (e.clientX - drag.startClientX) / pxPerSec;

    if (drag.kind === 'clip') {
      const o = drag.orig;
      if (drag.mode === 'move') {
        let newStart = clamp(o.start + dx, 0, totalSeconds);
        // vertical track change: find the lane under the pointer
        const lane = document.elementFromPoint(e.clientX, e.clientY)?.closest('.track-lane') as HTMLElement | null;
        const targetTrackId = lane?.dataset.trackId ?? null;
        if (targetTrackId) {
          const clip = clips.find((c) => c.id === drag.id);
          const assetKind = clip ? assetKindById[clip.assetId] : undefined;
          const track = TRACKS.find((tr) => tr.id === targetTrackId);
          const compatible =
            track != null && assetKind != null &&
            (assetKind === 'audio' ? track.kind === 'audio' : track.kind === 'video');
          setDropTrackId(compatible ? targetTrackId : null);
          if (compatible && track && (clip?.trackId ?? '') !== targetTrackId) {
            onPatchClip(drag.id, { trackId: targetTrackId });
          }
        } else {
          setDropTrackId(null);
        }
        // snap to other clips' edges on the same track
        const others = clips.filter((c) => c.id !== drag.id && c.trackId === (clips.find((x) => x.id === drag.id)?.trackId));
        for (const o2 of others) {
          if (Math.abs(newStart - o2.start) < 0.15) newStart = o2.start;
          if (Math.abs(newStart - (o2.start + o2.duration)) < 0.15) newStart = o2.start + o2.duration;
        }
        onPatchClip(drag.id, { start: newStart });
      } else if (drag.mode === 'left') {
        const newStart = clamp(o.start + dx, 0, o.start + o.duration - 0.1);
        const d = newStart - o.start;
        onPatchClip(drag.id, { start: newStart, duration: o.duration - d, trimStart: o.trimStart + d });
      } else {
        const maxDur = o.duration + o.trimEnd;
        onPatchClip(drag.id, { duration: clamp(o.duration + dx, 0.1, maxDur) });
      }
      return;
    }

    // text overlay drag
    const o = drag.orig;
    if (drag.mode === 'move') {
      onPatchText(drag.id, { start: clamp(o.start + dx, 0, totalSeconds) });
    } else if (drag.mode === 'left') {
      const newStart = clamp(o.start + dx, 0, o.start + o.duration - 0.1);
      const d = newStart - o.start;
      onPatchText(drag.id, { start: newStart, duration: o.duration - d });
    } else {
      onPatchText(drag.id, { duration: clamp(o.duration + dx, 0.1, totalSeconds) });
    }
  };

  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current) {
      setDropTrackId(null);
      dragRef.current = null;
      try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* already released */ }
    }
  };

  const renderClip = (clip: Clip) => {
    const assetKind = assetKindById[clip.assetId];
    const kind = assetKind ?? 'video';
    const selected = selectedIds.includes(clip.id);
    return (
      <div
        key={clip.id}
        className={`clip kind-${kind}${selected ? ' selected' : ''}`}
        style={{ left: clip.start * pxPerSec, width: Math.max(24, clip.duration * pxPerSec) }}
        title={`${clip.name} · ${clip.duration.toFixed(2)}s`}
        onPointerDown={(e) => {
          onSelect({ type: 'clip', id: clip.id }, e.shiftKey);
          const mode = (e.target as HTMLElement).dataset.trim as 'left' | 'right' | undefined;
          startDrag(e, mode
            ? { kind: 'clip', mode, id: clip.id, startClientX: e.clientX, orig: { start: clip.start, duration: clip.duration, trimStart: clip.trimStart, trimEnd: clip.trimEnd } }
            : { kind: 'clip', mode: 'move', id: clip.id, startClientX: e.clientX, orig: { start: clip.start, duration: clip.duration, trimStart: clip.trimStart, trimEnd: clip.trimEnd } });
        }}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
      >
        <div className="trim left" data-trim="left" />
        <span className="clip-name">{clip.name}</span>
        {kind === 'audio' && waveforms[clip.assetId] && (
          <span className="waveform" aria-hidden="true">
            {waveforms[clip.assetId].map((p, i) => (
              <span key={i} className="wave-bar" style={{ height: `${Math.max(2, p * 100)}%` }} />
            ))}
          </span>
        )}
        <div className="trim right" data-trim="right" />
      </div>
    );
  };

  const renderText = (text: TextOverlay) => {
    const selected = selection?.type === 'text' && selection.id === text.id;
    return (
      <div
        key={text.id}
        className={`clip kind-text${selected ? ' selected' : ''}`}
        style={{ left: text.start * pxPerSec, width: Math.max(24, text.duration * pxPerSec) }}
        title={`Text: ${text.text}`}
        onPointerDown={(e) => {
          onSelect({ type: 'text', id: text.id });
          const mode = (e.target as HTMLElement).dataset.trim as 'left' | 'right' | undefined;
          startDrag(e, { kind: 'text', mode: mode ?? 'move', id: text.id, startClientX: e.clientX, orig: { start: text.start, duration: text.duration } });
        }}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
      >
        <div className="trim left" data-trim="left" />
        <span className="clip-name">T · {text.text}</span>
        <div className="trim right" data-trim="right" />
      </div>
    );
  };

  const empty = clips.length === 0 && texts.length === 0;

  return (
    <section className="timeline" aria-label="Timeline">
      <div className="timeline-head">
        <div className="timeline-title">Timeline</div>
        <div className="zoom">
          <span aria-hidden="true">−</span>
          <input
            type="range" min={10} max={140} step={1} value={pxPerSec}
            onChange={(e) => onPxPerSecChange(Number(e.target.value))}
            aria-label="Timeline zoom"
          />
          <span aria-hidden="true">+</span>
        </div>
      </div>
      <div
        className="timeline-scroll"
        ref={scrollRef}
        onWheel={() => { userScrolledRef.current = true; }}
      >
        <div className="timeline-inner" style={{ width: totalWidth + 56 }}>
          <div
            className="ruler"
            style={{ width: totalWidth + 56 }}
            onPointerDown={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              onSeek(clamp((e.clientX - rect.left - 56) / pxPerSec, 0, totalSeconds));
              startDrag(e, { kind: 'ruler' });
            }}
            onPointerMove={handlePointerMove}
            onPointerUp={endDrag}
            role="slider"
            aria-label="Seek"
            aria-valuemin={0}
            aria-valuemax={Math.round(totalSeconds)}
            aria-valuenow={Math.round(currentTime)}
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'ArrowLeft') onSeek(clamp(currentTime - 1, 0, totalSeconds));
              if (e.key === 'ArrowRight') onSeek(clamp(currentTime + 1, 0, totalSeconds));
            }}
          >
            {ticks.map((tick, i) => (
              <div key={i} className={`tick${tick.major ? ' major' : ''}`} style={{ left: tick.left + 56 }}>
                {tick.label}
              </div>
            ))}
          </div>

          {TRACKS.map((track) => (
            <div className="track-row" key={track.id}>
              <div className="track-label" title={track.name}>
                <TrackIcon kind={track.kind} />
                <span>{track.name}</span>
              </div>
              <div
                className={`track-lane${dropTrackId === track.id ? ' drop-target' : ''}`}
                data-track-id={track.id}
                onDragOver={(e) => {
                  const assetId = e.dataTransfer.types.includes('application/x-clipforge-asset');
                  if (!assetId) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'copy';
                  setDropTrackId(track.id);
                }}
                onDragLeave={(e) => {
                  if (e.currentTarget === e.target) setDropTrackId((id) => (id === track.id ? null : id));
                }}
                onDrop={(e: ReactDragEvent<HTMLDivElement>) => {
                  e.preventDefault();
                  setDropTrackId(null);
                  const assetId = e.dataTransfer.getData('application/x-clipforge-asset');
                  if (!assetId) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  const time = clamp((e.clientX - rect.left) / pxPerSec, 0, totalSeconds);
                  onDropAsset(assetId, track.id, time);
                }}
              >
                {track.kind === 'text'
                  ? texts.map(renderText)
                  : clipsInLane(track.id).map(renderClip)}
              </div>
            </div>
          ))}

          {empty && <div className="timeline-empty">Add media from the left panel to start your timeline.</div>}
          <div className="playhead" style={{ left: 56 + currentTime * pxPerSec }} />
        </div>
      </div>
    </section>
  );
}
