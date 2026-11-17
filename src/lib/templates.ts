// Template metadata shared by the Dashboard gallery and the editor's
// applyTemplate. The `scaffold` block describes the starter text layers the
// project is seeded with — sample copy users replace with their own words.
export interface VideoTemplate {
  id: string;
  name: string;
  desc: string;
  aspect: '16:9' | '9:16' | '1:1';
  tag: string;
  scaffold: {
    kicker: string;
    title: string;
    subtitle: string;
    handle: string;
    /** Accent color for the kicker + handle. */
    accent: string;
  };
}

export const VIDEO_TEMPLATES: VideoTemplate[] = [
  { id: 'cinematic', name: 'Cinematic Vlog', desc: '16:9 · slow fades and muted grade', aspect: '16:9', tag: '16:9',
    scaffold: { kicker: 'E P I S O D E  1', title: 'WANDERLUST', subtitle: 'A journey in three parts', handle: '@yourchannel', accent: '#e6c476' } },
  { id: 'reel',      name: 'Social Reel',    desc: '9:16 · fast cuts, bold caption', aspect: '9:16', tag: '9:16',
    scaffold: { kicker: 'P O V', title: 'POV: YOUR SUNDAY', subtitle: 'Cut to the beat — replace with your footage', handle: '@you', accent: '#e6c476' } },
  { id: 'square',    name: 'Product Grid',   desc: '1:1 · square for social feeds',  aspect: '1:1', tag: '1:1',
    scaffold: { kicker: 'N E W', title: 'NOW IN STOCK', subtitle: 'Limited run — link in bio', handle: '@yourbrand', accent: '#e6c476' } },
  { id: 'slideshow', name: 'Photo Slideshow',desc: '16:9 · Ken Burns-style motion',  aspect: '16:9', tag: '16:9',
    scaffold: { kicker: 'M E M O R I E S', title: 'THE YEAR IN PICTURES', subtitle: 'Drop your photos on the timeline', handle: '@you', accent: '#e6c476' } },
  { id: 'minimal',   name: 'Minimal Dark',   desc: '16:9 · muted, letterboxed look', aspect: '16:9', tag: '16:9',
    scaffold: { kicker: 'A  F I L M  B Y', title: 'Y O U R  N A M E', subtitle: 'Every frame chosen with care', handle: '@yourchannel', accent: '#9aa0a6' } },
  { id: 'vertical',  name: 'Vertical Interview', desc: '9:16 · face-first framing',  aspect: '9:16', tag: '9:16',
    scaffold: { kicker: 'I N T E R V I E W', title: 'ONE QUESTION', subtitle: 'Subtitles via .srt import — or type below', handle: '@you', accent: '#e6c476' } },
];
