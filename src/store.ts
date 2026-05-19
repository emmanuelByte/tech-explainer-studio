import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  EditorState, Layer, Keyframe, TransformProps,
  CANVAS_PRESETS, DEFAULT_TRANSFORM, LayerType, Tool,
  GradientStop, FillType, TimelineMarker, GOOGLE_FONTS,
} from './types'

function uid() { return Math.random().toString(36).slice(2, 9) }

const TYPE_NAMES: Record<LayerType, string> = {
  rectangle: 'Rectangle', ellipse: 'Ellipse', line: 'Line',
  triangle: 'Triangle', text: 'Text', image: 'Image',
}

function makeLayer(type: LayerType = 'rectangle', overrides: Partial<Layer> = {}): Layer {
  return {
    id: uid(),
    name: TYPE_NAMES[type],
    type,
    visible: true,
    locked: false,
    width: type === 'text' ? 400 : type === 'line' ? 200 : 200,
    height: type === 'text' ? 80 : type === 'line' ? 4 : 140,
    fillType: 'solid',
    fillColor: `hsl(${Math.floor(Math.random() * 360)},65%,55%)`,
    gradientStops: [{ color: '#6366f1', position: 0 }, { color: '#a855f7', position: 100 }],
    gradientAngle: 135,
    strokeEnabled: type === 'line',
    strokeColor: '#ffffff',
    strokeWidth: type === 'line' ? 2 : 0,
    borderRadius: 0,
    shadowEnabled: false,
    shadowColor: 'rgba(0,0,0,0.5)',
    text: type === 'text' ? 'Edit text' : '',
    fontFamily: 'Inter',
    fontSize: 48,
    fontWeight: '600',
    textAlign: 'center',
    letterSpacing: 0,
    lineHeight: 1.2,
    textColor: '#ffffff',
    keyframes: [{ frame: 0, easing: 'ease-out', props: { ...DEFAULT_TRANSFORM } }],
    ...overrides,
  }
}

interface Actions {
  // Layers
  addLayer: (type: LayerType) => void
  addImage: (src: string, name: string) => void
  deleteLayer: (id: string) => void
  duplicateLayer: (id: string) => void
  toggleVisibility: (id: string) => void
  toggleLock: (id: string) => void
  selectLayer: (id: string | null, multi?: boolean) => void
  selectLayers: (ids: string[]) => void
  renameLayer: (id: string, name: string) => void
  updateLayerProp: <K extends keyof Layer>(id: string, key: K, value: Layer[K]) => void
  reorderLayers: (from: number, to: number) => void
  // Keyframes
  addKeyframe: (layerId: string, frame: number, props: TransformProps, easing?: string) => void
  removeKeyframe: (layerId: string, frame: number) => void
  moveKeyframe: (layerId: string, fromFrame: number, toFrame: number) => void
  updateKeyframeEasing: (layerId: string, frame: number, easing: string) => void
  // Playback
  setCurrentFrame: (frame: number) => void
  setTotalFrames: (frames: number) => void
  setPlaying: (playing: boolean) => void
  // Canvas
  setCanvasPreset: (name: string) => void
  setCustomDimension: (key: 'customWidth' | 'customHeight', value: number) => void
  // UI
  setTheme: (theme: 'dark' | 'light') => void
  setTool: (tool: Tool) => void
  setTimelineZoom: (zoom: number) => void
  // Markers
  addMarker: (frame: number) => void
  removeMarker: (id: string) => void
  // Loop
  setLoop: (inFrame: number, outFrame: number) => void
  clearLoop: () => void
  setLoopEnabled: (enabled: boolean) => void
  // History
  undo: () => void
  redo: () => void
  _snapshot: () => void
}

interface HistorySlice {
  _past: string[]   // JSON-serialized Layer[]
  _future: string[]
}

type Store = EditorState & HistorySlice & Actions

const initialLayers: Layer[] = [
  makeLayer('rectangle', { name: 'Rectangle 1', fillColor: '#6366f1', width: 320, height: 180 }),
]

export const useStore = create<Store>()(
  persist(
    (set, get) => ({
      // EditorState
      layers: initialLayers,
      selectedLayerIds: [],
      currentFrame: 0,
      totalFrames: 150,
      fps: 30,
      isPlaying: false,
      canvasPreset: CANVAS_PRESETS[0],
      customWidth: 1280,
      customHeight: 720,
      theme: 'dark',
      currentTool: 'select',
      timelineZoom: 1,
      markers: [],
      loopIn: null,
      loopOut: null,
      loopEnabled: false,
      // History
      _past: [],
      _future: [],

      _snapshot: () => {
        const { layers, _past } = get()
        set({ _past: [..._past.slice(-49), JSON.stringify(layers)], _future: [] })
      },

      undo: () => {
        const { _past, layers, _future } = get()
        if (!_past.length) return
        const newPast = [..._past]
        const prev = JSON.parse(newPast.pop()!) as Layer[]
        set({
          layers: prev,
          _past: newPast,
          _future: [JSON.stringify(layers), ..._future.slice(0, 49)],
        })
      },

      redo: () => {
        const { _past, layers, _future } = get()
        if (!_future.length) return
        const newFuture = [..._future]
        const next = JSON.parse(newFuture.shift()!) as Layer[]
        set({
          layers: next,
          _past: [..._past, JSON.stringify(layers)],
          _future: newFuture,
        })
      },

      addLayer: (type) => {
        get()._snapshot()
        const { layers } = get()
        set({ layers: [...layers, makeLayer(type, { name: `${TYPE_NAMES[type]} ${layers.filter(l => l.type === type).length + 1}` })] })
      },

      addImage: (src, name) => {
        get()._snapshot()
        set((s) => ({ layers: [...s.layers, makeLayer('image', { name, src, width: 300, height: 200 })] }))
      },

      deleteLayer: (id) => {
        get()._snapshot()
        set((s) => ({
          layers: s.layers.filter((l) => l.id !== id),
          selectedLayerIds: s.selectedLayerIds.filter((sid) => sid !== id),
        }))
      },

      duplicateLayer: (id) => {
        get()._snapshot()
        const { layers } = get()
        const src = layers.find((l) => l.id === id)
        if (!src) return
        const dup: Layer = { ...src, id: uid(), name: `${src.name} Copy` }
        const idx = layers.findIndex((l) => l.id === id)
        const next = [...layers]
        next.splice(idx + 1, 0, dup)
        set({ layers: next, selectedLayerIds: [dup.id] })
      },

      toggleVisibility: (id) =>
        set((s) => ({ layers: s.layers.map((l) => l.id === id ? { ...l, visible: !l.visible } : l) })),

      toggleLock: (id) =>
        set((s) => ({ layers: s.layers.map((l) => l.id === id ? { ...l, locked: !l.locked } : l) })),

      selectLayer: (id, multi = false) => {
        if (!id) { set({ selectedLayerIds: [] }); return }
        if (multi) {
          const { selectedLayerIds } = get()
          const next = selectedLayerIds.includes(id)
            ? selectedLayerIds.filter((x) => x !== id)
            : [...selectedLayerIds, id]
          set({ selectedLayerIds: next })
        } else {
          set({ selectedLayerIds: [id] })
        }
      },

      selectLayers: (ids) => set({ selectedLayerIds: ids }),

      renameLayer: (id, name) =>
        set((s) => ({ layers: s.layers.map((l) => l.id === id ? { ...l, name } : l) })),

      updateLayerProp: (id, key, value) => {
        set((s) => ({ layers: s.layers.map((l) => l.id === id ? { ...l, [key]: value } : l) }))
      },

      reorderLayers: (from, to) => {
        get()._snapshot()
        set((s) => {
          const layers = [...s.layers]
          const [item] = layers.splice(from, 1)
          layers.splice(to, 0, item)
          return { layers }
        })
      },

      addKeyframe: (layerId, frame, props, easing = 'ease-out') => {
        get()._snapshot()
        set((s) => ({
          layers: s.layers.map((l) => {
            if (l.id !== layerId) return l
            const existing = l.keyframes.find((k) => k.frame === frame)
            const kf: Keyframe = { frame, easing: (easing as Keyframe['easing']), props }
            const keyframes = existing
              ? l.keyframes.map((k) => k.frame === frame ? kf : k)
              : [...l.keyframes, kf].sort((a, b) => a.frame - b.frame)
            return { ...l, keyframes }
          }),
        }))
      },

      removeKeyframe: (layerId, frame) => {
        get()._snapshot()
        set((s) => ({
          layers: s.layers.map((l) =>
            l.id === layerId ? { ...l, keyframes: l.keyframes.filter((k) => k.frame !== frame) } : l
          ),
        }))
      },

      moveKeyframe: (layerId, fromFrame, toFrame) => {
        set((s) => ({
          layers: s.layers.map((l) => {
            if (l.id !== layerId) return l
            const keyframes = l.keyframes
              .map((k) => k.frame === fromFrame ? { ...k, frame: toFrame } : k)
              .sort((a, b) => a.frame - b.frame)
            return { ...l, keyframes }
          }),
        }))
      },

      updateKeyframeEasing: (layerId, frame, easing) => {
        set((s) => ({
          layers: s.layers.map((l) => {
            if (l.id !== layerId) return l
            return {
              ...l,
              keyframes: l.keyframes.map((k) =>
                k.frame === frame ? { ...k, easing: easing as Keyframe['easing'] } : k
              ),
            }
          }),
        }))
      },

      setCurrentFrame: (frame) => set({ currentFrame: frame }),
      setTotalFrames: (frames) => set({ totalFrames: frames }),
      setPlaying: (playing) => set({ isPlaying: playing }),

      setCanvasPreset: (name) => {
        const preset = CANVAS_PRESETS.find((p) => p.name === name)
        if (preset) set({ canvasPreset: preset })
      },

      setCustomDimension: (key, value) => set({ [key]: value }),
      setTheme: (theme) => set({ theme }),
      setTool: (tool) => set({ currentTool: tool }),
      setTimelineZoom: (zoom) => set({ timelineZoom: zoom }),

      addMarker: (frame) => {
        const colors = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#a855f7']
        const marker: TimelineMarker = {
          id: uid(), frame,
          label: `Marker ${get().markers.length + 1}`,
          color: colors[get().markers.length % colors.length],
        }
        set((s) => ({ markers: [...s.markers, marker] }))
      },

      removeMarker: (id) => set((s) => ({ markers: s.markers.filter((m) => m.id !== id) })),

      setLoop: (inFrame, outFrame) => set({ loopIn: inFrame, loopOut: outFrame }),
      clearLoop: () => set({ loopIn: null, loopOut: null }),
      setLoopEnabled: (enabled) => set({ loopEnabled: enabled }),
    }),
    {
      name: 'motion-editor-v1',
      partialize: (s) => ({
        layers: s.layers,
        totalFrames: s.totalFrames,
        fps: s.fps,
        canvasPreset: s.canvasPreset,
        customWidth: s.customWidth,
        customHeight: s.customHeight,
        theme: s.theme,
        markers: s.markers,
        timelineZoom: s.timelineZoom,
      }),
    }
  )
)

// Derived selector helpers
export const selectedLayer = (s: Store) =>
  s.layers.find((l) => l.id === s.selectedLayerIds[0]) ?? null

export const selectedLayers = (s: Store) =>
  s.layers.filter((l) => s.selectedLayerIds.includes(l.id))
