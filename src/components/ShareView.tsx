import { useEffect, useState } from 'react';
import { Logo } from '../icons';
import { parseShareHash, sharePublicUrl } from '../lib/share';

/** Public, read-only page for a video someone shared via `#/share/<path>`. */
export default function ShareView() {
  const [path] = useState(() => parseShareHash(window.location.hash));
  const url = sharePublicUrl(path);

  useEffect(() => {
    document.title = path && url ? 'Shared video — ClipForge' : 'Share link — ClipForge';
    return () => { document.title = 'ClipForge'; };
  }, [path, url]);

  if (path && !url) {
    // Well-formed link, but this deployment has no cloud backend to play it.
    return (
      <main className="share-shell">
        <div className="share-card">
          <div className="share-brand"><Logo size={26} />Clip<span className="dot">Forge</span></div>
          <h1 className="share-title">This deployment cannot play shared videos.</h1>
          <p className="share-sub">The link is valid, but this ClipForge has no cloud backend configured. Open it on the deployment that hosts the project.</p>
          <div className="share-actions"><a className="btn" href="/">Open ClipForge</a></div>
        </div>
      </main>
    );
  }

  if (!path || !url) {
    return (
      <main className="share-shell">
        <div className="share-card">
          <div className="share-brand"><Logo size={26} />Clip<span className="dot">Forge</span></div>
          <h1 className="share-title">This share link is not valid.</h1>
          <p className="share-sub">The link may be truncated or from a deployment without share support.</p>
          <div className="share-actions"><a className="btn" href="/">Open ClipForge</a></div>
        </div>
      </main>
    );
  }

  return (
    <main className="share-shell">
      <div className="share-card">
        <div className="share-brand"><Logo size={26} />Clip<span className="dot">Forge</span></div>
        {/* Caption-free <video> on purpose: captions are rendered into the frames themselves. */}
        <video className="share-video" src={url} controls autoPlay playsInline preload="metadata" />
        <h1 className="share-title">Someone shared their ClipForge cut with you.</h1>
        <p className="share-sub">Rendered and published with ClipForge — the open-source, local-first editor. Nothing you do here touches their machine.</p>
        <div className="share-actions">
          <a className="btn ghost" href={url} download>Download MP4</a>
          <a className="btn" href="/">Make your own video</a>
        </div>
      </div>
    </main>
  );
}
