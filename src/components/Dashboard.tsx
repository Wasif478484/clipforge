import { useCallback, useEffect, useState } from 'react';
import {
  BookOpen,
  Clock,
  Download,
  Eraser,
  FileVideo,
  Film,
  FolderOpen,
  Image as ImageIcon,
  LayoutGrid,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
  Settings,
  Info,
} from 'lucide-react';
import {
  clearRecentProjects,
  deleteRecentProject,
  listRecentProjects,
  type RecentProject,
} from '../lib/recent';
import { loadSettings, resetSettings, saveSettings, type ClipForgeSettings } from '../lib/settings';

export interface VideoTemplate {
  id: string;
  name: string;
  desc: string;
  aspect: '16:9' | '9:16' | '1:1';
  accent: string;
}

export const VIDEO_TEMPLATES: VideoTemplate[] = [
  { id: 'cinematic', name: 'Cinematic Vlog', desc: '16:9 · slow fades and muted grade', aspect: '16:9', accent: '#ec4899' },
  { id: 'reel',      name: 'Social Reel',    desc: '9:16 · fast cuts with bold caption', aspect: '9:16', accent: '#3b82f6' },
  { id: 'square',    name: 'Product Grid',   desc: '1:1 · square for social feeds',      aspect: '1:1', accent: '#f59e0b' },
  { id: 'slideshow', name: 'Photo Slideshow',desc: '16:9 · Ken Burns-style motion',      aspect: '16:9', accent: '#22c55e' },
  { id: 'minimal',   name: 'Minimal Dark',   desc: '16:9 · muted, letterboxed look',     aspect: '16:9', accent: '#a855f7' },
  { id: 'vertical',  name: 'Vertical Interview', desc: '9:16 · close-up interview setup', aspect: '9:16', accent: '#14b8a6' },
];

interface Props {
  onNewVideo: () => void;
  onNewImage: () => void;
  onImportVideo: (files: FileList | File[]) => void;
  onImportImage: (files: FileList | File[]) => void;
  onApplyTemplate: (t: VideoTemplate) => void;
  onOpenRecent: (r: RecentProject) => void;
}

const CHANGE_LOG = [
  'Dashboard with recent projects stored locally (thumbnails, rename, delete)',
  'Full project save/load: media, timeline and text overlays',
  'One-click colour grades in the inspector (Cinematic, Noir, Warm, Cool, Neon)',
  'MP4 export via ffmpeg.wasm (H.264 + AAC, local only)',
  'Drag to move with snapping; Ctrl/Cmd+S saves to the dashboard',
];

const timeAgo = (ts: number): string => {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

export default function Dashboard({
  onNewVideo,
  onNewImage,
  onImportVideo,
  onImportImage,
  onApplyTemplate,
  onOpenRecent,
}: Props) {
  const [recents, setRecents] = useState<RecentProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [settings, setSettingsState] = useState<ClipForgeSettings>(() => loadSettings());

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setRecents(await listRecentProjects());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const filtered = query.trim()
    ? recents.filter((r) => (r.name + r.kind).toLowerCase().includes(query.trim().toLowerCase()))
    : recents;

  const stats = {
    total: recents.length,
    video: recents.filter((r) => r.kind === 'video').length,
    image: recents.filter((r) => r.kind === 'image').length,
  };

  const updateSetting = <K extends keyof ClipForgeSettings>(key: K, value: ClipForgeSettings[K]) =>
    setSettingsState(saveSettings({ [key]: value }));

  return (
    <div className="dashboard">
      <div className="dash-orb a" aria-hidden="true" />
      <div className="dash-orb b" aria-hidden="true" />
      <div className="dash-orb c" aria-hidden="true" />

      {/* Sidebar */}
      <aside className="dash-sidebar glass-card">
        <div className="brand">
          <svg width="26" height="26" viewBox="0 0 64 64" aria-hidden="true">
            <rect width="64" height="64" rx="14" fill="#14171c" />
            <path d="M10 24l44-6-2.6 12.4-44 6z" fill="#35e0c0" opacity="0.9" />
            <path d="M10 34h44v14a6 6 0 0 1-6 6H16a6 6 0 0 1-6-6z" fill="#35e0c0" />
            <path d="M15 22l5.4-9M27 20l5.4-9M39 18l5.4-9" stroke="#0d0f12" strokeWidth="3.4" strokeLinecap="round" />
            <path d="M28 40l12 6.2-12 6.2z" fill="#0d0f12" />
          </svg>
          <span className="dash-logo">ClipForge</span>
        </div>

        <nav className="dash-nav">
          <button className="dash-nav-item active" onClick={onNewVideo}><Film size={16} /> Video editor</button>
          <button className="dash-nav-item" onClick={onNewImage}><ImageIcon size={16} /> Image editor</button>
          <a className="dash-nav-item" href="https://github.com/Wasif478484/clipforge/releases/latest" target="_blank" rel="noreferrer"><Download size={16} /> Downloads</a>
          <a className="dash-nav-item" href="https://github.com/Wasif478484/clipforge" target="_blank" rel="noreferrer"><BookOpen size={16} /> Docs & source</a>
        </nav>

        <div className="dash-privacy">
          <ImageIcon size={14} />
          <span>Everything stays on this device — no cloud, no account, no tracking.</span>
        </div>
      </aside>

      {/* Main */}
      <main className="dash-main">
        {/* Top bar */}
        <div className="dash-topbar">
          <div className="reveal reveal-d1">
            <h1 className="dash-title gradient-text">Studio dashboard</h1>
            <p className="dash-sub">Pick up where you left off or start something new.</p>
          </div>
          <div className="dash-actions">
            <label className="dash-search">
              <input
                type="text" value={query} onChange={(e) => setQuery(e.target.value)}
                placeholder="Search projects…" aria-label="Search recent projects" />
            </label>
            <button className="btn ghost small" onClick={onNewVideo}><Film size={14} /> Video</button>
            <button className="btn" onClick={onNewImage}><Plus size={15} /> New image</button>
          </div>
        </div>

        {/* Stats */}
        <div className="dash-stats">
          <div className="dash-stat glass-card"><FileVideo size={18} /><div><b>{stats.video}</b><span>video projects</span></div></div>
          <div className="dash-stat glass-card"><ImageIcon size={18} /><div><b>{stats.image}</b><span>image projects</span></div></div>
          <div className="dash-stat glass-card"><LayoutGrid size={18} /><div><b>{recents.length}</b><span>total in recents</span></div></div>
          <div className="dash-stat glass-card"><Sparkles size={18} /><div><b>{loading ? '…' : 'Ready'}</b><span>local studio</span></div></div>
        </div>

        {/* Create */}
        <section className="dash-section">
          <div className="dash-section-head">
            <div className="dash-section-title"><Plus size={15} /> Create</div>
          </div>
          <div className="create-row">
            <button className="create-card glass-card" onClick={onNewVideo}>
              <FileVideo size={28} />
              <b>Video project</b>
              <span>Multi-track timeline, transitions, filters</span>
            </button>
            <button className="create-card glass-card" onClick={onNewImage}>
              <ImageIcon size={28} />
              <b>Image project</b>
              <span>Crop, retouch, remove backgrounds</span>
            </button>
            <label className="create-card glass-card" style={{ cursor: 'pointer' }}>
              <input type="file" accept="video/*,audio/*,image/*" multiple hidden
                onChange={(e) => { if (e.target.files?.length) onImportVideo(e.target.files); e.target.value = ''; }} />
              <Clock size={28} />
              <b>Import video</b>
              <span>Start a timeline from files</span>
            </label>
            <label className="create-card glass-card" style={{ cursor: 'pointer' }}>
              <input type="file" accept="image/*" multiple hidden
                onChange={(e) => { if (e.target.files?.length) onImportImage(e.target.files); e.target.value = ''; }} />
              <Eraser size={28} />
              <b>Batch edit</b>
              <span>Apply one look to many images</span>
            </label>
          </div>
        </section>

        {/* Recent */}
        <section className="dash-section">
          <div className="dash-section-head">
            <div className="dash-section-title"><FolderOpen size={15} /> Recent projects</div>
            {recents.length > 0 && (
              <button className="btn ghost small" onClick={() => {
                void clearRecentProjects().then(refresh);
              }}><Eraser size={13} /> Clear all</button>
            )}
          </div>
          {loading ? (
            <div className="dash-empty">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="dash-empty big">
              <FileVideo size={28} />
              <p>{query ? 'No projects match that search.' : 'Nothing in recents yet.'}</p>
              <button className="btn" onClick={onNewVideo}><Plus size={15} /> Create your first project</button>
            </div>
          ) : (
            <div className="recent-grid">
              {filtered.map((r) => (
                <div key={r.id} className="recent-card glass-card">
                  {r.thumbnail
                    ? <img className="recent-thumb" src={r.thumbnail} alt={r.name} />
                    : <div className="recent-thumb blank" aria-hidden="true">{r.kind === 'video' ? <FileVideo size={24} /> : <ImageIcon size={24} />}</div>}
                  <div className="recent-body">
                    <div className="recent-name" title={r.name}>{r.name}</div>
                    <div className="recent-meta">{r.kind === 'video' ? 'Video' : 'Image'} · {timeAgo(r.updatedAt)}</div>
                  </div>
                  <div className="recent-actions">
                    <button className="recent-open" onClick={() => onOpenRecent(r)} title="Open"><FolderOpen size={15} /></button>
                    <button className="recent-open danger" onClick={() => setDeleteId(r.id)} title="Delete"><Trash2 size={15} /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {deleteId && (
            <div className="confirm-row">
              <span>Delete this recent project?</span>
              <button className="btn danger small" onClick={() => {
                void deleteRecentProject(deleteId).then(refresh).then(() => setDeleteId(null));
              }}>Delete</button>
              <button className="btn ghost small" onClick={() => setDeleteId(null)}>Keep</button>
            </div>
          )}
        </section>

        {/* Templates */}
        <section className="dash-section">
          <div className="dash-section-head">
            <div className="dash-section-title"><Sparkles size={15} /> Starter templates</div>
          </div>
          <div className="template-grid">
            {VIDEO_TEMPLATES.map((t) => (
              <button key={t.id} className="template-card glass-card" onClick={() => onApplyTemplate(t)}>
                <div className="template-rail" style={{ background: `linear-gradient(135deg, ${t.accent}, #ec4899)` }} />
                <div className="template-name">{t.name}</div>
                <div className="template-desc">{t.desc}</div>
              </button>
            ))}
          </div>
        </section>

        {/* Settings + What's new */}
        <div className="dash-settings-grid">
          <section className="dash-section glass-card reveal reveal-d2">
            <div className="dash-section-head">
              <div className="dash-section-title"><Settings size={15} /> Settings</div>
            </div>
            <label className="field">
              <span>Default canvas aspect</span>
              <select
                value={settings.defaultAspect}
                onChange={(e) => updateSetting('defaultAspect', e.target.value as ClipForgeSettings['defaultAspect'])}
              >
                <option value="16:9">16:9</option>
                <option value="9:16">9:16</option>
                <option value="1:1">1:1</option>
              </select>
            </label>
            <label className="field">
              <span>Default export format</span>
              <select
                value={settings.defaultExportFormat}
                onChange={(e) => updateSetting('defaultExportFormat', e.target.value as ClipForgeSettings['defaultExportFormat'])}
              >
                <option value="webm">WebM (VP9)</option>
                <option value="mp4">MP4 (H.264)</option>
              </select>
            </label>
            <label className="field">
              <span>Thumbnail quality — {Math.round(settings.thumbnailQuality * 100)}%</span>
              <input
                type="range" min={0.3} max={0.85} step={0.05} value={settings.thumbnailQuality}
                onChange={(e) => updateSetting('thumbnailQuality', Number(e.target.value))}
              />
            </label>
            <label className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                checked={settings.showInterfaceHints}
                onChange={(e) => updateSetting('showInterfaceHints', e.target.checked)}
              />
              <span>Show workspace hints</span>
            </label>
            <button className="btn ghost small" onClick={() => setSettingsState(resetSettings())}>
              <RotateCcw size={13} /> Reset to defaults
            </button>
            <p className="dash-note"><Info size={12} /> Stored in this browser only — no account needed.</p>
          </section>

          <section className="dash-section glass-card reveal reveal-d2">
            <div className="dash-section-head">
              <div className="dash-section-title"><Clock size={15} /> What's new</div>
            </div>
            <ul className="changelog">
              {CHANGE_LOG.map((c) => <li key={c}>{c}</li>)}
            </ul>
            <p className="dash-note">Recent projects are stored locally (up to your browser's IndexedDB quota).</p>
          </section>
        </div>

        <div className="dash-foot">
          ClipForge is free and open source (MIT) — independent, not affiliated with CapCut or ByteDance.
        </div>
      </main>
    </div>
  );
}
