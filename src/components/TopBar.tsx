import type { Aspect } from '../types';
import { TypeIcon } from '../icons';
import { Logo } from '../icons';
import { useState } from 'react';
import type { StorageDiagnostics } from '../lib/storage';
import { formatBytes } from '../lib/storage';

interface Props {
  projectName: string;
  onProjectNameChange: (name: string) => void;
  aspect: Aspect;
  onAspectChange: (aspect: Aspect) => void;
  onExport: (quality: ExportQuality, bitrate: number) => void;
  onExportMp4: (quality: ExportQuality, bitrate: number) => void;
  onCancelExport: () => void;
  onAddText: () => void;
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
}

export type ExportQuality = '720p' | '1080p' | '4K';

export default function TopBar({
  projectName,
  onProjectNameChange,
  aspect,
  onAspectChange,
  onExport,
  onExportMp4,
  onCancelExport,
  onAddText,
  onHome,
  onUndo,
  onRedo,
  onSaveProject,
  onSaveToRecent,
  onLoadProject,
  exportProgress,
  mp4Busy,
  canExport,
  defaultExportFormat = 'webm',
  storageStatus,
  onImportCaptions,
  onExportCaptions,
}: Props) {
  const [exportFormat, setExportFormat] = useState<'webm' | 'mp4'>(defaultExportFormat);
  const [quality, setQuality] = useState<ExportQuality>('1080p');
  const [bitrate, setBitrate] = useState(8_000_000);

  const handleExport = () => {
    if (exportFormat === 'mp4') {
      onExportMp4(quality, bitrate);
    } else {
      onExport(quality, bitrate);
    }
  };

  const exporting = exportProgress !== null || mp4Busy;
  const storageLabel = storageStatus?.available
    ? `${storageStatus.isLow ? 'Low storage' : 'Storage'} · ${formatBytes(storageStatus.freeBytes)} free`
    : 'Storage unavailable';

  return (
    <header className="topbar">
      <div className="brand" title="ClipForge - open-source video editor">
        <Logo size={24} />
        Clip<span className="dot">Forge</span>
      </div>

      {onHome && (
        <button className="btn ghost small" onClick={onHome} title="Back to home">
          Home
        </button>
      )}

      {storageStatus && (
        <div
          className={`storage-indicator ${storageStatus.isLow ? 'warning' : ''}`}
          title={storageStatus.isLow
            ? 'Low storage detected. Export and caching may be constrained.'
            : 'Local storage usage is healthy.'}
          aria-live="polite"
        >
          <span className="storage-dot" />
          <span>{storageLabel}</span>
        </div>
      )}

      <div className="toolbar-group">
        {onUndo && <button className="btn ghost small" onClick={onUndo} title="Undo (Ctrl+Z)">Undo</button>}
        {onRedo && <button className="btn ghost small" onClick={onRedo} title="Redo (Ctrl+Shift+Z)">Redo</button>}
      </div>

      {onSaveToRecent && (
        <button className="btn ghost small" onClick={onSaveToRecent} title="Save to recents (local)">
          Save to recents
        </button>
      )}

      {onSaveProject && (
        <button className="btn ghost small" onClick={onSaveProject} title="Save project (.clipforge.json)">
          Save project file
        </button>
      )}
      {onLoadProject && (
        <label className="btn ghost small" title="Load project (.clipforge.json)" style={{ cursor: 'pointer' }}>
          Load
          <input type="file" accept=".clipforge.json,application/json" hidden
            onChange={(e) => { if (e.target.files?.[0]) onLoadProject(e.target.files[0]); e.target.value = ''; }} />
        </label>
      )}
      {onImportCaptions && (
        <label className="btn ghost small" title="Import SRT or VTT captions">
          Captions
          <input type="file" accept=".srt,.vtt,text/vtt,application/x-subrip" hidden
            onChange={(e) => { if (e.target.files?.[0]) onImportCaptions(e.target.files[0]); e.target.value = ''; }} />
        </label>
      )}
      {onExportCaptions && (
        <select className="export-format-select" aria-label="Export captions" defaultValue=""
          onChange={(e) => { if (e.target.value) onExportCaptions(e.target.value as 'srt' | 'vtt'); e.target.value = ''; }}>
          <option value="" disabled>Export captions</option>
          <option value="srt">SRT</option>
          <option value="vtt">VTT</option>
        </select>
      )}

      <input
        className="project-name"
        value={projectName}
        onChange={(e) => onProjectNameChange(e.target.value)}
        aria-label="Project name"
        spellCheck={false}
      />

      <div className="segmented" role="group" aria-label="Aspect ratio">
        {(['16:9', '9:16', '1:1'] as Aspect[]).map((a) => (
          <button key={a} className={aspect === a ? 'active' : ''} onClick={() => onAspectChange(a)}>
            {a}
          </button>
        ))}
      </div>

      <button className="btn ghost small" onClick={onAddText} title="Add a text overlay at the playhead">
        <TypeIcon size={15} />
        Text
      </button>

      <div className="spacer" />

      <select
        className="export-format-select"
        value={exportFormat}
        onChange={(e) => setExportFormat(e.target.value as 'webm' | 'mp4')}
        aria-label="Export format"
        title="Export format"
      >
        <option value="webm">WebM</option>
        <option value="mp4">MP4</option>
      </select>
      <select className="export-format-select" value={quality} onChange={(e) => setQuality(e.target.value as ExportQuality)} aria-label="Export quality">
        <option value="720p">720p</option>
        <option value="1080p">1080p</option>
        <option value="4K">4K</option>
      </select>
      <select className="export-format-select" value={bitrate} onChange={(e) => setBitrate(Number(e.target.value))} aria-label="Export bitrate">
        <option value={2_000_000}>Low bitrate</option>
        <option value={8_000_000}>Medium bitrate</option>
        <option value={16_000_000}>High bitrate</option>
      </select>
      {exporting && <button className="btn danger small" onClick={onCancelExport}>Cancel</button>}
      <button className="btn" onClick={handleExport} disabled={!canExport || exporting}>
        {exporting ? `Exporting... ${Math.round((exportProgress ?? 0) * 100)}%` : 'Export'}
      </button>
    </header>
  );
}
