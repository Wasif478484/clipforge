// Template metadata shared by the Dashboard and the editor's applyTemplate.
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
