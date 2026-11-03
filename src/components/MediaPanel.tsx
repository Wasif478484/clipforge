import type { MediaAsset, MediaKind } from '../types';
import { formatClock } from '../util';

const KIND_ICON: Record<MediaKind, string> = { video: '🎬', audio: '🎵', image: '🖼️' };

interface Props {
  assets: MediaAsset[];
  onImportFiles: (files: FileList | File[]) => void;
  onGenerateSampleVideo: () => void;
  onGenerateSampleImage: () => void;
  onAddToTimeline: (assetId: string) => void;
  generatingSample: boolean;
}

export default function MediaPanel({
  assets,
  onImportFiles,
  onGenerateSampleVideo,
  onGenerateSampleImage,
  onAddToTimeline,
  generatingSample,
}: Props) {
  return (
    <aside className="panel media-panel">
      <div className="panel-section">
        <h2 className="panel-title">Media</h2>
        <label className="import-zone">
          <input
            type="file"
            accept="video/*,audio/*,image/*"
            multiple
            hidden
            onChange={(e) => {
              if (e.target.files?.length) onImportFiles(e.target.files);
              e.target.value = '';
            }}
          />
          <strong>Import media</strong>
          Click to browse or drop files —<br />video, audio, images
        </label>

        <div className="sample-row">
          <button className="btn ghost small" style={{ flex: 1 }} onClick={onGenerateSampleVideo} disabled={generatingSample}>
            {generatingSample ? 'Generating…' : '+ Sample video'}
          </button>
          <button className="btn ghost small" style={{ flex: 1 }} onClick={onGenerateSampleImage} disabled={generatingSample}>
            + Sample image
          </button>
        </div>

        {assets.length > 0 ? (
          <div className="asset-list">
            {assets.map((asset) => (
              <div className="asset" key={asset.id}>
                <div className={`asset-icon ${asset.kind}`} aria-hidden="true">{KIND_ICON[asset.kind]}</div>
                <div className="asset-meta">
                  <div className="asset-name" title={asset.name}>{asset.name}</div>
                  <div className="asset-sub">
                    {asset.kind} · {formatClock(asset.duration)}{asset.width ? ` · ${asset.width}×${asset.height}` : ''}
                  </div>
                </div>
                <button className="add-btn" onClick={() => onAddToTimeline(asset.id)} title="Add to timeline" aria-label={`Add ${asset.name} to timeline`}>
                  +
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="empty-note" style={{ marginTop: 12 }}>
            No media yet. Import your own files or generate a sample — everything is processed locally in your browser.
          </p>
        )}
      </div>

      <div className="legal">
        ClipForge is free and open source (MIT). It is an independent project,
        not affiliated with or endorsed by CapCut or ByteDance.
        All media stays on your device — nothing is uploaded.
      </div>
    </aside>
  );
}
