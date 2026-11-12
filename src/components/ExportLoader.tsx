import { useEffect, useRef } from 'react';
import lottie, { type AnimationItem } from 'lottie-web';

/**
 * Premium gold loader rendered by lottie-web from an inline animation
 * (a champagne arc sweeping around a faint ring). No asset files, no network.
 */
const GOLD_ARC = [0.902, 0.769, 0.463, 1]; // #e6c476
const GOLD_FAINT = [0.902, 0.769, 0.463, 1];

const LOADER_DATA = {
  v: '5.7.4',
  fr: 60,
  ip: 0,
  op: 90,
  w: 48,
  h: 48,
  nm: 'export-loader',
  ddd: 0,
  assets: [] as unknown[],
  layers: [
    {
      ddd: 0,
      ind: 1,
      ty: 4,
      nm: 'arc',
      sr: 1,
      ks: {
        o: { a: 0, k: 100 },
        r: { a: 1, k: [{ t: 0, s: [0] }, { t: 90, s: [360] }] },
        p: { a: 0, k: [24, 24, 0] },
        a: { a: 0, k: [0, 0, 0] },
        s: { a: 0, k: [100, 100, 100] },
      },
      shapes: [
        {
          ty: 'gr',
          nm: 'arc-group',
          it: [
            { ty: 'el', p: { a: 0, k: [0, 0] }, s: { a: 0, k: [34, 34] }, nm: 'ellipse' },
            { ty: 'tm', s: { a: 0, k: 0 }, e: { a: 0, k: 26 }, o: { a: 0, k: 0 }, m: 1, nm: 'trim' },
            { ty: 'st', c: { a: 0, k: GOLD_ARC }, o: { a: 0, k: 100 }, w: { a: 0, k: 4 }, lc: 2, lj: 1, nm: 'stroke' },
            { ty: 'tr', p: { a: 0, k: [0, 0] }, a: { a: 0, k: [0, 0] }, s: { a: 0, k: [100, 100] }, r: { a: 0, k: 0 }, o: { a: 0, k: 100 } },
          ],
        },
      ],
      ip: 0,
      op: 90,
      st: 0,
    },
    {
      ddd: 0,
      ind: 2,
      ty: 4,
      nm: 'ring',
      sr: 1,
      ks: {
        o: { a: 0, k: 18 },
        r: { a: 0, k: 0 },
        p: { a: 0, k: [24, 24, 0] },
        a: { a: 0, k: [0, 0, 0] },
        s: { a: 0, k: [100, 100, 100] },
      },
      shapes: [
        {
          ty: 'gr',
          nm: 'ring-group',
          it: [
            { ty: 'el', p: { a: 0, k: [0, 0] }, s: { a: 0, k: [34, 34] }, nm: 'ellipse' },
            { ty: 'st', c: { a: 0, k: GOLD_FAINT }, o: { a: 0, k: 100 }, w: { a: 0, k: 4 }, lc: 2, lj: 1, nm: 'stroke' },
            { ty: 'tr', p: { a: 0, k: [0, 0] }, a: { a: 0, k: [0, 0] }, s: { a: 0, k: [100, 100] }, r: { a: 0, k: 0 }, o: { a: 0, k: 100 } },
          ],
        },
      ],
      ip: 0,
      op: 90,
      st: 0,
    },
  ],
};

interface Props {
  size?: number;
  className?: string;
}

export default function ExportLoader({ size = 20, className }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const anim: AnimationItem = lottie.loadAnimation({
      container: el,
      renderer: 'svg',
      loop: true,
      autoplay: true,
      animationData: JSON.parse(JSON.stringify(LOADER_DATA)) as object,
    });
    return () => anim.destroy();
  }, []);

  return <div ref={ref} className={className} style={{ width: size, height: size, display: 'inline-block' }} aria-hidden="true" />;
}
