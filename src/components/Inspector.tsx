import type { Clip, Selection, TextOverlay } from '../types';

interface Props {
  selection: Selection;
  clip: Clip | null;
  text: TextOverlay | null;
  canSplit: boolean;
  onChangeClip: (id: string, patch: Partial<Clip>) => void;
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
  onChangeClip,
  onChangeText,
  onDeleteSelection,
  onSplit,
}: Props) {
  return (
    <aside className="panel inspector">
      <div className="panel-section">
        <h2 className="panel-title">Inspector</h2>

        {!selection && (
          <div className="empty-note">
            <p><b>Nothing selected.</b></p>
            <p>Click a clip on the timeline to edit its trim, volume and fit — or use the shortcuts below:</p>
            <p>
              <span className="kbd">Space</span> play / pause<br />
              <span className="kbd">Delete</span> remove selected<br />
              <span className="kbd">Ctrl</span> + <span className="kbd">B</span> split clip at playhead
            </p>
            <p>Drag clip bodies to move them, drag the edge handles to trim. The red line is the playhead — click the ruler to scrub.</p>
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
            <div className="field-row">
              <button className="btn ghost small" onClick={onSplit} disabled={!canSplit} title="Split at playhead (Ctrl+B)">
                Split
              </button>
              <button className="btn danger small" onClick={onDeleteSelection}>Delete</button>
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
            <button className="btn danger small" onClick={onDeleteSelection}>Delete</button>
          </>
        )}
      </div>
    </aside>
  );
}
