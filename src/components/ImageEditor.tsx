import { useEffect, useRef, useState } from 'react';
import { DownloadIcon, TrashIcon, PlusIcon } from '../icons';
import { downloadBlob, uid } from '../util';

interface Adjustments {
  brightness: number; contrast: number; saturation: number; hue: number;
  temperature: number; exposure: number; sharpness: number; opacity: number; sepia: number;
  levels: { black: number; white: number; gamma: number };
}

const DEFAULT_ADJ: Adjustments = {
  brightness: 1, contrast: 1, saturation: 1, hue: 0, temperature: 0, exposure: 0, sharpness: 0, opacity: 1, sepia: 0,
  levels: { black: 0, white: 255, gamma: 1 },
};

interface Layer {
  id: string;
  name: string;
  visible: boolean;
  opacity: number;
  blendMode: string;
  canvas: HTMLCanvasElement;
  kind: 'base' | 'draw' | 'text' | 'shape';
}

const PRESETS: { name: string; adj: Partial<Adjustments>; filter: string }[] = [
  { name: 'Original', adj: {}, filter: 'none' },
  { name: 'Cinematic', adj: { contrast: 1.15, saturation: 0.9, temperature: -0.1, exposure: -0.05 }, filter: 'none' },
  { name: 'Vintage', adj: { saturation: 0.7, temperature: 0.15, contrast: 0.95, sepia: 0.3 }, filter: 'sepia(0.3)' },
  { name: 'B&W', adj: { saturation: 0 }, filter: 'grayscale(1)' },
  { name: 'Warm', adj: { temperature: 0.2, saturation: 1.1 }, filter: 'none' },
  { name: 'Cool', adj: { temperature: -0.2, saturation: 1.05 }, filter: 'none' },
  { name: 'Vivid', adj: { saturation: 1.35, contrast: 1.1 }, filter: 'none' },
  { name: 'Fade', adj: { contrast: 0.85, brightness: 1.05, saturation: 0.85 }, filter: 'none' },
  { name: 'Dramatic', adj: { contrast: 1.3, saturation: 1.15, exposure: -0.1 }, filter: 'none' },
  { name: 'Soft', adj: { contrast: 0.9, brightness: 1.05, saturation: 0.9 }, filter: 'none' },
];

type Tool = 'select' | 'crop' | 'brush' | 'eraser' | 'text' | 'rect' | 'circle' | 'line' | 'arrow';

interface Props {
  initialImage: string; // object URL or data URL
  initialName?: string;
  onClose: () => void;
  onExportRecent?: (name: string, blob: Blob) => void;
}

export default function ImageEditor({ initialImage, initialName, onClose, onExportRecent }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const levelsCache = useRef<{ key: string; canvas: HTMLCanvasElement } | null>(null);
  const [source, setSource] = useState<HTMLImageElement | null>(null);
  const [sourceName] = useState(initialName ?? 'image');
  const [canvasSize, setCanvasSize] = useState({ w: 800, h: 600 });
  const [adj, setAdj] = useState<Adjustments>({ ...DEFAULT_ADJ });
  const [preset, setPreset] = useState('Original');
  const [tool, setTool] = useState<Tool>('select');
  const [brushColor, setBrushColor] = useState('#ffffff');
  const [brushSize, setBrushSize] = useState(12);
  const [brushOpacity, setBrushOpacity] = useState(1);
  const [textValue, setTextValue] = useState('Text');
  const [textSize, setTextSize] = useState(48);
  const [textColor, setTextColor] = useState('#ffffff');
  const [shapeStroke, setShapeStroke] = useState('#ffffff');
  const [shapeFill, setShapeFill] = useState('transparent');
  const [shapeWidth, setShapeWidth] = useState(3);
  const [layers, setLayers] = useState<Layer[]>([]);
  const [activeLayer, setActiveLayer] = useState<string | null>(null);
  const [cropRect, setCropRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [lastPt, setLastPt] = useState<{ x: number; y: number } | null>(null);
  const [shapeStart, setShapeStart] = useState<{ x: number; y: number } | null>(null);
  const [bgRemoving, setBgRemoving] = useState(false);
  const [exportFmt, setExportFmt] = useState<'png' | 'jpeg' | 'webp'>('png');
  const [exportQuality, setExportQuality] = useState(0.92);
  const [batchFiles, setBatchFiles] = useState<File[]>([]);
  const [batchRunning, setBatchRunning] = useState(false);

  // Load source image.
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      setSource(img);
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      setCanvasSize({ w, h });
      // base layer
      const base = document.createElement('canvas');
      base.width = w; base.height = h;
      const ctx = base.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const layer: Layer = { id: uid(), name: 'Background', visible: true, opacity: 1, blendMode: 'source-over', canvas: base, kind: 'base' };
      setLayers([layer]);
      setActiveLayer(layer.id);
    };
    img.src = initialImage;
  }, [initialImage]);

  // Render composite.
  const render = () => {
    const canvas = canvasRef.current;
    if (!canvas || !source) return;
    const { w, h } = canvasSize;
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, w, h);

    // Base image with adjustments + filter.
    const baseLayer = layers.find((l) => l.kind === 'base' && l.visible);
    if (baseLayer) {
      // Levels (cached LUT) — applied before the CSS-filter chain.
      let baseSrc: HTMLCanvasElement = baseLayer.canvas;
      const { black, white, gamma } = adj.levels;
      if (black !== 0 || white !== 255 || gamma !== 1) {
        const key = `${baseLayer.canvas.width}x${baseLayer.canvas.height}:${black},${white},${gamma}`;
        if (!levelsCache.current || levelsCache.current.key !== key) {
          const c = document.createElement('canvas');
          c.width = baseLayer.canvas.width; c.height = baseLayer.canvas.height;
          const cctx = c.getContext('2d')!;
          cctx.drawImage(baseLayer.canvas, 0, 0);
          const imgData = cctx.getImageData(0, 0, c.width, c.height);
          const range = Math.max(1, white - black);
          const lut = new Uint8Array(256);
          for (let i = 0; i < 256; i++) {
            let v = (i - black) / range;
            v = Math.max(0, Math.min(1, v));
            v = Math.pow(v, 1 / Math.max(0.01, gamma));
            lut[i] = Math.round(v * 255);
          }
          for (let i = 0; i < imgData.data.length; i += 4) {
            imgData.data[i] = lut[imgData.data[i]];
            imgData.data[i + 1] = lut[imgData.data[i + 1]];
            imgData.data[i + 2] = lut[imgData.data[i + 2]];
          }
          cctx.putImageData(imgData, 0, 0);
          levelsCache.current = { key, canvas: c };
        }
        baseSrc = levelsCache.current!.canvas;
      }
      ctx.save();
      ctx.globalAlpha = baseLayer.opacity * adj.opacity;
      const filt = [
        `brightness(${adj.brightness})`,
        `contrast(${adj.contrast})`,
        `saturate(${adj.saturation})`,
        `hue-rotate(${adj.hue}deg)`,
        adj.temperature !== 0 ? `sepia(${Math.abs(adj.temperature) * 0.4})` : '',
        adj.exposure !== 0 ? `brightness(${1 + adj.exposure})` : '',
        adj.sharpness > 0 ? `contrast(${1 + adj.sharpness * 0.3})` : '',
      ].filter(Boolean).join(' ');
      ctx.filter = filt || 'none';
      ctx.drawImage(baseSrc, 0, 0);
      ctx.filter = 'none';
      ctx.restore();
    }

    // Drawing layers.
    for (const layer of layers) {
      if (layer.kind === 'base' || !layer.visible) continue;
      ctx.save();
      ctx.globalAlpha = layer.opacity;
      ctx.globalCompositeOperation = (layer.blendMode as GlobalCompositeOperation) || 'source-over';
      ctx.drawImage(layer.canvas, 0, 0);
      ctx.restore();
    }

    // Crop overlay.
    if (tool === 'crop' && cropRect) {
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(0, 0, w, h);
      ctx.clearRect(cropRect.x, cropRect.y, cropRect.w, cropRect.h);
      ctx.strokeStyle = '#ec4899';
      ctx.lineWidth = 2;
      ctx.strokeRect(cropRect.x, cropRect.y, cropRect.w, cropRect.h);
      // rule of thirds
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 1;
      for (let i = 1; i < 3; i++) {
        ctx.beginPath(); ctx.moveTo(cropRect.x + (cropRect.w * i) / 3, cropRect.y); ctx.lineTo(cropRect.x + (cropRect.w * i) / 3, cropRect.y + cropRect.h); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cropRect.x, cropRect.y + (cropRect.h * i) / 3); ctx.lineTo(cropRect.x + cropRect.w, cropRect.y + (cropRect.h * i) / 3); ctx.stroke();
      }
      ctx.restore();
    }
  };

  useEffect(() => { render(); });

  // ---- helpers ----
  const getCanvasPoint = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const sx = canvas.width / rect.width;
    const sy = canvas.height / rect.height;
    return { x: (e.clientX - rect.left) * sx, y: (e.clientY - rect.top) * sy };
  };

  const pushHistory = () => {};

  // ---- tool handlers ----
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const pt = getCanvasPoint(e);
    if (tool === 'crop') {
      setCropRect({ x: pt.x, y: pt.y, w: 0, h: 0 });
      setDrawing(true);
      return;
    }
    if (tool === 'brush' || tool === 'eraser') {
      const layer = layers.find((l) => l.kind === 'draw' && l.id === activeLayer);
      const target = layer ?? layers.find((l) => l.kind === 'draw');
      if (!target) {
        const newLayer: Layer = { id: uid(), name: `Layer ${layers.length + 1}`, visible: true, opacity: 1, blendMode: 'source-over', canvas: document.createElement('canvas'), kind: 'draw' };
        newLayer.canvas.width = canvasSize.w; newLayer.canvas.height = canvasSize.h;
        setLayers((ls) => [...ls, newLayer]);
        setActiveLayer(newLayer.id);
        const ctx = newLayer.canvas.getContext('2d')!;
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over';
        ctx.strokeStyle = brushColor; ctx.lineWidth = brushSize; ctx.globalAlpha = brushOpacity;
        ctx.beginPath(); ctx.moveTo(pt.x, pt.y);
        setLastPt(pt);
        setDrawing(true);
        return;
      }
      const ctx = target.canvas.getContext('2d')!;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over';
      ctx.strokeStyle = brushColor; ctx.lineWidth = brushSize; ctx.globalAlpha = brushOpacity;
      ctx.beginPath(); ctx.moveTo(pt.x, pt.y);
      setLastPt(pt);
      setDrawing(true);
      return;
    }
    if (tool === 'text') {
      const layer = document.createElement('canvas');
      layer.width = canvasSize.w; layer.height = canvasSize.h;
      const ctx = layer.getContext('2d')!;
      ctx.font = `700 ${textSize}px Inter, system-ui, sans-serif`;
      ctx.fillStyle = textColor;
      ctx.textBaseline = 'top';
      ctx.fillText(textValue, pt.x, pt.y);
      const newLayer: Layer = { id: uid(), name: `Text: ${textValue.slice(0, 12)}`, visible: true, opacity: 1, blendMode: 'source-over', canvas: layer, kind: 'text' };
      setLayers((ls) => [...ls, newLayer]);
      setActiveLayer(newLayer.id);
      pushHistory();
      return;
    }
    if (tool === 'rect' || tool === 'circle' || tool === 'line' || tool === 'arrow') {
      setShapeStart(pt);
      setDrawing(true);
      return;
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!drawing) return;
    const pt = getCanvasPoint(e);
    if (tool === 'crop' && cropRect) {
      setCropRect({ x: cropRect.x, y: cropRect.y, w: pt.x - cropRect.x, h: pt.y - cropRect.y });
      return;
    }
    if (tool === 'brush' || tool === 'eraser') {
      const target = layers.find((l) => l.kind === 'draw' && l.id === activeLayer) ?? layers.filter((l) => l.kind === 'draw').pop();
      if (!target || !lastPt) return;
      const ctx = target.canvas.getContext('2d')!;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over';
      ctx.strokeStyle = brushColor; ctx.lineWidth = brushSize; ctx.globalAlpha = brushOpacity;
      ctx.beginPath(); ctx.moveTo(lastPt.x, lastPt.y); ctx.lineTo(pt.x, pt.y); ctx.stroke();
      setLastPt(pt);
      // force re-render
      setLayers((ls) => [...ls]);
      return;
    }
    if ((tool === 'rect' || tool === 'circle' || tool === 'line' || tool === 'arrow') && shapeStart) {
      // preview by re-rendering with a temp overlay — store in cropRect-like temp
      setCropRect({ x: shapeStart.x, y: shapeStart.y, w: pt.x - shapeStart.x, h: pt.y - shapeStart.y });
      return;
    }
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!drawing) return;
    setDrawing(false);
    const pt = getCanvasPoint(e);
    if (tool === 'crop') {
      // normalize rect
      if (cropRect) {
        const r = { ...cropRect };
        if (r.w < 0) { r.x += r.w; r.w = -r.w; }
        if (r.h < 0) { r.y += r.h; r.h = -r.h; }
        if (r.w > 5 && r.h > 5) setCropRect(r);
        else setCropRect(null);
      }
      return;
    }
    if (tool === 'brush' || tool === 'eraser') {
      setLastPt(null);
      pushHistory();
      return;
    }
    if ((tool === 'rect' || tool === 'circle' || tool === 'line' || tool === 'arrow') && shapeStart) {
      const layer = document.createElement('canvas');
      layer.width = canvasSize.w; layer.height = canvasSize.h;
      const ctx = layer.getContext('2d')!;
      const x = Math.min(shapeStart.x, pt.x);
      const y = Math.min(shapeStart.y, pt.y);
      const w = Math.abs(pt.x - shapeStart.x);
      const h = Math.abs(pt.y - shapeStart.y);
      ctx.strokeStyle = shapeStroke; ctx.lineWidth = shapeWidth; ctx.fillStyle = shapeFill;
      if (tool === 'rect') {
        if (shapeFill !== 'transparent') ctx.fillRect(x, y, w, h);
        ctx.strokeRect(x, y, w, h);
      } else if (tool === 'circle') {
        ctx.beginPath(); ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
        if (shapeFill !== 'transparent') ctx.fill();
        ctx.stroke();
      } else if (tool === 'line') {
        ctx.beginPath(); ctx.moveTo(shapeStart.x, shapeStart.y); ctx.lineTo(pt.x, pt.y); ctx.stroke();
      } else if (tool === 'arrow') {
        ctx.beginPath(); ctx.moveTo(shapeStart.x, shapeStart.y); ctx.lineTo(pt.x, pt.y); ctx.stroke();
        // arrowhead
        const ang = Math.atan2(pt.y - shapeStart.y, pt.x - shapeStart.x);
        const ah = 14;
        ctx.beginPath();
        ctx.moveTo(pt.x, pt.y);
        ctx.lineTo(pt.x - ah * Math.cos(ang - Math.PI / 6), pt.y - ah * Math.sin(ang - Math.PI / 6));
        ctx.moveTo(pt.x, pt.y);
        ctx.lineTo(pt.x - ah * Math.cos(ang + Math.PI / 6), pt.y - ah * Math.sin(ang + Math.PI / 6));
        ctx.stroke();
      }
      const newLayer: Layer = { id: uid(), name: `${tool} shape`, visible: true, opacity: 1, blendMode: 'source-over', canvas: layer, kind: 'shape' };
      setLayers((ls) => [...ls, newLayer]);
      setActiveLayer(newLayer.id);
      setCropRect(null);
      setShapeStart(null);
      pushHistory();
    }
  };

  const applyCrop = () => {
    if (!cropRect || !source) return;
    const r = { ...cropRect };
    if (r.w < 0) { r.x += r.w; r.w = -r.w; }
    if (r.h < 0) { r.y += r.h; r.h = -r.h; }
    if (r.w < 5 || r.h < 5) return;
    // crop the base layer canvas
    const base = layers.find((l) => l.kind === 'base');
    if (!base) return;
    const newCanvas = document.createElement('canvas');
    newCanvas.width = Math.round(r.w);
    newCanvas.height = Math.round(r.h);
    const ctx = newCanvas.getContext('2d')!;
    ctx.drawImage(base.canvas, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
    // also crop draw layers
    const newLayers = layers.map((l) => {
      if (l.kind === 'base') return { ...l, canvas: newCanvas };
      const c = document.createElement('canvas');
      c.width = newCanvas.width; c.height = newCanvas.height;
      const cctx = c.getContext('2d')!;
      cctx.drawImage(l.canvas, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
      return { ...l, canvas: c };
    });
    setLayers(newLayers);
    setCanvasSize({ w: newCanvas.width, h: newCanvas.height });
    setCropRect(null);
    setTool('select');
    pushHistory();
  };

  const rotate = (deg: number) => {
    const rad = (deg * Math.PI) / 180;
    const newW = deg % 180 === 0 ? canvasSize.w : canvasSize.h;
    const newH = deg % 180 === 0 ? canvasSize.h : canvasSize.w;
    const newLayers = layers.map((l) => {
      const c = document.createElement('canvas');
      c.width = newW; c.height = newH;
      const ctx = c.getContext('2d')!;
      ctx.translate(newW / 2, newH / 2);
      ctx.rotate(rad);
      ctx.drawImage(l.canvas, -canvasSize.w / 2, -canvasSize.h / 2);
      return { ...l, canvas: c };
    });
    setLayers(newLayers);
    setCanvasSize({ w: newW, h: newH });
    pushHistory();
  };

  const flip = (axis: 'h' | 'v') => {
    const newLayers = layers.map((l) => {
      const c = document.createElement('canvas');
      c.width = canvasSize.w; c.height = canvasSize.h;
      const ctx = c.getContext('2d')!;
      if (axis === 'h') { ctx.translate(canvasSize.w, 0); ctx.scale(-1, 1); }
      else { ctx.translate(0, canvasSize.h); ctx.scale(1, -1); }
      ctx.drawImage(l.canvas, 0, 0);
      return { ...l, canvas: c };
    });
    setLayers(newLayers);
    pushHistory();
  };

  const resize = (newW: number, newH: number) => {
    if (newW < 1 || newH < 1) return;
    const newLayers = layers.map((l) => {
      const c = document.createElement('canvas');
      c.width = newW; c.height = newH;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(l.canvas, 0, 0, newW, newH);
      return { ...l, canvas: c };
    });
    setLayers(newLayers);
    setCanvasSize({ w: newW, h: newH });
    pushHistory();
  };

  const applyPreset = (name: string) => {
    const p = PRESETS.find((x) => x.name === name);
    if (!p) return;
    setPreset(name);
    setAdj((a) => ({ ...a, ...p.adj }));
  };

  const applyAdjustment = (key: keyof Adjustments, value: number) => {
    setAdj((a) => ({ ...a, [key]: value }));
  };

  const removeBackground = async () => {
    if (!source) return;
    setBgRemoving(true);
    try {
      const { ImageSegmenter, FilesetResolver } = await import('@mediapipe/tasks-vision');
      const vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm',
      );
      const segmenter = await ImageSegmenter.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite',
          delegate: 'GPU',
        },
        runningMode: 'IMAGE',
        outputCategoryMask: true,
      });
      const result = segmenter.segment(source);
      const mask = result.categoryMask;
      if (!mask) throw new Error('No mask returned');
      // Apply mask to base layer.
      const base = layers.find((l) => l.kind === 'base');
      if (!base) return;
      const w = base.canvas.width, h = base.canvas.height;
      const ctx = base.canvas.getContext('2d')!;
      const imgData = ctx.getImageData(0, 0, w, h);
      const maskData = mask.getAsFloat32Array ? mask.getAsFloat32Array() : null;
      // Fallback: use category mask as Uint8Array.
      const categories = mask.getAsUint8Array ? mask.getAsUint8Array() : null;
      for (let i = 0; i < w * h; i++) {
        let isSubject = true;
        if (categories) isSubject = categories[i] === 1; // 1 = person
        else if (maskData) isSubject = maskData[i] > 0.5;
        if (!isSubject) imgData.data[i * 4 + 3] = 0;
      }
      ctx.putImageData(imgData, 0, 0);
      setLayers((ls) => [...ls]);
      pushHistory();
      segmenter.close();
    } catch (err) {
      console.error(err);
      alert('Background removal failed. Check console for details.');
    } finally {
      setBgRemoving(false);
    }
  };


  const exportImage = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const mime = exportFmt === 'png' ? 'image/png' : exportFmt === 'jpeg' ? 'image/jpeg' : 'image/webp';
    canvas.toBlob((blob) => {
      if (!blob) return;
      const base = sourceName.replace(/\.[^.]+$/, '') || 'clipforge';
      downloadBlob(blob, `${base}.${exportFmt}`);
      onExportRecent?.(base, blob);
    }, mime, exportQuality);
  };

  const handleBatchFiles = (files: FileList | File[]) => {
    setBatchFiles(Array.from(files));
  };

  const runBatch = async () => {
    if (batchFiles.length === 0) return;
    setBatchRunning(true);
    for (const file of batchFiles) {
      const url = URL.createObjectURL(file);
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = reject;
        i.src = url;
      });
      // Apply same edits to a temp canvas.
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const ctx = c.getContext('2d')!;
      const filt = [
        `brightness(${adj.brightness})`, `contrast(${adj.contrast})`, `saturate(${adj.saturation})`,
        `hue-rotate(${adj.hue}deg)`,
        adj.temperature !== 0 ? `sepia(${Math.abs(adj.temperature) * 0.4})` : '',
        adj.exposure !== 0 ? `brightness(${1 + adj.exposure})` : '',
      ].filter(Boolean).join(' ');
      ctx.filter = filt || 'none';
      ctx.drawImage(img, 0, 0);
      ctx.filter = 'none';
      // Draw annotation layers scaled.
      for (const layer of layers) {
        if (layer.kind === 'base' || !layer.visible) continue;
        ctx.save(); ctx.globalAlpha = layer.opacity;
        ctx.drawImage(layer.canvas, 0, 0, c.width, c.height);
        ctx.restore();
      }
      const mime = exportFmt === 'png' ? 'image/png' : exportFmt === 'jpeg' ? 'image/jpeg' : 'image/webp';
      const blob = await new Promise<Blob | null>((resolve) => c.toBlob(resolve, mime, exportQuality));
      if (blob) downloadBlob(blob, `${file.name.replace(/\.[^.]+$/, '')}_edited.${exportFmt}`);
      URL.revokeObjectURL(url);
      await new Promise((r) => setTimeout(r, 300)); // pace downloads
    }
    setBatchRunning(false);
  };

  const addLayer = () => {
    const c = document.createElement('canvas');
    c.width = canvasSize.w; c.height = canvasSize.h;
    const layer: Layer = { id: uid(), name: `Layer ${layers.length + 1}`, visible: true, opacity: 1, blendMode: 'source-over', canvas: c, kind: 'draw' };
    setLayers((ls) => [...ls, layer]);
    setActiveLayer(layer.id);
  };

  const removeLayer = (id: string) => {
    setLayers((ls) => ls.filter((l) => l.id !== id));
    if (activeLayer === id) setActiveLayer(null);
  };

  const toggleLayer = (id: string) => {
    setLayers((ls) => ls.map((l) => (l.id === id ? { ...l, visible: !l.visible } : l)));
  };

  const setLayerOpacity = (id: string, opacity: number) => {
    setLayers((ls) => ls.map((l) => (l.id === id ? { ...l, opacity } : l)));
  };

  const moveLayer = (id: string, dir: -1 | 1) => {
    setLayers((ls) => {
      const idx = ls.findIndex((l) => l.id === id);
      if (idx < 0) return ls;
      const newIdx = idx + dir;
      if (newIdx < 0 || newIdx >= ls.length) return ls;
      const arr = [...ls];
      [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
      return arr;
    });
  };

  if (!source) {
    return (
      <div className="img-editor">
        <div className="img-loading">Loading image…</div>
      </div>
    );
  }

  return (
    <div className="img-editor">
      <div className="img-topbar">
        <button className="btn ghost small" onClick={onClose}>← Back</button>
        <div className="img-title">{sourceName} · {canvasSize.w}×{canvasSize.h}</div>
        <div className="img-tools">
          {(['select', 'crop', 'brush', 'eraser', 'text', 'rect', 'circle', 'line', 'arrow'] as Tool[]).map((t) => (
            <button key={t} className={`icon-btn ${tool === t ? 'active' : ''}`} onClick={() => setTool(t)} title={t}>
              {t === 'select' && '↖'}
              {t === 'crop' && '✂'}
              {t === 'brush' && '🖌'}
              {t === 'eraser' && '⌫'}
              {t === 'text' && 'T'}
              {t === 'rect' && '▭'}
              {t === 'circle' && '○'}
              {t === 'line' && '╱'}
              {t === 'arrow' && '→'}
            </button>
          ))}
        </div>
        <div className="spacer" />
        <button className="btn ghost small" onClick={removeBackground} disabled={bgRemoving}>
          {bgRemoving ? 'Removing…' : 'Remove BG'}
        </button>
        <select className="fmt-select" value={exportFmt} onChange={(e) => setExportFmt(e.target.value as 'png' | 'jpeg' | 'webp')}>
          <option value="png">PNG</option>
          <option value="jpeg">JPEG</option>
          <option value="webp">WebP</option>
        </select>
        <input type="range" min={0.5} max={1} step={0.01} value={exportQuality} onChange={(e) => setExportQuality(Number(e.target.value))} style={{ width: 80 }} title="Quality" />
        <button className="btn" onClick={exportImage}><DownloadIcon size={15} /> Export</button>
      </div>

      <div className="img-workspace">
        <div className="img-canvas-wrap">
          <canvas
            ref={canvasRef}
            style={{ maxWidth: '100%', maxHeight: '100%', cursor: tool === 'brush' || tool === 'eraser' ? 'crosshair' : tool === 'crop' ? 'crosshair' : 'default' }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={() => { if (drawing) handleMouseUp({} as React.MouseEvent<HTMLCanvasElement>); }}
          />
          {tool === 'crop' && cropRect && cropRect.w !== 0 && (
            <div className="img-crop-actions">
              <button className="btn small" onClick={applyCrop}>Apply crop</button>
              <button className="btn ghost small" onClick={() => setCropRect(null)}>Cancel</button>
            </div>
          )}
        </div>

        <aside className="img-panel">
          {/* Adjustments */}
          <div className="panel-section">
            <h3 className="panel-title">Adjustments</h3>
            {[
              ['brightness', 'Brightness', 0, 2, 0.01],
              ['contrast', 'Contrast', 0, 2, 0.01],
              ['saturation', 'Saturation', 0, 2, 0.01],
              ['hue', 'Hue', 0, 360, 1],
              ['temperature', 'Temperature', -1, 1, 0.01],
              ['exposure', 'Exposure', -1, 1, 0.01],
              ['sharpness', 'Sharpness', 0, 1, 0.01],
              ['opacity', 'Opacity', 0, 1, 0.01],
            ].map(([key, label, min, max, step]) => (
              <div className="field" key={key as string}>
                <label>{label as string} — {(adj[key as keyof Adjustments] as number).toFixed(key === 'hue' ? 0 : 2)}</label>
                <input type="range" min={min as number} max={max as number} step={step as number}
                  value={adj[key as keyof Adjustments] as number}
                  onChange={(e) => applyAdjustment(key as keyof Adjustments, Number(e.target.value))} />
              </div>
            ))}
            <div className="field-group-title">Levels</div>
            <div className="field">
              <label>Black point — {adj.levels.black}</label>
              <input type="range" min={0} max={254} step={1} value={adj.levels.black}
                onChange={(e) => setAdj((a) => ({ ...a, levels: { ...a.levels, black: Number(e.target.value) } }))} />
            </div>
            <div className="field">
              <label>White point — {adj.levels.white}</label>
              <input type="range" min={1} max={255} step={1} value={adj.levels.white}
                onChange={(e) => setAdj((a) => ({ ...a, levels: { ...a.levels, white: Number(e.target.value) } }))} />
            </div>
            <div className="field">
              <label>Gamma — {adj.levels.gamma.toFixed(2)}</label>
              <input type="range" min={0.1} max={3} step={0.01} value={adj.levels.gamma}
                onChange={(e) => setAdj((a) => ({ ...a, levels: { ...a.levels, gamma: Number(e.target.value) } }))} />
            </div>
            <button className="btn ghost small" onClick={() => setAdj((a) => ({ ...a, levels: { black: 0, white: 255, gamma: 1 } }))}>
              Reset levels
            </button>

            <button className="btn ghost small" onClick={() => setAdj({ ...DEFAULT_ADJ })}>Reset all</button>
          </div>

          {/* Presets */}
          <div className="panel-section">
            <h3 className="panel-title">Filters / Presets</h3>
            <div className="preset-grid">
              {PRESETS.map((p) => (
                <button key={p.name} className={`preset-btn ${preset === p.name ? 'active' : ''}`} onClick={() => applyPreset(p.name)}>
                  {p.name}
                </button>
              ))}
            </div>
          </div>

          {/* Transform */}
          <div className="panel-section">
            <h3 className="panel-title">Transform</h3>
            <div className="field-row">
              <button className="btn ghost small" onClick={() => rotate(90)}>Rotate 90°</button>
              <button className="btn ghost small" onClick={() => rotate(-90)}>Rotate -90°</button>
            </div>
            <div className="field-row">
              <button className="btn ghost small" onClick={() => flip('h')}>Flip H</button>
              <button className="btn ghost small" onClick={() => flip('v')}>Flip V</button>
            </div>
            <div className="field-row">
              <div className="field">
                <label>Width</label>
                <input type="number" min={1} value={canvasSize.w} onChange={(e) => resize(Number(e.target.value), canvasSize.h)} />
              </div>
              <div className="field">
                <label>Height</label>
                <input type="number" min={1} value={canvasSize.h} onChange={(e) => resize(canvasSize.w, Number(e.target.value))} />
              </div>
            </div>
            <button className="btn ghost small" onClick={() => { const s = Math.min(canvasSize.w, canvasSize.h); resize(s, s); }}>Square (1:1)</button>
          </div>

          {/* Brush / text / shape settings */}
          {(tool === 'brush' || tool === 'eraser') && (
            <div className="panel-section">
              <h3 className="panel-title">Brush</h3>
              <div className="field"><label>Color</label><input type="color" value={brushColor} onChange={(e) => setBrushColor(e.target.value)} /></div>
              <div className="field"><label>Size — {brushSize}px</label><input type="range" min={1} max={80} value={brushSize} onChange={(e) => setBrushSize(Number(e.target.value))} /></div>
              <div className="field"><label>Opacity — {Math.round(brushOpacity * 100)}%</label><input type="range" min={0.05} max={1} step={0.05} value={brushOpacity} onChange={(e) => setBrushOpacity(Number(e.target.value))} /></div>
            </div>
          )}
          {tool === 'text' && (
            <div className="panel-section">
              <h3 className="panel-title">Text</h3>
              <div className="field"><label>Content</label><input type="text" value={textValue} onChange={(e) => setTextValue(e.target.value)} /></div>
              <div className="field"><label>Size — {textSize}px</label><input type="range" min={12} max={200} value={textSize} onChange={(e) => setTextSize(Number(e.target.value))} /></div>
              <div className="field"><label>Color</label><input type="color" value={textColor} onChange={(e) => setTextColor(e.target.value)} /></div>
            </div>
          )}
          {(tool === 'rect' || tool === 'circle' || tool === 'line' || tool === 'arrow') && (
            <div className="panel-section">
              <h3 className="panel-title">Shape</h3>
              <div className="field"><label>Stroke</label><input type="color" value={shapeStroke} onChange={(e) => setShapeStroke(e.target.value)} /></div>
              <div className="field"><label>Stroke width — {shapeWidth}px</label><input type="range" min={1} max={20} value={shapeWidth} onChange={(e) => setShapeWidth(Number(e.target.value))} /></div>
              <div className="field"><label>Fill</label><input type="color" value={shapeFill === 'transparent' ? '#000000' : shapeFill} onChange={(e) => setShapeFill(e.target.value)} />
                <button className="btn ghost small" onClick={() => setShapeFill('transparent')}>Transparent</button>
              </div>
            </div>
          )}

          {/* Layers */}
          <div className="panel-section">
            <h3 className="panel-title">Layers <button className="btn ghost small" onClick={addLayer} style={{ padding: '2px 8px' }}><PlusIcon size={13} /> Add</button></h3>
            <div className="layer-list">
              {layers.map((l) => (
                <div key={l.id} className={`layer-row ${activeLayer === l.id ? 'active' : ''}`} onClick={() => setActiveLayer(l.id)}>
                  <button className="layer-vis" onClick={(e) => { e.stopPropagation(); toggleLayer(l.id); }} title={l.visible ? 'Hide' : 'Show'}>
                    {l.visible ? 'On' : 'Off'}
                  </button>
                  <span className="layer-name">{l.name}</span>
                  <select
                    className="blend-select"
                    value={l.blendMode}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => setLayers((ls) => ls.map((x) => (x.id === l.id ? { ...x, blendMode: e.target.value } : x)))}
                  >
                    <option value="source-over">Normal</option>
                    <option value="multiply">Multiply</option>
                    <option value="screen">Screen</option>
                    <option value="overlay">Overlay</option>
                    <option value="darken">Darken</option>
                    <option value="lighten">Lighten</option>
                    <option value="color-dodge">Dodge</option>
                    <option value="color-burn">Burn</option>
                    <option value="hard-light">Hard light</option>
                    <option value="soft-light">Soft light</option>
                    <option value="difference">Difference</option>
                    <option value="exclusion">Exclusion</option>
                  </select>
                  <input type="range" min={0} max={1} step={0.05} value={l.opacity} onClick={(e) => e.stopPropagation()} onChange={(e) => setLayerOpacity(l.id, Number(e.target.value))} style={{ width: 50 }} />
                  <button className="layer-btn" onClick={(e) => { e.stopPropagation(); moveLayer(l.id, -1); }} title="Move up">↑</button>
                  <button className="layer-btn" onClick={(e) => { e.stopPropagation(); moveLayer(l.id, 1); }} title="Move down">↓</button>
                  {l.kind !== 'base' && (
                    <button className="layer-btn danger" onClick={(e) => { e.stopPropagation(); removeLayer(l.id); }} title="Delete"><TrashIcon size={12} /></button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Batch */}
          <div className="panel-section">
            <h3 className="panel-title">Batch processing</h3>
            <label className="import-zone small">
              <input type="file" accept="image/*" multiple hidden onChange={(e) => { if (e.target.files?.length) handleBatchFiles(e.target.files); e.target.value = ''; }} />
              <span>Select images to batch-export</span>
            </label>
            {batchFiles.length > 0 && (
              <div style={{ marginTop: 8, fontSize: 11, color: 'var(--ink-muted)' }}>
                {batchFiles.length} image{batchFiles.length === 1 ? '' : 's'} selected
              </div>
            )}
            <button className="btn small" style={{ marginTop: 8, width: '100%', justifyContent: 'center' }} onClick={runBatch} disabled={batchFiles.length === 0 || batchRunning}>
              {batchRunning ? 'Processing…' : 'Apply edits & export all'}
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
