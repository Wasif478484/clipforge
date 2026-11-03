import { forwardRef } from 'react';
import type { Aspect } from '../types';
import { CANVAS_SIZE } from '../types';
import { formatTime } from '../util';

interface Props {
  aspect: Aspect;
  playing: boolean;
  currentTime: number;
  duration: number;
  onTogglePlay: () => void;
  onSeekStart: () => void;
  hasContent: boolean;
}

const RATIO: Record<Aspect, number> = { '16:9': 16 / 9, '9:16': 9 / 16, '1:1': 1 };

const Stage = forwardRef<HTMLCanvasElement, Props>(function Stage(
  { aspect, playing, currentTime, duration, onTogglePlay, onSeekStart, hasContent },
  canvasRef,
) {
  const size = CANVAS_SIZE[aspect];
  const ratio = RATIO[aspect];

  return (
    <section className="stage-col">
      <div className="stage-wrap">
        <div
          className="stage-frame"
          style={{
            aspectRatio: String(ratio),
            height: aspect === '9:16' ? '100%' : undefined,
            width: aspect === '9:16' ? undefined : '100%',
          }}
        >
          <canvas ref={canvasRef} width={size.w} height={size.h} aria-label="Video preview" />
          {!hasContent && (
            <div className="stage-hint">
              <div style={{ fontSize: 40, opacity: 0.5 }}>🎬</div>
              <div>
                Your timeline is empty.<br />
                Import media on the left, then press <b>+</b> to add it.
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="transport">
        <button className="icon-btn" onClick={onSeekStart} title="Back to start" aria-label="Back to start">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M3 2h2v12H3zM13 2v12L6 8z"/></svg>
        </button>
        <button className="icon-btn primary" onClick={onTogglePlay} title={playing ? 'Pause (Space)' : 'Play (Space)'} aria-label={playing ? 'Pause' : 'Play'}>
          {playing ? (
            <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor"><path d="M4 2h3v12H4zM9 2h3v12H9z"/></svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor"><path d="M4 2l10 6-10 6z"/></svg>
          )}
        </button>
        <div className="timecode" aria-live="off">
          <b>{formatTime(currentTime)}</b> / {formatTime(duration)}
        </div>
        <div className="spacer" />
        <div className="timecode" style={{ minWidth: 'auto', fontSize: 11 }}>
          canvas {size.w}×{size.h}
        </div>
      </div>
    </section>
  );
});

export default Stage;
