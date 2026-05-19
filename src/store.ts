import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  EditorState, Layer, Keyframe, TransformProps,
  CANVAS_PRESETS, DEFAULT_TRANSFORM,
} from './types'

function uid() {
  return Math.random().toString(36).slice(2, 9)
}

function makeLayer(overrides: Partial<Layer>): Layer {
  return {
    id: uid(),
    name: 'Rectangle',
    type: 'rectangle',
    visible: true,
    width: 200,
    height: 120,
    color: `hsl(${Math.floor(Math.random() * 360)}, 70%, 60%)`,
    keyframes: [{ frame: 0, props: { ...DEFAULT_TRANSFORM } }],
    ...overrides,
  }
}

interface Actions {
  addRectangle: () => void
  addImage: (src: string, name: string) => void
  deleteLayer: (id: string) => void
  toggleVisibility: (id: string) => void
  selectLayer: (id: string | null) => void
  updateLayerProp: (id: string, key: keyof Layer, value: unknown) => void
  setCurrentFrame: (frame: number) => void
  setTotalFrames: (frames: number) => void
  setPlaying: (playing: boolean) => void
  addKeyframe: (layerId: string, frame: number, props: TransformProps) => void
  removeKeyframe: (layerId: string, frame: number) => void
  setCanvasPreset: (name: string) => void
  setCustomDimension: (key: 'customWidth' | 'customHeight', value: number) => void
  reorderLayers: (from: number, to: number) => void
}

type Store = EditorState & Actions

const initialState = {
  layers: [makeLayer({ name: 'Rectangle 1', color: '#6366f1' })],
  selectedLayerId: null as string | null,
  currentFrame: 0,
  totalFrames: 150,
  fps: 30,
  isPlaying: false,
  canvasPreset: CANVAS_PRESETS[0],
  customWidth: 1280,
  customHeight: 720,
}

export const useStore = create<Store>()(
  persist(
    (set) => ({
      ...initialState,

  addRectangle: () =>
    set((s) => ({
      layers: [...s.layers, makeLayer({ name: `Rectangle ${s.layers.length + 1}` })],
    })),

  addImage: (src, name) =>
    set((s) => ({
      layers: [
        ...s.layers,
        makeLayer({ name, type: 'image', src, width: 300, height: 200, color: 'transparent' }),
      ],
    })),

  deleteLayer: (id) =>
    set((s) => ({
      layers: s.layers.filter((l) => l.id !== id),
      selectedLayerId: s.selectedLayerId === id ? null : s.selectedLayerId,
    })),

  toggleVisibility: (id) =>
    set((s) => ({
      layers: s.layers.map((l) => (l.id === id ? { ...l, visible: !l.visible } : l)),
    })),

  selectLayer: (id) => set({ selectedLayerId: id }),

  updateLayerProp: (id, key, value) =>
    set((s) => ({
      layers: s.layers.map((l) => (l.id === id ? { ...l, [key]: value } : l)),
    })),

  setCurrentFrame: (frame) => set({ currentFrame: frame }),

  setTotalFrames: (frames) => set({ totalFrames: frames }),

  setPlaying: (playing) => set({ isPlaying: playing }),

  addKeyframe: (layerId, frame, props) =>
    set((s) => ({
      layers: s.layers.map((l) => {
        if (l.id !== layerId) return l
        const existing = l.keyframes.find((k) => k.frame === frame)
        const keyframes: Keyframe[] = existing
          ? l.keyframes.map((k) => (k.frame === frame ? { frame, props } : k))
          : [...l.keyframes, { frame, props }].sort((a, b) => a.frame - b.frame)
        return { ...l, keyframes }
      }),
    })),

  removeKeyframe: (layerId, frame) =>
    set((s) => ({
      layers: s.layers.map((l) => {
        if (l.id !== layerId) return l
        return { ...l, keyframes: l.keyframes.filter((k) => k.frame !== frame) }
      }),
    })),

  setCanvasPreset: (name) =>
    set((s) => {
      const preset = CANVAS_PRESETS.find((p) => p.name === name)
      return preset ? { canvasPreset: preset } : {}
    }),

  setCustomDimension: (key, value) => set({ [key]: value }),

  reorderLayers: (from, to) =>
    set((s) => {
      const layers = [...s.layers]
      const [item] = layers.splice(from, 1)
      layers.splice(to, 0, item)
      return { layers }
    }),
    }),
    {
      name: 'motion-editor-v1',
      // Don't persist transient playback state
      partialize: (s) => ({
        layers: s.layers,
        totalFrames: s.totalFrames,
        fps: s.fps,
        canvasPreset: s.canvasPreset,
        customWidth: s.customWidth,
        customHeight: s.customHeight,
      }),
    }
  )
)
