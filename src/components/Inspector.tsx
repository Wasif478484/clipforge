import type { Clip, Selection, TextOverlay } from '../types';
import { InfoIcon, ScissorsIcon, TrashIcon } from '../icons';
import { DEFAULT_FILTER } from '../types';

interface Props {
  selection: Selection;
  clip: Clip | null;
  text: TextOverlay | null;
  canSplit: boolean;
  showHints: boolean;
  onChangeClip: (id: string, patch: Partial<Clip>) => void;
  onSpeedChange: (clipId: string, speed: number) => void;
  currentTime: number;
  onChangeText: (id: string, patch: Partial<TextOverlay>) => void;
  onDeleteSelection: () => void;
  onSplit: () => void;
}

const num = (v: string, fallback: number): number => {
  const n = Number.parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
};

export default function Inspector({
  selection,
  clip,
  text,
  canSplit,
  showHints,
  onChangeClip,
  onSpeedChange,
  currentTime,
  onChangeText,
  onDeleteSelection,
  onSplit,
}: Props) {
  return (
    <aside className="panel inspector">
      <div className="panel-section">
        <h2 className="panel-title">Inspector</h2>

        {!selection && (
          <div className="empty-state">
            <div className="empty-tile"><InfoIcon size={24} strokeWidth={1.6} /></div>
            <p><b>Nothing selected</b></p>
            <p>Click a clip on the timeline to edit its trim, volume and fit — or use the shortcuts below.</p>
            {showHints && (
              <p className="shortcut-list">
                <span><span className="kbd">Space</span> play / pause</span>
                <span><span className="kbd">Delete</span> remove selected</span>
                <span><span className="kbd">Ctrl</span>+<span className="kbd">B</span> split clip at playhead</span>
                <span><span className="kbd">←</span><span className="kbd">→</span> nudge playhead (ruler focused)</span>
              </p>
            )}
            <p className="muted-note">Drag clip bodies to move them, drag the edge handles to trim. The red line is the playhead — click the ruler to scrub.</p>
          </div>
        )}

        {selection && clip && (
          <>
            <div className="field">
              <label>Clip</label>
              <input type="text" value={clip.name} readOnly title={clip.name} />
            </div>
            <div className="field-row">
              <div className="field">
                <label>Start (s)</label>
                <input type="number" min={0} step={0.1} value={clip.start.toFixed(2)}
                  onChange={(e) => onChangeClip(clip.id, { start: Math.max(0, num(e.target.value, clip.start)) })} />
              </div>
              <div className="field">
                <label>Length (s)</label>
                <input type="number" min={0.1} step={0.1} value={clip.duration.toFixed(2)}
                  onChange={(e) => onChangeClip(clip.id, { duration: Math.max(0.1, num(e.target.value, clip.duration)) })} />
              </div>
            </div>
            <div className="field">
              <label>Volume — {Math.round(clip.volume * 100)}%</label>
              <input type="range" min={0} max={1} step={0.01} value={clip.volume}
                onChange={(e) => onChangeClip(clip.id, { volume: Number(e.target.value) })} />
            </div>
            <div className="field-row">
              <div className="field">
                <label>Fade in (s)</label>
                <input type="number" min={0} max={clip.duration} step={0.1} value={clip.volumeFadeIn.toFixed(1)}
                  onChange={(e) => onChangeClip(clip.id, { volumeFadeIn: Math.max(0, Number(e.target.value)) })} />
              </div>
              <div className="field">
                <label>Fade out (s)</label>
                <input type="number" min={0} max={clip.duration} step={0.1} value={clip.volumeFadeOut.toFixed(1)}
                  onChange={(e) => onChangeClip(clip.id, { volumeFadeOut: Math.max(0, Number(e.target.value)) })} />
              </div>
            </div>
            <div className="field">
              <label>
                <input type="checkbox" checked={clip.muted} onChange={(e) => onChangeClip(clip.id, { muted: e.target.checked })} />{' '}
                Mute this clip
              </label>
            </div>
            <div className="field">
              <label>Frame fit</label>
              <select value={clip.fit} onChange={(e) => onChangeClip(clip.id, { fit: e.target.value as Clip['fit'] })}>
                <option value="cover">Fill frame (crop)</option>
                <option value="contain">Fit inside (letterbox)</option>
              </select>
            </div>
            <div className="field">
              <label>Speed — {clip.speed.toFixed(2)}×</label>
              <input type="range" min={0.25} max={2} step={0.25} value={clip.speed}
                onChange={(e) => onSpeedChange(clip.id, Number(e.target.value))} />
            </div>
            <div className="field-group-title">Keyframes</div>
            <div className="field-row">
              <div className="field">
                <label>Volume at playhead</label>
                <input type="number" min={0} max={1} step={0.05}
                  value={(clip.keyframes?.volume?.find((f) => Math.abs(f.t - (currentTime - clip.start)) < 0.02)?.value ?? clip.volume).toFixed(2)}
                  onChange={(e) => {
                    const t = Math.max(0, Math.min(clip.duration, currentTime - clip.start));
                    const value = Math.max(0, Math.min(1, num(e.target.value, clip.volume)));
                    const frames = [...(clip.keyframes?.volume ?? []).filter((f) => Math.abs(f.t - t) >= 0.02), { t, value }];
                    onChangeClip(clip.id, { keyframes: { ...clip.keyframes, volume: frames } });
                  }} />
              </div>
              <div className="field">
                <label>Opacity at playhead</label>
                <input type="number" min={0} max={1} step={0.05}
                  value={(clip.keyframes?.opacity?.find((f) => Math.abs(f.t - (currentTime - clip.start)) < 0.02)?.value ?? 1).toFixed(2)}
                  onChange={(e) => {
                    const t = Math.max(0, Math.min(clip.duration, currentTime - clip.start));
                    const value = Math.max(0, Math.min(1, num(e.target.value, 1)));
                    const frames = [...(clip.keyframes?.opacity ?? []).filter((f) => Math.abs(f.t - t) >= 0.02), { t, value }];
                    onChangeClip(clip.id, { keyframes: { ...clip.keyframes, opacity: frames } });
                  }} />
              </div>
            </div>
            <div className="field-row">
              <button className="btn small ghost" type="button" onClick={() => {
                const t = Math.max(0, Math.min(clip.duration, currentTime - clip.start));
                onChangeClip(clip.id, {
                  keyframes: {
                    ...clip.keyframes,
                    volume: [...(clip.keyframes?.volume ?? []).filter((f) => Math.abs(f.t - t) >= 0.02), { t, value: clip.volume }],
                    opacity: [...(clip.keyframes?.opacity ?? []).filter((f) => Math.abs(f.t - t) >= 0.02), { t, value: 1 }],
                  },
                });
              }}>Add at playhead</button>
              <button className="btn small ghost" type="button" onClick={() => {
                const t = Math.max(0, Math.min(clip.duration, currentTime - clip.start));
                onChangeClip(clip.id, {
                  keyframes: {
                    ...clip.keyframes,
                    volume: clip.keyframes?.volume?.filter((f) => Math.abs(f.t - t) >= 0.02),
                    opacity: clip.keyframes?.opacity?.filter((f) => Math.abs(f.t - t) >= 0.02),
                  },
                });
              }}>Remove at playhead</button>
            </div>

            <div className="field-group-title">Color correction</div>
            {[
              ['brightness', 'Brightness', 0, 2, 0.01],
              ['contrast', 'Contrast', 0, 2, 0.01],
              ['saturation', 'Saturation', 0, 2, 0.01],
              ['hue', 'Hue', 0, 360, 1],
              ['blur', 'Blur', 0, 20, 0.5],
              ['sepia', 'Sepia', 0, 1, 0.01],
              ['grayscale', 'Grayscale', 0, 1, 0.01],
            ].map(([key, label, min, max, step]) => (
              <div className="field" key={key as string}>
                <label>{label as string} — {(clip.filter[key as keyof Clip['filter']] as number).toFixed(key === 'hue' || key === 'blur' ? 0 : 2)}</label>
                <input
                  type="range"
                  min={min as number}
                  max={max as number}
                  step={step as number}
                  value={clip.filter[key as keyof Clip['filter']] as number}
                  onChange={(e) => onChangeClip(clip.id, { filter: { ...clip.filter, [key as string]: Number(e.target.value) } })}
                />
              </div>
            ))}
            <div className="field">
              <label>Color grade</label>
              <select
                defaultValue="custom"
                onChange={(e) => {
                  const value = e.currentTarget.value;
                  if (value === 'none') onChangeClip(clip.id, { filter: { ...DEFAULT_FILTER } });
                  else if (value === 'cinematic') onChangeClip(clip.id, { filter: { brightness: 0.98, contrast: 1.22, saturation: 0.92, hue: 0, blur: 0, sepia: 0.05, grayscale: 0 } });
                  else if (value === 'noir') onChangeClip(clip.id, { filter: { brightness: 0.95, contrast: 1.25, saturation: 0, hue: 0, blur: 0, sepia: 0, grayscale: 1 } });
                  else if (value === 'warm') onChangeClip(clip.id, { filter: { brightness: 1.06, contrast: 1.06, saturation: 1.08, hue: 20, blur: 0, sepia: 0.12, grayscale: 0 } });
                  else if (value === 'cool') onChangeClip(clip.id, { filter: { brightness: 0.98, contrast: 1.15, saturation: 1.02, hue: -18, blur: 0, sepia: 0, grayscale: 0 } });
                  else if (value === 'neon') onChangeClip(clip.id, { filter: { brightness: 1.01, contrast: 1.28, saturation: 1.45, hue: 0, blur: 0, sepia: 0, grayscale: 0 } });
                  else if (value === 'portrait') onChangeClip(clip.id, { filter: { brightness: 1.03, contrast: 0.98, saturation: 0.92, hue: 0, blur: 0.2, sepia: 0.02, grayscale: 0 } });
                  else if (value === 'fade') onChangeClip(clip.id, { filter: { brightness: 1.06, contrast: 0.88, saturation: 0.75, hue: 0, blur: 0, sepia: 0.15, grayscale: 0 } });
                }}
              >
                <option value="custom">Custom</option>
                <option value="none">None (reset)</option>
                <option value="cinematic">Cinematic</option>
                <option value="noir">Noir</option>
                <option value="warm">Warm film</option>
                <option value="cool">Cool tone</option>
                <option value="neon">Neon</option>
                <option value="portrait">Portrait</option>
                <option value="fade">Faded</option>
              </select>
            </div>
            <button
              className="btn ghost small"
              onClick={() => onChangeClip(clip.id, { filter: { brightness: 1, contrast: 1, saturation: 1, hue: 0, blur: 0, sepia: 0, grayscale: 0 } })}
            >
              Reset filters
            </button>

            <div className="field-group-title">Transitions</div>
            <div className="field-row">
              <div className="field">
                <label>Transition in</label>
                <select value={clip.transitionIn} onChange={(e) => onChangeClip(clip.id, { transitionIn: e.target.value as Clip['transitionIn'] })}>
                  <option value="none">None</option>
                  <option value="fade">Fade</option>
                  <option value="crossfade">Crossfade</option>
                  <option value="slide">Slide</option>
                </select>
              </div>
              <div className="field">
                <label>Transition out</label>
                <select value={clip.transitionOut} onChange={(e) => onChangeClip(clip.id, { transitionOut: e.target.value as Clip['transitionOut'] })}>
                  <option value="none">None</option>
                  <option value="fade">Fade</option>
                </select>
              </div>
            </div>
            <div className="field-row">
              <div className="field">
                <label>Visual fade in (s)</label>
                <input type="number" min={0} max={clip.duration} step={0.1} value={clip.fadeIn.toFixed(1)}
                  onChange={(e) => onChangeClip(clip.id, { fadeIn: Math.max(0, Math.min(clip.duration, Number(e.target.value))) })} />
              </div>
              <div className="field">
                <label>Visual fade out (s)</label>
                <input type="number" min={0} max={clip.duration} step={0.1} value={clip.fadeOut.toFixed(1)}
                  onChange={(e) => onChangeClip(clip.id, { fadeOut: Math.max(0, Math.min(clip.duration, Number(e.target.value))) })} />
              </div>
            </div>

            <div className="field-row">
              <button className="btn ghost small" onClick={onSplit} disabled={!canSplit} title="Split at playhead (Ctrl+B)">
                <ScissorsIcon size={15} />
                Split
              </button>
              <button className="btn danger small" onClick={onDeleteSelection}>
                <TrashIcon size={15} />
                Delete
              </button>
            </div>
          </>
        )}

        {selection && text && (
          <>
            <div className="field">
              <label>Text</label>
              <textarea value={text.text} autoFocus onChange={(e) => onChangeText(text.id, { text: e.target.value })} />
            </div>
            <div className="field-row">
              <div className="field">
                <label>Size</label>
                <input type="number" min={12} max={240} step={2} value={text.size}
                  onChange={(e) => onChangeText(text.id, { size: Math.max(12, num(e.target.value, text.size)) })} />
              </div>
              <div className="field">
                <label>Color</label>
                <div className="color-input">
                  <input type="color" value={text.color} onChange={(e) => onChangeText(text.id, { color: e.target.value })} />
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>{text.color}</span>
                </div>
              </div>
            </div>
            <div className="field">
              <label>Animation</label>
              <select value={text.animation} onChange={(e) => onChangeText(text.id, { animation: e.target.value as TextOverlay['animation'] })}>
                <option value="none">None</option>
                <option value="fade">Fade in/out</option>
                <option value="slide-up">Slide up</option>
                <option value="slide-left">Slide left</option>
                <option value="typewriter">Typewriter</option>
                <option value="pop">Pop</option>
                <option value="bounce">Bounce</option>
                <option value="scale-in">Scale in</option>
                <option value="glitch">Glitch</option>
                <option value="neon-flicker">Neon flicker</option>
                <option value="word-reveal">Word reveal</option>
              </select>
            </div>
            <div className="field">
              <label>Horizontal — {Math.round(text.x * 100)}%</label>
              <input type="range" min={0} max={1} step={0.01} value={text.x} onChange={(e) => onChangeText(text.id, { x: Number(e.target.value) })} />
            </div>
            <div className="field">
              <label>Vertical — {Math.round(text.y * 100)}%</label>
              <input type="range" min={0} max={1} step={0.01} value={text.y} onChange={(e) => onChangeText(text.id, { y: Number(e.target.value) })} />
            </div>
            <div className="field-row">
              <div className="field">
                <label>Start (s)</label>
                <input type="number" min={0} step={0.1} value={text.start.toFixed(2)}
                  onChange={(e) => onChangeText(text.id, { start: Math.max(0, num(e.target.value, text.start)) })} />
              </div>
              <div className="field">
                <label>Length (s)</label>
                <input type="number" min={0.1} step={0.1} value={text.duration.toFixed(2)}
                  onChange={(e) => onChangeText(text.id, { duration: Math.max(0.1, num(e.target.value, text.duration)) })} />
              </div>
            </div>
            <button className="btn danger small" onClick={onDeleteSelection}>
              <TrashIcon size={15} />
              Delete
            </button>
          </>
        )}
      </div>
    </aside>
  );
}
