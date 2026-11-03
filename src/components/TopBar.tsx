import type { Aspect } from '../types';
import { DownloadIcon, TypeIcon } from '../icons';

interface Props {
  projectName: string;
  onProjectNameChange: (name: string) => void;
  aspect: Aspect;
  onAspectChange: (aspect: Aspect) => void;
  onExport: () => void;
  onAddText: () => void;
  exportProgress: number | null; // null when idle
  canExport: boolean;
}

export default function TopBar({
  projectName,
  onProjectNameChange,
  aspect,
  onAspectChange,
  onExport,
  onAddText,
  exportProgress,
  canExport,
}: Props) {
  const exporting = exportProgress !== null;
  return (
    <header className="topbar">
      <div className="brand" title="ClipForge — open-source video editor">
        <svg width="26" height="26" viewBox="0 0 64 64" aria-hidden="true">
          <rect width="64" height="64" rx="14" fill="#14171c" />
          <path d="M10 24l44-6-2.6 12.4-44 6z" fill="#35e0c0" opacity="0.9" />
          <path d="M10 34h44v14a6 6 0 0 1-6 6H16a6 6 0 0 1-6-6z" fill="#35e0c0" />
          <path d="M15 22l5.4-9M27 20l5.4-9M39 18l5.4-9" stroke="#0d0f12" strokeWidth="3.4" strokeLinecap="round" />
          <path d="M28 40l12 6.2-12 6.2z" fill="#0d0f12" />
        </svg>
        Clip<span className="dot">Forge</span>
      </div>

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

      <a
        className="btn ghost small download-link"
        href="https://github.com/Wasif478484/clipforge/releases/latest"
        target="_blank"
        rel="noreferrer"
        title="Download ClipForge for Windows, macOS and Linux"
      >
        <DownloadIcon size={15} />
        Download
      </a>
      <button className="btn" onClick={onExport} disabled={!canExport || exporting}>
        {!exporting && <DownloadIcon size={16} strokeWidth={2.4} />}
        {exporting ? `Exporting… ${Math.round((exportProgress ?? 0) * 100)}%` : 'Export .webm'}
      </button>
    </header>
  );
}
