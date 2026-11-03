import type { MediaAsset, MediaKind } from '../types';
import { formatClock } from '../util';
import { FilmIcon, MusicIcon, ImageIcon, PlusIcon, UploadIcon, SparklesIcon, ImagePlusIcon } from '../icons';

const KIND_ICON: Record<MediaKind, typeof FilmIcon> = { video: FilmIcon, audio: MusicIcon, image: ImageIcon };

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
    <aside className="panel media-panel" aria-label="Media browser">
      <div className="panel-section">
        <h2 className="panel-title">
          Media
          {assets.length > 0 && <span className="count-chip">{assets.length}</span>}
        </h2>

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
          <UploadIcon size={22} strokeWidth={1.8} />
          <strong>Import media</strong>
          <span>Click to browse or drop files —<br />video, audio, images</span>
        </label>

        <div className="sample-row">
          <button className="btn ghost small" style={{ flex: 1 }} onClick={onGenerateSampleVideo} disabled={generatingSample}>
            <SparklesIcon size={15} />
            {generatingSample ? 'Generating…' : 'Sample video'}
          </button>
          <button className="btn ghost small" style={{ flex: 1 }} onClick={onGenerateSampleImage} disabled={generatingSample}>
            <ImagePlusIcon size={15} />
            Sample image
          </button>
        </div>

        {assets.length > 0 ? (
          <ul className="asset-list">
            {assets.map((asset) => {
              const KindIcon = KIND_ICON[asset.kind];
              return (
                <li className="asset" key={asset.id}>
                  <div className={`asset-icon ${asset.kind}`} aria-hidden="true">
                    <KindIcon size={19} strokeWidth={1.8} />
                  </div>
                  <div className="asset-meta">
                    <div className="asset-name" title={asset.name}>{asset.name}</div>
                    <div className="asset-sub">
                      {asset.kind} · {formatClock(asset.duration)}{asset.width ? ` · ${asset.width}×${asset.height}` : ''}
                    </div>
                  </div>
                  <button className="add-btn" onClick={() => onAddToTimeline(asset.id)} title="Add to timeline" aria-label={`Add ${asset.name} to timeline`}>
                    <PlusIcon size={16} strokeWidth={2.4} />
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="empty-state">
            <div className="empty-tile"><FilmIcon size={26} strokeWidth={1.6} /></div>
            <p><b>No media yet</b></p>
            <p>Import your own files or generate a sample — everything is processed locally in your browser.</p>
          </div>
        )}
      </div>

      <div className="legal">
        ClipForge is free and open source (MIT). Independent project — not affiliated with or endorsed by CapCut or ByteDance.
        All media stays on your device; nothing is uploaded.
      </div>
    </aside>
  );
}
