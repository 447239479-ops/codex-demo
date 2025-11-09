import { create } from "zustand";

import {
  cloneImageData,
  type MaskAdjustments,
  normalizeMaskAdjustments
} from "@/lib/mask";

interface AppState {
  intensity: number;
  gloss: number;
  texture: number;
  showOriginal: boolean;
  sideBySide: boolean;
  baseCanvas: HTMLCanvasElement | null;
  baseImageData: ImageData | null;
  setIntensity: (value: number) => void;
  setGloss: (value: number) => void;
  setTexture: (value: number) => void;
  toggleOriginal: () => void;
  toggleSideBySide: () => void;
  setBaseCanvasData: (canvas: HTMLCanvasElement | null, data: ImageData | null) => void;
  maskCanvas: HTMLCanvasElement | null;
  maskHistory: ImageData[];
  maskRedoStack: ImageData[];
  maskAdjustments: MaskAdjustments;
  setMaskCanvas: (canvas: HTMLCanvasElement | null) => void;
  initializeMaskHistory: (imageData: ImageData) => void;
  commitMaskSnapshot: (imageData: ImageData) => void;
  undoMask: () => ImageData | null;
  redoMask: () => ImageData | null;
  canUndoMask: () => boolean;
  canRedoMask: () => boolean;
  setMaskAdjustments: (updates: Partial<MaskAdjustments>) => void;
}

const DEFAULT_MASK_ADJUSTMENTS: MaskAdjustments = {
  feather: 0,
  dilate: 0,
  erode: 0
};

const HISTORY_LIMIT = 20;

export const useAppStore = create<AppState>((set, get) => ({
  intensity: 50,
  gloss: 50,
  texture: 50,
  showOriginal: false,
  sideBySide: false,
  baseCanvas: null,
  baseImageData: null,
  maskCanvas: null,
  maskHistory: [],
  maskRedoStack: [],
  maskAdjustments: DEFAULT_MASK_ADJUSTMENTS,
  setIntensity: (value) => set({ intensity: value }),
  setGloss: (value) => set({ gloss: value }),
  setTexture: (value) => set({ texture: value }),
  toggleOriginal: () => set((state) => ({ showOriginal: !state.showOriginal })),
  toggleSideBySide: () => set((state) => ({ sideBySide: !state.sideBySide })),
  setBaseCanvasData: (canvas, data) => set({ baseCanvas: canvas, baseImageData: data }),
  setMaskCanvas: (canvas) => set({ maskCanvas: canvas }),
  initializeMaskHistory: (imageData) =>
    set({
      maskHistory: [cloneImageData(imageData)],
      maskRedoStack: []
    }),
  commitMaskSnapshot: (imageData) =>
    set((state) => {
      const nextHistory = [...state.maskHistory, cloneImageData(imageData)];
      const trimmedHistory =
        nextHistory.length > HISTORY_LIMIT
          ? nextHistory.slice(nextHistory.length - HISTORY_LIMIT)
          : nextHistory;

      return {
        maskHistory: trimmedHistory,
        maskRedoStack: []
      };
    }),
  undoMask: () => {
    let restored: ImageData | null = null;
    set((state) => {
      if (state.maskHistory.length <= 1) {
        restored = state.maskHistory.length === 1
          ? cloneImageData(state.maskHistory[0])
          : null;
        return state;
      }

      const previousHistory = state.maskHistory.slice(0, -1);
      const restoredImage = previousHistory[previousHistory.length - 1];
      restored = restoredImage ? cloneImageData(restoredImage) : null;

      return {
        maskHistory: previousHistory,
        maskRedoStack: [
          ...state.maskRedoStack,
          cloneImageData(state.maskHistory[state.maskHistory.length - 1])
        ]
      };
    });

    return restored;
  },
  redoMask: () => {
    let restored: ImageData | null = null;
    set((state) => {
      if (state.maskRedoStack.length === 0) {
        restored = state.maskHistory.length
          ? cloneImageData(state.maskHistory[state.maskHistory.length - 1])
          : null;
        return state;
      }

      const redoStack = state.maskRedoStack.slice();
      const nextImage = redoStack.pop();
      if (!nextImage) {
        restored = null;
        return state;
      }

      const nextHistory = [...state.maskHistory, cloneImageData(nextImage)];
      restored = cloneImageData(nextImage);

      return {
        maskHistory: nextHistory,
        maskRedoStack: redoStack
      };
    });

    return restored;
  },
  canUndoMask: () => get().maskHistory.length > 1,
  canRedoMask: () => get().maskRedoStack.length > 0,
  setMaskAdjustments: (updates) =>
    set((state) => ({
      maskAdjustments: normalizeMaskAdjustments({
        ...state.maskAdjustments,
        ...updates
      })
    }))
}));
