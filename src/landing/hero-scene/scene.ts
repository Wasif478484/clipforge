import * as THREE from 'three';

// ── Tunables ────────────────────────────────────────────────────────────────
// Particle field for the landing hero background. Emerald on charcoal,
// low opacity — decorative only; headline and CTA stay HTML on top.

export const PARTICLE_COUNT_DESKTOP = 2000;
export const PARTICLE_COUNT_MOBILE = 600;
export const MOBILE_BREAKPOINT_PX = 768;

export const ACCENT = '#3ecf8e'; // matches --accent (design-system/clipforge/pages/landing.md)
export const PARTICLE_OPACITY = 0.55;
export const PARTICLE_SIZE = 0.035; // world units (sizeAttenuation)

export const WAVE_AMPLITUDE = 0.45; // world units
export const WAVE_FREQUENCY = 0.85; // spatial frequency of the base wave
export const WAVE_SECONDARY_RATIO = 2.3; // harmonic multiplier for the ripple
export const WAVE_SECONDARY_SCALE = 0.38; // harmonic amplitude relative to WAVE_AMPLITUDE
export const DRIFT_SPEED = 0.6; // time multiplier for the wave morph
export const PARTICLE_DRIFT = 0.12; // horizontal sway amplitude (world units)

export const POINTER_SENSITIVITY = 0.22; // camera offset from pointer, world units
export const POINTER_LERP = 0.045; // smoothing toward pointer target (0..1)

export const FIELD_WIDTH = 10; // world units spanned by the particle field
export const FIELD_DEPTH = 1.2; // z spread for depth
export const CAMERA_FOV = 45;
export const CAMERA_Z = 6;
export const MAX_DPR = 2;

export interface HeroSceneHandle {
  dispose: () => void;
}

interface ParticleSeed {
  baseX: number;
  z: number;
  phase: number;
  yOffset: number;
}

/**
 * Build the particle waveform scene inside `container`.
 * Returns null when WebGL is unavailable — caller keeps the static background.
 */
export function createHeroScene(container: HTMLElement): HeroSceneHandle | null {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
  } catch {
    return null; // WebGL unavailable — keep static background
  }

  const width = Math.max(1, container.clientWidth);
  const height = Math.max(1, container.clientHeight);

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_DPR));
  renderer.setSize(width, height, false);
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  renderer.domElement.style.display = 'block';
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(CAMERA_FOV, width / height, 0.1, 100);
  camera.position.set(0, 0, CAMERA_Z);
  camera.lookAt(0, 0, 0);

  const isMobile =
    container.clientWidth < MOBILE_BREAKPOINT_PX ||
    window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT_PX - 1}px)`).matches;
  const count = isMobile ? PARTICLE_COUNT_MOBILE : PARTICLE_COUNT_DESKTOP;

  // Procedural seed data — deterministic layout, no external assets
  const seeds: ParticleSeed[] = [];
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    const baseX = (Math.random() - 0.5) * FIELD_WIDTH;
    const z = (Math.random() - 0.5) * FIELD_DEPTH;
    const phase = Math.random() * Math.PI * 2;
    const yOffset = (Math.random() - 0.5) * 0.35;
    seeds.push({ baseX, z, phase, yOffset });
    positions[i * 3] = baseX;
    positions[i * 3 + 1] = yOffset;
    positions[i * 3 + 2] = z;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const material = new THREE.PointsMaterial({
    color: ACCENT,
    size: PARTICLE_SIZE,
    transparent: true,
    opacity: PARTICLE_OPACITY,
    depthWrite: false,
    sizeAttenuation: true,
  });

  const points = new THREE.Points(geometry, material);
  scene.add(points);

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const pointerTarget = { x: 0, y: 0 };
  let animationFrame: number | null = null;
  let isRunning = false;
  let isIntersecting = true;
  const clockStart = performance.now();

  const updatePositions = (t: number) => {
    const attr = geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;
    for (let i = 0; i < seeds.length; i += 1) {
      const seed = seeds[i];
      const wave =
        Math.sin(seed.baseX * WAVE_FREQUENCY + t * DRIFT_SPEED + seed.phase) * WAVE_AMPLITUDE +
        Math.sin(seed.baseX * WAVE_FREQUENCY * WAVE_SECONDARY_RATIO - t * DRIFT_SPEED * 1.6 + seed.phase * 1.7) *
          WAVE_AMPLITUDE * WAVE_SECONDARY_SCALE;
      arr[i * 3] = seed.baseX + Math.sin(t * DRIFT_SPEED * 0.4 + seed.phase) * PARTICLE_DRIFT;
      arr[i * 3 + 1] = wave + seed.yOffset;
    }
    attr.needsUpdate = true;
  };

  const renderFrame = (t: number) => {
    updatePositions(t);
    camera.position.x += (pointerTarget.x - camera.position.x) * POINTER_LERP;
    camera.position.y += (pointerTarget.y - camera.position.y) * POINTER_LERP;
    camera.lookAt(0, 0, 0);
    renderer.render(scene, camera);
  };

  const tick = () => {
    if (!isRunning) return;
    renderFrame((performance.now() - clockStart) / 1000);
    animationFrame = window.requestAnimationFrame(tick);
  };

  const start = () => {
    if (prefersReducedMotion || isRunning) return;
    if (document.hidden || !isIntersecting) return;
    isRunning = true;
    animationFrame = window.requestAnimationFrame(tick);
  };

  const stop = () => {
    isRunning = false;
    if (animationFrame !== null) {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = null;
    }
  };

  // Pause when the hero scrolls off-screen
  const intersectionObserver = new IntersectionObserver(
    (entries) => {
      isIntersecting = entries.some((entry) => entry.isIntersecting);
      if (isIntersecting) start();
      else stop();
    },
    { threshold: 0 },
  );
  intersectionObserver.observe(container);

  // Pause when the tab is hidden
  const onVisibilityChange = () => {
    if (document.hidden) stop();
    else start();
  };
  document.addEventListener('visibilitychange', onVisibilityChange);

  // Pointer parallax — tracked on window so the canvas can be pointer-events:none
  const onPointerMove = (event: PointerEvent) => {
    const rect = container.getBoundingClientRect();
    const insideX = event.clientX >= rect.left && event.clientX <= rect.right;
    const insideY = event.clientY >= rect.top && event.clientY <= rect.bottom;
    if (!insideX || !insideY) {
      pointerTarget.x = 0;
      pointerTarget.y = 0;
      return;
    }
    const nx = ((event.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
    const ny = ((event.clientY - rect.top) / Math.max(1, rect.height)) * 2 - 1;
    pointerTarget.x = nx * POINTER_SENSITIVITY;
    pointerTarget.y = -ny * POINTER_SENSITIVITY * 0.6;
  };
  window.addEventListener('pointermove', onPointerMove, { passive: true });

  // Resize with the container, not only the window
  const resizeObserver = new ResizeObserver(() => {
    const w = Math.max(1, container.clientWidth);
    const h = Math.max(1, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_DPR));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (prefersReducedMotion) renderFrame(0);
  });
  resizeObserver.observe(container);

  if (prefersReducedMotion) {
    // One static frame, no animation loop
    renderFrame(0);
  } else {
    start();
  }

  return {
    dispose: () => {
      stop();
      intersectionObserver.disconnect();
      resizeObserver.disconnect();
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pointermove', onPointerMove);
      scene.remove(points);
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    },
  };
}
