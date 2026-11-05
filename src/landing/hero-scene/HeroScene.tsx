import { useEffect, useRef } from 'react';
import { createHeroScene, type HeroSceneHandle } from './scene';

export default function HeroScene({ paused = false }: { paused?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handleRef = useRef<HeroSceneHandle | null>(null);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return undefined;
    const handle = createHeroScene(el);
    handleRef.current = handle;
    return () => {
      handleRef.current = null;
      handle?.dispose();
    };
  }, []);

  useEffect(() => {
    const handle = handleRef.current;
    if (!handle) return;
    if (paused) handle.pause();
    else handle.resume();
  }, [paused]);

  return <canvas ref={canvasRef} className="layer" aria-hidden="true" />;
}
