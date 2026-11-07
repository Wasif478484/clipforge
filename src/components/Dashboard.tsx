import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import {
  clearRecentProjects,
  deleteRecentProject,
  listRecentProjects,
  type RecentProject,
} from '../lib/recent';
import { loadSettings, resetSettings, saveSettings, type ClipForgeSettings } from '../lib/settings';
import { animate, stagger } from 'animejs';
import {
  FilmIcon,
  ImageIcon,
  DownloadIcon,
  PlusIcon,
  TypeIcon,
  TrashIcon,
  FolderIcon,
  ClockIcon,
  SparklesIcon,
  InfoIcon,
  BookIcon,
  ChevronDownIcon,
  LayoutGridIcon,
  PencilIcon,
  WandIcon,
  Logo,
} from '../icons';
import ErrorBoundary from './ErrorBoundary';

const HeroScene = lazy(() => import('../landing/hero-scene/HeroScene'));

export interface VideoTemplate {
  id: string;
  name: string;
  desc: string;
  aspect: '16:9' | '9:16' | '1:1';
  tag: string;
}

export const VIDEO_TEMPLATES: VideoTemplate[] = [
  { id: 'cinematic', name: 'Cinematic Vlog', desc: '16:9 · slow fades and muted grade', aspect: '16:9', tag: '16:9' },
  { id: 'reel',      name: 'Social Reel',    desc: '9:16 · fast cuts, bold caption', aspect: '9:16', tag: '9:16' },
  { id: 'square',    name: 'Product Grid',   desc: '1:1 · square for social feeds',  aspect: '1:1', tag: '1:1' },
  { id: 'slideshow', name: 'Photo Slideshow',desc: '16:9 · Ken Burns-style motion',  aspect: '16:9', tag: '16:9' },
  { id: 'minimal',   name: 'Minimal Dark',   desc: '16:9 · muted, letterboxed look', aspect: '16:9', tag: '16:9' },
  { id: 'vertical',  name: 'Vertical Interview', desc: '9:16 · face-first framing',  aspect: '9:16', tag: '9:16' },
];

interface Props {
  onNewVideo: () => void;
  onNewImage: () => void;
  onImportVideo: (files: FileList | File[]) => void;
  onImportImage: (files: FileList | File[]) => void;
  onApplyTemplate: (t: VideoTemplate) => void;
  onOpenRecent: (r: RecentProject) => void;
}

const RELEASES = 'https://github.com/Wasif478484/clipforge/releases/latest';
const REPO = 'https://github.com/Wasif478484/clipforge';

const CHANGE_LOG = [
  'Recent projects live locally with frames from your cut',
  'Save / load projects with media intact',
  'Color grades and transitions in the inspector',
  'MP4 export, backups, full-screen mode',
];

const timeAgo = (ts: number): string => {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
};

function Stat({ icon: Icon, n, label }: { icon: typeof FilmIcon; n: number | string; label: string }) {
  return (
    <div className="studio-stat">
      <div className="studio-stat-icon"><Icon size={18} strokeWidth={1.6} /></div>
      <div>
        <div className="studio-stat-n">{n}</div>
        <div className="studio-stat-l">{label}</div>
      </div>
    </div>
  );
}

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
  const heroRef = useRef<HTMLElement | null>(null);
  const [heroVisible, setHeroVisible] = useState(true);

  useEffect(() => {
    const hero = heroRef.current;
    if (!hero || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => setHeroVisible(entry.isIntersecting), { threshold: 0.01 });
    observer.observe(hero);
    return () => observer.disconnect();
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try { setRecents(await listRecentProjects()); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const motion = animate('.studio-reveal', {
      opacity: [0, 1],
      translateY: [18, 0],
      delay: stagger(70),
      duration: 650,
      ease: 'out(3)',
    });
    return () => { motion.revert(); };
  }, []);

  const filtered = query.trim()
    ? recents.filter((r) => (r.name + r.kind).toLowerCase().includes(query.trim().toLowerCase()))
    : recents;

  const stats = {
    video: recents.filter((r) => r.kind === 'video').length,
    image: recents.filter((r) => r.kind === 'image').length,
    total: recents.length,
    ready: loading ? '…' : 'Ready',
  };

  const updateSetting = <K extends keyof ClipForgeSettings>(key: K, value: ClipForgeSettings[K]) =>
    setSettingsState(saveSettings({ [key]: value }));

  return (
    <div className="studio">
      {/* ── Ambient background ─────────────────────────────────────────────── */}
      {/* ── Sidebar ───────────────────────────────────────────────────────── */}
      <aside className="studio-sidebar" aria-label="Navigation">
        <div className="studio-brand">
          <Logo size={30} />
          <div>
            <div className="studio-brand-name">ClipForge</div>
            <div className="studio-brand-tag">Video and photo editor</div>
          </div>
        </div>

        <div className="studio-nav">
          <button className="studio-nav-item is-active" onClick={onNewVideo} aria-current="page">
            <FilmIcon size={16} strokeWidth={1.7} />
            <span>Projects</span>
          </button>
          <button className="studio-nav-item" onClick={onNewImage}>
            <ImageIcon size={16} strokeWidth={1.7} />
            <span>Images</span>
          </button>
          <a className="studio-nav-item" href={RELEASES} target="_blank" rel="noreferrer">
            <DownloadIcon size={16} strokeWidth={1.7} />
            <span>Download</span>
            <span className="studio-nav-hint">v0.2.0</span>
          </a>
          <a className="studio-nav-item" href={REPO} target="_blank" rel="noreferrer">
            <BookIcon size={16} strokeWidth={1.7} />
            <span>GitHub</span>
          </a>
        </div>

        <div className="studio-local-badge" aria-label="Everything stays on your device">
          Files stay on this device.
        </div>
      </aside>

      {/* ── Main ────────────────────────────────────────────────────────── */}
      <main className="studio-main">
        {/* Header row */}
        <header ref={heroRef} className="studio-header" style={{ position: 'relative', overflow: 'hidden' }}>
          <Suspense
            fallback={<div aria-hidden="true" style={{ position: 'absolute', inset: 0, background: 'var(--canvas)' }} />}
          >
            <ErrorBoundary fallback={<div aria-hidden="true" style={{ position: 'absolute', inset: 0, background: 'var(--canvas)' }} />}>
              <HeroScene paused={!heroVisible} />
            </ErrorBoundary>
          </Suspense>
          <div className="studio-hero-row" style={{ position: 'relative', zIndex: 1 }}>
            <div className="studio-hero-copy">
              <h1 className="studio-title">
                Projects
              </h1>
              <p className="studio-sub">
                Edit video and retouch images in your browser. Files stay on this device.
              </p>
            </div>

          </div>

          <div className="studio-commands" style={{ position: 'relative', zIndex: 1 }}>
            <label className="studio-search">
              <FilmIcon size={14} strokeWidth={1.8} />
              <input
                type="text" value={query} onChange={(e) => setQuery(e.target.value)}
                placeholder="Search recent projects…" aria-label="Search recent projects"
              />
            </label>
            <button className="btn ghost small" onClick={onNewVideo}><FilmIcon size={13} /> Video</button>
            <button className="btn" onClick={onNewImage}><PlusIcon size={15} /> New image</button>
          </div>
        </header>

        {/* Stats strip */}
        <div className="studio-stats studio-reveal">
          <Stat icon={FilmIcon} n={stats.video} label="video projects" />
          <Stat icon={ImageIcon} n={stats.image} label="image exports" />
          <Stat icon={LayoutGridIcon} n={stats.total} label="saved projects" />
          <Stat icon={SparklesIcon} n={stats.ready} label="studio ready" />
        </div>

        {/* Create */}
        <section className="studio-section studio-reveal" aria-labelledby="create-title">
          <div className="studio-section-head">
            <h2 id="create-title" className="studio-section-title"><PlusIcon size={13} strokeWidth={2.2} /> Create</h2>
          </div>
          <div className="studio-create-grid">
            <button className="studio-create-card warm" onClick={onNewVideo}>
              <div className="studio-create-icon"><FilmIcon size={22} strokeWidth={1.5} /></div>
              <div className="studio-create-body">
                <b>New video project</b>
                <span>Timeline, tracks, transitions, grades — all in your browser.</span>
              </div>
              <ChevronDownIcon className="studio-create-chev" size={16} strokeWidth={2} />
            </button>
            <button className="studio-create-card cool" onClick={onNewImage}>
              <div className="studio-create-icon"><ImageIcon size={22} strokeWidth={1.5} /></div>
              <div className="studio-create-body">
                <b>New image project</b>
                <span>Crop and retouch, then export.</span>
              </div>
              <ChevronDownIcon className="studio-create-chev" size={16} strokeWidth={2} />
            </button>
            <label className="studio-create-card neutral">
              <input type="file" accept="video/*,audio/*,image/*" multiple hidden
                onChange={(e) => { if (e.target.files?.length) onImportVideo(e.target.files); e.target.value = ''; }} />
              <div className="studio-create-icon"><WandIcon size={22} strokeWidth={1.5} /></div>
              <div className="studio-create-body">
                <b>Import your footage</b>
                <span>Add video, audio or images to a new timeline.</span>
              </div>
              <ChevronDownIcon className="studio-create-chev" size={16} strokeWidth={2} />
            </label>
            <label className="studio-create-card neutral">
              <input type="file" accept="image/*" multiple hidden
                onChange={(e) => { if (e.target.files?.length) onImportImage(e.target.files); e.target.value = ''; }} />
              <div className="studio-create-icon"><ImageIcon size={22} strokeWidth={1.5} /></div>
              <div className="studio-create-body">
                <b>Batch image look</b>
                <span>Apply one look to several images at once.</span>
              </div>
              <ChevronDownIcon className="studio-create-chev" size={16} strokeWidth={2} />
            </label>
          </div>
        </section>

        {/* Recent projects */}
        <section className="studio-section studio-reveal" aria-labelledby="recent-title">
          <div className="studio-section-head">
            <h2 id="recent-title" className="studio-section-title"><ClockIcon size={13} strokeWidth={2} /> Recent projects</h2>
            {recents.length > 0 && (
              <button className="btn ghost small" onClick={() => { void clearRecentProjects().then(refresh); }}>
                <TrashIcon size={13} /> Clear all
              </button>
            )}
          </div>
          {loading ? (
            <div className="studio-empty">Loading your recent projects…</div>
          ) : filtered.length === 0 ? (
            <div className="studio-empty big">
              <div className="studio-empty-icon"><FilmIcon size={24} strokeWidth={1.5} /></div>
              <p className="studio-empty-title">{query ? 'No projects match that search' : 'Nothing in recents yet'}</p>
              <p className="studio-empty-body">{query ? 'Try a different search term.' : 'Create your first project and it will appear here.'}</p>
              <button className="btn" onClick={onNewVideo}><PlusIcon size={15} /> Create your first project</button>
            </div>
          ) : (
            <div className="studio-recent-grid">
              {filtered.map((r) => (
                <div key={r.id} className="studio-recent-card">
                  {r.thumbnail
                    ? <img className="studio-recent-thumb" src={r.thumbnail} alt={r.name} />
                    : <div className="studio-recent-thumb studio-recent-blank" aria-hidden="true">{r.kind === 'video' ? <FilmIcon size={22} /> : <ImageIcon size={22} />}</div>}
                  <div className="studio-recent-body">
                    <div className="studio-recent-name" title={r.name}>{r.name}</div>
                    <div className="studio-recent-meta">{r.kind === 'video' ? 'Video' : 'Image'} · {timeAgo(r.updatedAt)}</div>
                  </div>
                  <div className="studio-recent-actions">
                    <button className="studio-icon-btn" onClick={() => onOpenRecent(r)} aria-label={`Open ${r.name}`} title="Open">
                      <FolderIcon size={16} strokeWidth={1.7} />
                    </button>
                    <button className="studio-icon-btn danger" onClick={() => setDeleteId(r.id)} aria-label={`Delete ${r.name}`} title="Delete">
                      <TrashIcon size={15} strokeWidth={1.7} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {deleteId && (
            <div className="studio-confirm">
              <span className="studio-confirm-text">Delete this recent project?</span>
              <button className="btn danger small" onClick={() => {
                void deleteRecentProject(deleteId).then(refresh).then(() => setDeleteId(null));
              }}>Delete</button>
              <button className="btn ghost small" onClick={() => setDeleteId(null)}>Keep</button>
            </div>
          )}
        </section>

        {/* Templates */}
        <section className="studio-section" aria-labelledby="templates-title">
          <div className="studio-section-head">
            <h2 id="templates-title" className="studio-section-title"><WandIcon size={13} strokeWidth={2} /> Templates</h2>
            <span className="studio-section-tag">Apply to current project</span>
          </div>
          <div className="studio-template-grid">
            {VIDEO_TEMPLATES.map((t) => (
              <button key={t.id} className="studio-template" onClick={() => onApplyTemplate(t)}>
                <div className="studio-template-preview" data-accent={t.id}>
                  <div className="studio-template-letterbox" />
                  <span className="studio-template-tag">{t.tag}</span>
                </div>
                <div className="studio-template-body">
                  <b>{t.name}</b>
                  <span>{t.desc}</span>
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* Settings + update */}
        <div className="studio-bottom-grid">
          <section className="studio-section" aria-labelledby="settings-title">
            <div className="studio-section-head">
              <h2 id="settings-title" className="studio-section-title"><PencilIcon size={13} strokeWidth={2} /> Settings</h2>
            </div>
            <div className="studio-field">
              <label className="studio-field-label" htmlFor="aspect-select">Default aspect</label>
              <select id="aspect-select" className="studio-select"
                value={settings.defaultAspect}
                onChange={(e) => updateSetting('defaultAspect', e.target.value as ClipForgeSettings['defaultAspect'])}>
                <option value="16:9">16:9 landscape</option>
                <option value="9:16">9:16 vertical</option>
                <option value="1:1">1:1 square</option>
              </select>
            </div>
            <div className="studio-field">
              <label className="studio-field-label" htmlFor="export-format">Default export</label>
              <select id="export-format" className="studio-select"
                value={settings.defaultExportFormat}
                onChange={(e) => updateSetting('defaultExportFormat', e.target.value as ClipForgeSettings['defaultExportFormat'])}>
                <option value="webm">WebM (VP9) — smaller</option>
                <option value="mp4">MP4 (H.264) — widest</option>
              </select>
            </div>
            <div className="studio-field">
              <label className="studio-field-label" htmlFor="thumb-quality">Thumbnail quality · {Math.round(settings.thumbnailQuality * 100)}%</label>
              <input id="thumb-quality" type="range" min={0.3} max={0.85} step={0.05} value={settings.thumbnailQuality}
                onChange={(e) => updateSetting('thumbnailQuality', Number(e.target.value))} />
            </div>
            <label className="studio-check">
              <input type="checkbox" checked={settings.showInterfaceHints} onChange={(e) => updateSetting('showInterfaceHints', e.target.checked)} />
              <span>Show keyboard hints in the editor</span>
            </label>
            <button className="btn ghost small" onClick={() => setSettingsState(resetSettings())}>
              <TypeIcon size={13} /> Reset to defaults
            </button>
            <p className="studio-note"><InfoIcon size={12} /> Stored in this browser only — never uploaded.</p>
          </section>

          <section className="studio-section" aria-labelledby="news-title">
            <div className="studio-section-head">
              <h2 id="news-title" className="studio-section-title"><BookIcon size={13} strokeWidth={2} /> What's new</h2>
            </div>
            <ul className="studio-changelog">
              {CHANGE_LOG.map((c) => <li key={c}>{c}</li>)}
            </ul>
            <div className="studio-news-foot">
              <span className="studio-news-kbd"><kbd>Ctrl</kbd>+<kbd>S</kbd></span>
              <span className="studio-news-note">saves a full snapshot to recents</span>
            </div>
            <div className="studio-news-foot">
              <span className="studio-news-kbd"><kbd>Ctrl</kbd>+<kbd>B</kbd></span>
              <span className="studio-news-note">splits the selected clip at the playhead</span>
            </div>
          </section>
        </div>

        <footer className="studio-foot">
          <span>MIT licensed. Not affiliated with CapCut or ByteDance.</span>
          <a href={REPO} target="_blank" rel="noreferrer" className="studio-foot-link">github.com/Wasif478484/clipforge</a>
        </footer>
      </main>
    </div>
  );
}
