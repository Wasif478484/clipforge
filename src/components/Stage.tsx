import { forwardRef } from 'react';
import type { Aspect } from '../types';
import { CANVAS_SIZE } from '../types';
import { formatTime } from '../util';
import { FilmIcon, PauseIcon, PlayIcon, SkipBackIcon } from '../icons';

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
              <div className="empty-tile large"><FilmIcon size={34} strokeWidth={1.5} /></div>
              <div className="stage-hint-copy">
                <b>Nothing on the timeline yet</b>
                <span>Import a file on the left, then click + to add it.</span>
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="transport">
        <button className="icon-btn" onClick={onSeekStart} title="Back to start" aria-label="Back to start">
          <SkipBackIcon size={17} />
        </button>
        <button className="icon-btn primary" onClick={onTogglePlay} title={playing ? 'Pause (Space)' : 'Play (Space)'} aria-label={playing ? 'Pause' : 'Play'}>
          {playing ? <PauseIcon size={20} /> : <PlayIcon size={20} style={{ marginLeft: 2 }} />}
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
