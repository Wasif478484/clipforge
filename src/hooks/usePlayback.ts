import { useCallback, useEffect, useRef, useState } from 'react';

interface Options {
  duration: number;
  onFrame: (time: number, playing: boolean) => void;
}

export function usePlayback({ duration, onFrame }: Options) {
  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const frameRef = useRef(0);
  const startRef = useRef(0);
  const offsetRef = useRef(0);

  const stop = useCallback(() => {
    cancelAnimationFrame(frameRef.current);
    setPlaying(false);
  }, []);

  const tick = useCallback(function tickFrame() {
    const time = Math.min(offsetRef.current + (performance.now() - startRef.current) / 1000, duration);
    setCurrentTime(time);
    onFrame(time, true);
    if (time >= duration) { stop(); return; }
    frameRef.current = requestAnimationFrame(tickFrame);
  }, [duration, onFrame, stop]);

  const play = useCallback(() => {
    if (duration <= 0) return;
    offsetRef.current = currentTime >= duration ? 0 : currentTime;
    startRef.current = performance.now();
    setPlaying(true);
    cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(tick);
  }, [currentTime, duration, tick]);

  const seek = useCallback((time: number) => {
    const next = Math.max(0, Math.min(duration, time));
    offsetRef.current = next;
    setCurrentTime(next);
    onFrame(next, playing);
  }, [duration, onFrame, playing]);

  useEffect(() => () => cancelAnimationFrame(frameRef.current), []);
  return { currentTime, playing, play, pause: stop, seek };
}
