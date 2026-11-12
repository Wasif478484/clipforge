import { Suspense, lazy, useLayoutEffect, useEffect, useRef, useState } from 'react';
import { animate, stagger } from 'animejs';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import {
  Logo,
  FilmIcon,
  ScissorsIcon,
  ImageIcon,
  DownloadIcon,
  ChevronDownIcon,
  TypeIcon,
} from '../icons';
import initTerminal from './kit/terminal-run';
import './kit/base.css';
import './kit/terminal-run.css';
import './landing.css';
import ErrorBoundary from '../components/ErrorBoundary';

const HeroScene = lazy(() => import('./hero-scene/HeroScene'));

const RELEASES_URL = 'https://github.com/Wasif478484/clipforge/releases/latest';
const REPO_URL = 'https://github.com/Wasif478484/clipforge';

interface Props {
  onLaunchEditor: () => void;
  onOpenProjects: () => void;
}

export default function LandingPage({ onLaunchEditor, onOpenProjects }: Props) {
  const termRef = useRef<HTMLDivElement>(null);
  const [fxPaused, setFxPaused] = useState(false);

  // Hero entrance — anime.js stagger (skipped for reduced-motion users).
  useLayoutEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const targets = [
      '.hero h1', '.hero__lead', '.hero .btn-row', '.hero__proof', '.hero__art',
    ].map((selector) => document.querySelector<HTMLElement>(selector)).filter((el) => el !== null);
    if (targets.length === 0) return;
    targets.forEach((el) => { el.style.opacity = '0'; });
    const handle = animate(targets, {
      opacity: [0, 1],
      translateY: [20, 0],
      duration: 720,
      delay: stagger(90),
      ease: 'out(3)',
    });
    return () => { handle?.pause?.(); targets.forEach((el) => { el.style.opacity = ''; }); };
  }, []);

  // Scroll reveals + closing-footer parallax — GSAP ScrollTrigger.
  useLayoutEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    gsap.registerPlugin(ScrollTrigger);
    const ctx = gsap.context(() => {
      gsap.utils.toArray<HTMLElement>('.section-head, .lede, .tool, .app-frame, .local__text, .local__term, .faq__item, .closing__copy, .closing__action').forEach((el) => {
        gsap.from(el, {
          y: 28, opacity: 0, duration: 0.8, ease: 'power3.out',
          scrollTrigger: { trigger: el, start: 'top 88%', once: true },
        });
      });
      gsap.to('.closing__name', {
        yPercent: 16, ease: 'none',
        scrollTrigger: { trigger: '.closing', start: 'top bottom', end: 'bottom bottom', scrub: true },
      });
    });
    ScrollTrigger.refresh();
    return () => { ctx.revert(); ScrollTrigger.getAll().forEach((t) => t.kill()); };
  }, []);

  useEffect(() => {
    const el = termRef.current;
    if (!el) return undefined;
    const handle = initTerminal(el);
    return () => {
      handle?.destroy?.();
    };
  }, []);

  return (
    <>
      {/* ── Nav ─────────────────────────────────────────────────────────── */}
      <header className="nav landing-nav">
        <div className="wrap landing-nav__bar">
          <a className="landing-logo" href="#top" aria-label="ClipForge — home">
            <Logo size={28} />
            ClipForge
          </a>
          <nav className="landing-nav__links" aria-label="Page">
            <a className="landing-nav__link" href="#editor">Timeline editor</a>
            <a className="landing-nav__link" href="#tools">What's inside</a>
            <a className="landing-nav__link" href="#local">Local export</a>
            <a className="landing-nav__link" href="#faq">Questions</a>
          </nav>
          <button className="landing-nav__workspace" onClick={onLaunchEditor}>Open studio</button>
          <a className="btn landing-nav__cta" href={RELEASES_URL}>Download app</a>
          <details className="landing-mobile">
            <summary aria-label="Menu" title="Menu">
              <ChevronDownIcon size={18} strokeWidth={1.8} />
            </summary>
            <div className="landing-mobile__panel">
              <a href="#editor">Timeline editor</a>
              <a href="#tools">What's inside</a>
              <a href="#local">Local export</a>
              <a href="#faq">Questions</a>
              <a href={REPO_URL}>GitHub</a>
            </div>
          </details>
        </div>
      </header>

      <main className="landing" id="top">
        {/* ── Hero — collage ──────────────────────────────────────────── */}
        <section className="section hero" aria-labelledby="hero-h">
          <Suspense fallback={null}>
            <ErrorBoundary fallback={null}>
              <HeroScene paused={fxPaused} />
            </ErrorBoundary>
          </Suspense>
          <div className="wrap">
            <div className="hero-text grid">
              <div className="hero__text span-6">
                <div className="hero__eyebrow"><span className="hero__eyebrow-dot" /> Local-first creative workspace</div>
                <h1 id="hero-h">Open-source video editor for the browser</h1>
                <p className="hero__lead">
                  A focused workspace for turning raw clips into finished stories. Cut video,
                  retouch images and export WebM or MP4 without sending your media anywhere.
                </p>
                <div className="btn-row">
                  <button className="btn" onClick={onLaunchEditor}>Open the studio <span aria-hidden="true">→</span></button>
                  <a className="btn btn--secondary" href={RELEASES_URL}>Download desktop app</a>
                </div>
                <div className="hero__proof">
                  <span><b>01</b> Import locally</span>
                  <span><b>02</b> Shape the cut</span>
                  <span><b>03</b> Export clean</span>
                </div>
              </div>
              <div className="hero__art span-6 start-7" role="img" aria-label="ClipForge editor window: a timeline with video, text and audio clips, and an export card for export.mp4">
                <div className="d-win" aria-hidden="true">
                  <div className="d-win__bar">
                    <span className="d-dots"><i /><i /><i /></span>
                    <span className="d-win__name">timeline.cut — ClipForge</span>
                  </div>
                  <div className="d-win__body">
                    <div className="d-side">
                      <span className="d-side__item"><FilmIcon size={13} strokeWidth={1.6} /> Media</span>
                      <span className="d-side__item is-on"><FilmIcon size={13} strokeWidth={1.6} /> Timeline</span>
                      <span className="d-side__item"><TypeIcon size={13} strokeWidth={1.6} /> Text</span>
                      <span className="d-side__item"><DownloadIcon size={13} strokeWidth={1.6} /> Export</span>
                      <span className="d-side__label">Recent</span>
                      <span className="d-side__item">intro-cut.mp4</span>
                      <span className="d-side__item">tea-time.cut</span>
                    </div>
                    <div className="d-main">
                      <div className="d-transport">
                        <span className="d-timecode">00:00:12<span>:04</span></span>
                        <span className="d-transport__spacer" />
                        <span className="d-chip d-chip--ok">Local only</span>
                      </div>
                      <div className="d-lanes">
                        <div className="d-playhead" />
                        <div className="d-lane"><span className="d-lane__id">V1</span><span className="d-clip d-clip--video" style={{ left: '17%', width: '24%' }}>intro.mp4</span><span className="d-clip d-clip--video" style={{ left: '47%', width: '18%' }}>broll-03.mp4</span></div>
                        <div className="d-lane"><span className="d-lane__id">T1</span><span className="d-clip d-clip--text" style={{ left: '24%', width: '17%' }}>Morning tea</span></div>
                        <div className="d-lane"><span className="d-lane__id">A1</span><span className="d-clip d-clip--audio" style={{ left: '13%', width: '52%' }}>music-bed.mp3</span></div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="hero__note" aria-hidden="true">
                  <div className="hero__note__row"><h3>export.mp4</h3><span className="d-chip d-chip--ok">Done</span></div>
                  <div className="hero__note__line d-step d-step--1"><span><b>H.264</b> · 1280×720</span></div>
                  <div className="hero__note__line d-step d-step--2"><span><b>8.4 MB</b> · 0 bytes uploaded</span></div>
                  <div className="hero__note__line d-step d-step--3"><span>Finished in 4.1s</span></div>
                  <div className="hero__note__bar" />
                </div>
              </div>
            </div>
          </div>
          <button
            type="button"
            className="hero__pause"
            aria-pressed={fxPaused}
            aria-label={fxPaused ? 'Play background animation' : 'Pause background animation'}
            title={fxPaused ? 'Play background animation' : 'Pause background animation'}
            onClick={() => setFxPaused((v) => !v)}
          >
            {fxPaused ? (
              <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M5 3.5v9l8-4.5z" fill="currentColor" /></svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 3.5h2.5v9H4.5zM9 3.5h2.5v9H9z" fill="currentColor" /></svg>
            )}
          </button>
        </section>

        {/* ── The timeline editor ─────────────────────────────────────── */}
        <section className="section" id="editor" style={{ ['--h' as string]: 1 }} aria-labelledby="editor-h">
          <div className="wrap">
            <div className="section-head">
              <h2 id="editor-h">The timeline editor</h2>
            </div>
            <p className="lede">Trim, split and arrange clips across tracks, overlay text at the playhead, then export — all on this device.</p>
            <div className="app-frame" role="img" aria-label="ClipForge editor window: a 16:9 preview above a timeline with video, text and audio clips" style={{ marginTop: 16 }}>
              <div className="app-frame__bar" aria-hidden="true">
                <span className="d-dots"><i /><i /><i /></span>
                <span className="d-win__name">timeline.cut — ClipForge</span>
                <span className="d-transport__spacer" />
                <span className="d-chip">Autosaved locally</span>
              </div>
              <div className="app-frame__body" aria-hidden="true">
                <div className="preview">
                  <div className="preview__safe" />
                  <div className="preview__kind">16:9</div>
                  <div className="preview__timecode">00:00:12:04</div>
                </div>
                <div className="timeline">
                  <div className="timeline__ruler"><span>00:00</span><span>00:04</span><span>00:08</span><span>00:12</span><span>00:16</span></div>
                  <div className="t-lane">
                    <span className="t-lane__id">V1</span>
                    <span className="t-clip t-clip--video" style={{ left: '13%', width: '22%' }}>intro.mp4</span>
                    <span className="t-clip t-clip--video" style={{ left: '43%', width: '17%' }}>broll-03.mp4</span>
                    <span className="t-playhead" />
                  </div>
                  <div className="t-lane">
                    <span className="t-lane__id">T1</span>
                    <span className="t-clip t-clip--text" style={{ left: '22%', width: '16%' }}>Morning tea</span>
                  </div>
                  <div className="t-lane">
                    <span className="t-lane__id">A1</span>
                    <span className="t-clip t-clip--audio" style={{ left: '9%', width: '55%' }}>music-bed.mp3</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── What's inside ──────────────────────────────────────────── */}
        <section className="section" id="tools" style={{ ['--h' as string]: 1 }} aria-labelledby="tools-h">
          <div className="wrap">
            <div className="section-head">
              <h2 id="tools-h">What's inside ClipForge</h2>
            </div>
            <div className="tools">
              <article className="tool">
                <div className="tool__icon"><ScissorsIcon size={20} strokeWidth={1.7} /></div>
                <h3>Trim and split clips</h3>
                <p>Arrange across tracks; text overlays export with the frame.</p>
                <div className="tool__meta">Ctrl/Cmd+B splits the clip</div>
              </article>
              <article className="tool">
                <div className="tool__icon"><DownloadIcon size={20} strokeWidth={1.7} /></div>
                <h3>Export without uploads</h3>
                <p>WebM out of the box; MP4 via ffmpeg.wasm. Renders never leave this machine.</p>
                <div className="tool__meta">ffmpeg.wasm 0.12 · H.264</div>
              </article>
              <article className="tool">
                <div className="tool__icon"><ImageIcon size={20} strokeWidth={1.7} /></div>
                <h3>Retouch and batch looks</h3>
                <p>Crop, remove backgrounds; one look to many images.</p>
                <div className="tool__meta">PNG · JPEG · WebP · batch</div>
              </article>
              <article className="tool">
                <div className="tool__icon"><FilmIcon size={20} strokeWidth={1.7} /></div>
                <h3>Install on your desktop</h3>
                <p>Windows installer on every release; macOS and Linux builds run in CI.</p>
                <div className="tool__meta">v0.2.0 · MIT licensed</div>
              </article>
            </div>
          </div>
        </section>

        {/* ── Local export ─────────────────────────────────────────────── */}
        <section className="section section--surface" id="local" style={{ ['--h' as string]: 1 }} aria-labelledby="local-h">
          <div className="wrap local">
            <div className="local__text">
              <h2 id="local-h">Local export, no uploads</h2>
              <p className="lede">Imported media is read from disk in this session; recent projects live in IndexedDB on this device, settings in localStorage.</p>
              <p className="lede" style={{ marginTop: 12 }}>No account, no telemetry. The background-removal model downloads once, then runs locally.</p>
            </div>
            <div className="local__term">
              <div className="ui ui-panel ui-term" data-ui="terminal-run" ref={termRef}>
                <div className="ui-term__head">
                  <span className="ui-dots" aria-hidden="true"><i /><i /><i /></span>
                  <span className="ui-term__title">clipforge/export</span>
                  <span className="ui-meta">zsh</span>
                  <span className="ui-spacer" />
                  <span className="ui-chip ui-chip--plain ui-term__branch">v0.2.0</span>
                </div>
                <div className="ui-term__screen" data-term-screen>
                  <div className="ui-term__track" data-term-track>
                    <div className="ui-term__ln ui-term__cmd"><span className="ui-term__cwd">~/<span className="ui-term__up">clipforge/</span>export</span><span className="ui-term__sig">$</span><span className="ui-term__typed" data-term-cmd>ffmpeg -i timeline.cut -c:v libx264 out.mp4</span></div>
                    <div className="ui-term__ln ui-term__meter" data-term-out data-term-meter><span className="ui-term__bar" style={{ ['--p' as string]: 1 }}><i /></span><span className="ui-term__count" data-term-count>3 of 3 stages</span></div>
                    <div className="ui-term__ln ui-term__log" data-term-out data-term-step><svg className="ui-term__tick" viewBox="0 0 16 16" aria-hidden="true"><path d="m3.5 8.4 2.8 2.8 6.2-6.4" /></svg><span className="ui-term__path">timeline.cut</span><span className="ui-term__n">12 clips</span><span className="ui-term__t">0.9s</span></div>
                    <div className="ui-term__ln ui-term__log" data-term-out data-term-step><svg className="ui-term__tick" viewBox="0 0 16 16" aria-hidden="true"><path d="m3.5 8.4 2.8 2.8 6.2-6.4" /></svg><span className="ui-term__path">grade, scale</span><span className="ui-term__n">scale=1280:720</span><span className="ui-term__t">1.6s</span></div>
                    <div className="ui-term__ln ui-term__log" data-term-out data-term-step><svg className="ui-term__tick" viewBox="0 0 16 16" aria-hidden="true"><path d="m3.5 8.4 2.8 2.8 6.2-6.4" /></svg><span className="ui-term__path">out.mp4</span><span className="ui-term__n">H.264 · 8.4 MB</span><span className="ui-term__t">1.5s</span></div>
                    <div className="ui-term__ln ui-term__gap" data-term-out aria-hidden="true" />
                    <div className="ui-term__ln ui-term__sum" data-term-out><span className="ui-term__key">Output</span><span className="ui-term__val">out.mp4</span><span className="ui-term__dim">(8.4 MB)</span></div>
                    <div className="ui-term__ln ui-term__sum" data-term-out><span className="ui-term__key">Uploaded</span><span className="ui-term__val">0 bytes</span><span className="ui-term__dim">(local)</span></div>
                    <div className="ui-term__ln ui-term__done" data-term-out data-term-done><span className="ui-term__ok"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4.5 8.3 2.4 2.4 4.6-5" /></svg></span><b>Done</b><span className="ui-term__dim">in 4.1s</span></div>
                    <div className="ui-term__ln ui-term__cmd" data-term-next><span className="ui-term__cwd">~/<span className="ui-term__up">clipforge/</span>export</span><span className="ui-term__sig">$</span><span className="ui-term__typed"></span><i className="ui-term__caret" aria-hidden="true" /></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Questions ─────────────────────────────────────────────── */}
        <section className="section" id="faq" style={{ ['--h' as string]: 1 }} aria-labelledby="faq-h">
          <div className="wrap">
            <div className="section-head">
              <h2 id="faq-h">Questions</h2>
            </div>
            <dl className="faq">
              <div className="faq__item"><dt className="faq__q">Is ClipForge free?</dt><dd className="faq__a">Yes — free and open source under the MIT license. No paid plan, no account, no usage limit.</dd></div>
              <div className="faq__item"><dt className="faq__q">Where do my files go?</dt><dd className="faq__a">Media is read from disk in this session; recent projects live in IndexedDB on this device.</dd></div>
              <div className="faq__item"><dt className="faq__q">Does it work offline?</dt><dd className="faq__a">The editor works fully offline once loaded. Background removal downloads its wasm once, then runs locally.</dd></div>
              <div className="faq__item"><dt className="faq__q">What can I export?</dt><dd className="faq__a">WebM out of the box, MP4 via ffmpeg.wasm (H.264). Images export as PNG, JPEG or WebP.</dd></div>
              <div className="faq__item"><dt className="faq__q">Which platforms are supported?</dt><dd className="faq__a">Windows via the GitHub installer; macOS and Linux via CI builds on releases; any Chromium browser.</dd></div>
            </dl>
          </div>
        </section>
      </main>

      {/* ── Closing + footer ─────────────────────────────────────────── */}
      <footer className="closing" style={{ ['--h' as string]: 1 }} aria-labelledby="close-h">
        <div className="wrap closing__wrap">
          <div className="closing__cta">
            <div className="closing__copy">
              <h2 id="close-h">ClipForge is free and MIT licensed</h2>
              <p className="lede">Download v0.2.0 for Windows — macOS and Linux builds ship with every release.</p>
            </div>
            <div className="closing__action">
              <a className="btn btn--xl" href={RELEASES_URL}>Download for Windows</a>
            </div>
          </div>
          <div className="closing__name" aria-hidden="true">ClipForge</div>
          <div className="closing__links">
            <div className="closing__cols">
              <div className="closing__brand">
                <a className="landing-logo" href="#top" aria-label="ClipForge — back to top">
                  <Logo size={26} />
                  ClipForge
                </a>
                <p>Open-source video and image editing, on your machine.</p>
              </div>
              <div className="closing__col">
                <h4>Product</h4>
                <ul>
                  <li><a href="#editor">Timeline editor</a></li>
                  <li><a href="#tools">What's inside</a></li>
                  <li><a href="#faq">Questions</a></li>
                </ul>
              </div>
              <div className="closing__col">
                <h4>Project</h4>
                <ul>
                  <li><a href={REPO_URL}>GitHub</a></li>
                  <li><a href={`${REPO_URL}/releases`}>Releases</a></li>
                  <li><a href={`${REPO_URL}/issues`}>Issues</a></li>
                  <li><a href={`${REPO_URL}/blob/main/LICENSE`}>MIT License</a></li>
                </ul>
              </div>
              <div className="closing__col" />
            </div>
            <div className="closing__legal">
              <span>© 2026 ClipForge</span>
              <span>MIT licensed</span>
              <span>Not affiliated with CapCut or ByteDance</span>
              <a href="https://threejs.org" rel="noreferrer">built with three.js (MIT)</a>
              <button className="landing-linkbtn" onClick={onOpenProjects}>Your projects</button>
            </div>
          </div>
        </div>
      </footer>
    </>
  );
}
