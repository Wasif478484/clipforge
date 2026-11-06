import { create } from 'zustand';
import type { Aspect, Clip, MediaAsset, Selection, TextOverlay } from '../types';

interface EditorStore {
  projectName: string;
  aspect: Aspect;
  assets: MediaAsset[];
  clips: Clip[];
  texts: TextOverlay[];
  selection: Selection;
  setProjectName: (projectName: string) => void;
  setAspect: (aspect: Aspect) => void;
  setAssets: (assets: MediaAsset[]) => void;
  setClips: (clips: Clip[]) => void;
  setTexts: (texts: TextOverlay[]) => void;
  setSelection: (selection: Selection) => void;
  reset: () => void;
}

const initialState = {
  projectName: 'Untitled project',
  aspect: '16:9' as Aspect,
  assets: [] as MediaAsset[],
  clips: [] as Clip[],
  texts: [] as TextOverlay[],
  selection: null as Selection,
};

export const useEditorStore = create<EditorStore>((set) => ({
  ...initialState,
  setProjectName: (projectName) => set({ projectName }),
  setAspect: (aspect) => set({ aspect }),
  setAssets: (assets) => set({ assets }),
  setClips: (clips) => set({ clips }),
  setTexts: (texts) => set({ texts }),
  setSelection: (selection) => set({ selection }),
  reset: () => set(initialState),
}));
