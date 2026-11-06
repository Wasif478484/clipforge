import { create } from 'zustand';
import type { Aspect, Clip, MediaAsset, Selection, TextOverlay } from '../types';
import { loadSettings } from '../lib/settings';

type Updater<T> = T | ((previous: T) => T);

interface EditorStore {
  projectName: string;
  aspect: Aspect;
  assets: MediaAsset[];
  clips: Clip[];
  texts: TextOverlay[];
  selection: Selection;
  setProjectName: (projectName: Updater<string>) => void;
  setAspect: (aspect: Updater<Aspect>) => void;
  setAssets: (assets: Updater<MediaAsset[]>) => void;
  setClips: (clips: Updater<Clip[]>) => void;
  setTexts: (texts: Updater<TextOverlay[]>) => void;
  setSelection: (selection: Updater<Selection>) => void;
  reset: () => void;
}

const initialState = {
  projectName: 'Untitled project',
  aspect: loadSettings().defaultAspect,
  assets: [] as MediaAsset[],
  clips: [] as Clip[],
  texts: [] as TextOverlay[],
  selection: null as Selection,
};

export const useEditorStore = create<EditorStore>((set) => ({
  ...initialState,
  setProjectName: (projectName) => set((state) => ({ projectName: typeof projectName === 'function' ? projectName(state.projectName) : projectName })),
  setAspect: (aspect) => set((state) => ({ aspect: typeof aspect === 'function' ? aspect(state.aspect) : aspect })),
  setAssets: (assets) => set((state) => ({ assets: typeof assets === 'function' ? assets(state.assets) : assets })),
  setClips: (clips) => set((state) => ({ clips: typeof clips === 'function' ? clips(state.clips) : clips })),
  setTexts: (texts) => set((state) => ({ texts: typeof texts === 'function' ? texts(state.texts) : texts })),
  setSelection: (selection) => set((state) => ({ selection: typeof selection === 'function' ? selection(state.selection) : selection })),
  reset: () => set(initialState),
}));
