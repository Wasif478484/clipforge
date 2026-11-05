import { useEffect, useRef } from 'react';
import { createHeroScene } from './scene';

export default function HeroScene() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;
    const handle = createHeroScene(el);
    return () => {
      handle?.dispose();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 0,
        overflow: 'hidden',
        background: 'transparent',
        pointerEvents: 'none',
      }}
    />
  );
}
