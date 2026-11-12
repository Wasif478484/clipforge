import type { Aspect } from '../types';
import { Logo, TypeIcon } from '../icons';
import { useState } from 'react';
import type { StorageDiagnostics } from '../lib/storage';
import { formatBytes } from '../lib/storage';
import ExportLoader from './ExportLoader';

interface Props {
  projectName: string;
  onProjectNameChange: (name: string) => void;
  aspect: Aspect;
  onAspectChange: (aspect: Aspect) => void;
  onExport: (quality: ExportQuality, bitrate: number) => void;
  onExportMp4: (quality: ExportQuality, bitrate: number) => void;
  onCancelExport: () => void;
  onAddText: () => void;
  onAddSticker?: (emoji: string) => void;
  onHome?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onSaveProject?: () => void;
  onSaveToRecent?: () => void;
  onLoadProject?: (file: File) => void;
  exportProgress: number | null;
  mp4Busy: boolean;
  canExport: boolean;
  defaultExportFormat?: 'webm' | 'mp4';
  storageStatus?: StorageDiagnostics | null;
  onImportCaptions?: (file: File) => void;
  onExportCaptions?: (format: 'srt' | 'vtt') => void;
  saveState?: 'saved' | 'saving' | 'unsaved' | 'failed';
  onCommandPalette?: () => void;
}

export type ExportQuality = '720p' | '1080p' | '4K';

export default function TopBar({
  projectName, onProjectNameChange, aspect, onAspectChange, onExport, onExportMp4,
  onCancelExport, onAddText, onAddSticker, onHome, onUndo, onRedo, onSaveProject, onSaveToRecent,
  onLoadProject, exportProgress, mp4Busy, canExport, defaultExportFormat = 'webm',
  storageStatus, onImportCaptions, onExportCaptions, saveState = 'saved', onCommandPalette,
}: Props) {
  const [exportFormat, setExportFormat] = useState<'webm' | 'mp4'>(defaultExportFormat);
  const [quality, setQuality] = useState<ExportQuality>('1080p');
  const [bitrate, setBitrate] = useState(8_000_000);
  const [showExport, setShowExport] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [showStickers, setShowStickers] = useState(false);
  const exporting = exportProgress !== null || mp4Busy;
  const statusLabel = { saved: 'Saved', saving: 'Saving…', unsaved: 'Unsaved changes', failed: 'Save failed' }[saveState];
  const storageLabel = storageStatus?.available
    ? `${storageStatus.isLow ? 'Low storage' : 'Storage'} · ${formatBytes(storageStatus.freeBytes)} free`
    : 'Storage unavailable';

  const startExport = () => {
    setShowExport(false);
    if (exportFormat === 'mp4') onExportMp4(quality, bitrate);
    else onExport(quality, bitrate);
  };

  return (
    <>
      <header className="topbar">
        <div className="brand" title="ClipForge - open-source video editor"><Logo size={24} />Clip<span className="dot">Forge</span></div>
        {onHome && <button className="btn ghost small" onClick={onHome}>Home</button>}
        <div className="project-group">
          <input className="project-name" value={projectName} onChange={(e) => onProjectNameChange(e.target.value)} aria-label="Project name" spellCheck={false} />
          <span className={`save-state ${saveState}`} role="status"><span className="save-state-dot" />{statusLabel}</span>
        </div>
        <div className="toolbar-group">
          {onUndo && <button className="btn ghost small" onClick={onUndo} title="Undo (Ctrl+Z)">Undo</button>}
          {onRedo && <button className="btn ghost small" onClick={onRedo} title="Redo (Ctrl+Shift+Z)">Redo</button>}
          <button className="btn ghost small" onClick={onAddText}><TypeIcon size={15} />Text</button>
          {onAddSticker && (
            <div className="sticker-wrap">
              <button
                className={`btn ghost small${showStickers ? ' active' : ''}`}
                onClick={() => setShowStickers((value) => !value)}
                aria-expanded={showStickers}
                aria-haspopup="menu"
                title="Add an emoji sticker to the canvas"
              >
                Sticker ▾
              </button>
              {showStickers && (
                <div className="sticker-menu" role="menu">
                  {['😀', '😂', '🥹', '😍', '🤩', '😎', '🥳', '🔥', '⭐', '❤️', '💯', '👍', '🎉', '✨'].map((emoji) => (
                    <button
                      key={emoji}
                      role="menuitem"
                      className="sticker-item"
                      onClick={() => { onAddSticker(emoji); setShowStickers(false); }}
                      title={`Add ${emoji}`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        {storageStatus && <div className={`storage-indicator ${storageStatus.isLow ? 'warning' : ''}`} title={storageLabel}><span className="storage-dot" /><span>{storageLabel}</span></div>}
        <div className="spacer" />
        {onCommandPalette && <button className="btn ghost small command-trigger" onClick={onCommandPalette} title="Open command palette (Ctrl/Cmd+K)">⌘K</button>}
        <div className="segmented" role="group" aria-label="Aspect ratio">
          {(['16:9', '9:16', '1:1'] as Aspect[]).map((a) => <button key={a} className={aspect === a ? 'active' : ''} onClick={() => onAspectChange(a)}>{a}</button>)}
        </div>
        {exporting && <button className="btn danger small" onClick={onCancelExport}>Cancel</button>}
        <button className="btn" onClick={() => setShowExport(true)} disabled={!canExport || exporting}>
          {exporting ? <><ExportLoader size={16} /> {Math.round((exportProgress ?? 0) * 100)}%</> : 'Export'}
        </button>
        <button className="btn ghost small more-button" onClick={() => setShowMore((value) => !value)} aria-expanded={showMore} aria-label="More project actions">•••</button>
        {showMore && (
          <div className="topbar-menu">
            {onSaveProject && <button onClick={onSaveProject}>Save project file</button>}
            {onSaveToRecent && <button onClick={() => void onSaveToRecent()}>Save to recents</button>}
            {onLoadProject && <label>Load project<input type="file" accept=".clipforge.json,application/json" hidden onChange={(e) => { if (e.target.files?.[0]) onLoadProject(e.target.files[0]); e.target.value = ''; }} /></label>}
            {onImportCaptions && <label>Import captions<input type="file" accept=".srt,.vtt,text/vtt,application/x-subrip" hidden onChange={(e) => { if (e.target.files?.[0]) onImportCaptions(e.target.files[0]); e.target.value = ''; }} /></label>}
            {onExportCaptions && <><button onClick={() => onExportCaptions('srt')}>Export SRT</button><button onClick={() => onExportCaptions('vtt')}>Export VTT</button></>}
          </div>
        )}
      </header>
      {showExport && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setShowExport(false); }}>
          <section className="modal export-dialog" role="dialog" aria-modal="true" aria-labelledby="export-title">
            <div className="modal-head"><div><h2 id="export-title">Export video</h2><p>Choose a delivery format for your local render.</p></div><button className="btn ghost small" onClick={() => setShowExport(false)}>Close</button></div>
            <div className="export-grid">
              <label>Format<select value={exportFormat} onChange={(e) => setExportFormat(e.target.value as 'webm' | 'mp4')}><option value="webm">WebM</option><option value="mp4">MP4</option></select></label>
              <label>Resolution<select value={quality} onChange={(e) => setQuality(e.target.value as ExportQuality)}><option value="720p">720p</option><option value="1080p">1080p</option><option value="4K">4K</option></select></label>
              <label>Bitrate<select value={bitrate} onChange={(e) => setBitrate(Number(e.target.value))}><option value={2_000_000}>Low</option><option value={8_000_000}>Medium</option><option value={16_000_000}>High</option></select></label>
              <div className="export-estimate"><strong>{quality} · {aspect}</strong><span>Estimated output depends on duration, motion, and bitrate.</span><span className="muted-note">Export runs locally on this device.</span></div>
            </div>
            <div className="modal-actions"><button className="btn ghost" onClick={() => setShowExport(false)}>Cancel</button><button className="btn" onClick={startExport}>Start export</button></div>
          </section>
        </div>
      )}
    </>
  );
}
