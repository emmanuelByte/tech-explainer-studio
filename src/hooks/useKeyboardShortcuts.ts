import { useEffect } from 'react'
import { useStore } from '../store'
import { interpolateProps } from '../remotion/interpolateProps'
import { rootLayerIds, selectedWithDescendants } from '../libraryItems'
import { AnimatableProperty, KeyframeSelection, Layer, PairEasingType, TransformProps } from '../types'

type KeyframeClipboardItem =
  | {
    kind: 'transform'
    layerId: string
    offset: number
    props: TransformProps
    easing: PairEasingType
    bezier?: [number, number, number, number]
  }
  | {
    kind: 'property'
    layerId: string
    propKey: AnimatableProperty
    offset: number
    value: number | string
    easing: PairEasingType
    bezier?: [number, number, number, number]
  }

let keyframeClipboard: KeyframeClipboardItem[] = []
let layerClipboard: { layers: Layer[]; rootLayerIds: string[]; pasteCount: number } | null = null
let clipboardKind: 'keyframe' | 'layer' | null = null

function getKeyboardMoveLayerIds(layers: ReturnType<typeof useStore.getState>['layers'], selectedIds: string[]) {
  const ids = new Set<string>()
  selectedIds.forEach((id) => {
    const layer = layers.find((item) => item.id === id)
    if (!layer || layer.locked) return
    ids.add(id)
  })
  return [...ids]
}

function copySelectedKeyframes(store: ReturnType<typeof useStore.getState>) {
  const selected = store.selectedKeyframes
  if (!selected.length) return false
  const minFrame = Math.min(...selected.map((kf) => kf.frame))
  const items = selected.flatMap((selection): KeyframeClipboardItem[] => {
    const layer = store.layers.find((item) => item.id === selection.layerId)
    if (!layer) return []
    if (selection.propKey) {
      const source = layer.propertyKeyframes?.[selection.propKey]?.find((kf) => kf.frame === selection.frame)
      if (!source) return []
      return [{
        kind: 'property',
        layerId: layer.id,
        propKey: selection.propKey,
        offset: selection.frame - minFrame,
        value: source.value,
        easing: source.easing,
        bezier: source.bezier,
      }]
    }
    const source = layer.keyframes.find((kf) => kf.frame === selection.frame)
    if (!source) return []
    return [{
      kind: 'transform',
      layerId: layer.id,
      offset: selection.frame - minFrame,
      props: { ...source.props },
      easing: source.easing,
      bezier: source.bezier,
    }]
  })
  if (!items.length) return false
  keyframeClipboard = items
  clipboardKind = 'keyframe'
  return true
}

function pasteKeyframeClipboard(store: ReturnType<typeof useStore.getState>) {
  if (!keyframeClipboard.length) return false
  const nextSelection: KeyframeSelection[] = []
  keyframeClipboard.forEach((item) => {
    const layer = store.layers.find((candidate) => candidate.id === item.layerId)
    if (!layer) return
    const frame = Math.max(0, Math.min(store.totalFrames - 1, store.currentFrame + item.offset))
    if (item.kind === 'property') {
      store.addPropertyKeyframe(item.layerId, item.propKey, frame, item.value)
      store.updatePropertyKeyframeEasing(item.layerId, item.propKey, frame, item.easing, item.bezier)
      nextSelection.push({ layerId: item.layerId, frame, propKey: item.propKey })
      return
    }
    store.addKeyframe(item.layerId, frame, { ...item.props }, item.easing)
    store.updateKeyframeEasing(item.layerId, frame, item.easing, item.bezier)
    nextSelection.push({ layerId: item.layerId, frame })
  })
  if (!nextSelection.length) return false
  store.selectKeyframe(nextSelection[0])
  nextSelection.slice(1).forEach((selection) => store.selectKeyframe(selection, true))
  return true
}

function cloneLayer(layer: Layer): Layer {
  return {
    ...layer,
    keyframes: layer.keyframes.map((kf) => ({ ...kf, props: { ...kf.props }, bezier: kf.bezier ? [...kf.bezier] as [number, number, number, number] : undefined })),
    propertyKeyframes: layer.propertyKeyframes
      ? Object.fromEntries(
        Object.entries(layer.propertyKeyframes).map(([key, frames]) => [
          key,
          (frames ?? []).map((kf) => ({ ...kf, bezier: kf.bezier ? [...kf.bezier] as [number, number, number, number] : undefined })),
        ]),
      ) as Layer['propertyKeyframes']
      : undefined,
    gradientStops: layer.gradientStops.map((stop) => ({ ...stop })),
    textSpans: layer.textSpans?.map((span) => ({ ...span })),
  }
}

function copySelectedLayers(store: ReturnType<typeof useStore.getState>) {
  if (!store.selectedLayerIds.length) return false
  const layers = selectedWithDescendants(store.layers, store.selectedLayerIds).map(cloneLayer)
  if (!layers.length) return false
  layerClipboard = {
    layers,
    rootLayerIds: rootLayerIds(layers),
    pasteCount: 0,
  }
  clipboardKind = 'layer'
  return true
}

function offsetRootLayers(layers: Layer[], rootIds: string[], offset: number) {
  const roots = new Set(rootIds)
  return layers.map((layer) => {
    if (!roots.has(layer.id)) return cloneLayer(layer)
    return {
      ...cloneLayer(layer),
      keyframes: layer.keyframes.map((kf) => ({
        ...kf,
        props: {
          ...kf.props,
          x: (kf.props.x ?? 0) + offset,
          y: (kf.props.y ?? 0) + offset,
        },
      })),
      propertyKeyframes: layer.propertyKeyframes
        ? {
          ...layer.propertyKeyframes,
          x: layer.propertyKeyframes.x?.map((kf) => ({ ...kf, value: typeof kf.value === 'number' ? kf.value + offset : kf.value })),
          y: layer.propertyKeyframes.y?.map((kf) => ({ ...kf, value: typeof kf.value === 'number' ? kf.value + offset : kf.value })),
        }
        : undefined,
    }
  })
}

function selectedPasteParentId(store: ReturnType<typeof useStore.getState>) {
  if (store.selectedLayerIds.length !== 1) return null
  const layer = store.layers.find((item) => item.id === store.selectedLayerIds[0])
  return layer && (layer.type === 'group' || layer.isGroup) ? layer.id : null
}

function pasteLayerClipboard(store: ReturnType<typeof useStore.getState>) {
  if (!layerClipboard?.layers.length) return false
  const parentId = selectedPasteParentId(store)
  layerClipboard.pasteCount += 1
  const offset = 24 * layerClipboard.pasteCount
  store.insertLibraryLayers(offsetRootLayers(layerClipboard.layers, layerClipboard.rootLayerIds, offset), {
    rootLayerIds: layerClipboard.rootLayerIds,
    parentId,
  })
  clipboardKind = 'layer'
  return true
}

export function useKeyboardShortcuts() {
  const store = useStore()

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName.toLowerCase()
      const isEditing = tag === 'input' || tag === 'textarea' || (e.target as HTMLElement).isContentEditable
      if (isEditing) return

      // Undo / Redo
      if (e.key === 'z' && (e.ctrlKey || e.metaKey) && e.shiftKey) {
        e.preventDefault(); store.redo(); return
      }
      if (e.key === 'z' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault(); store.undo(); return
      }

      // Clipboard
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c' && store.selectedKeyframes.length) {
        e.preventDefault()
        copySelectedKeyframes(store)
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c' && store.selectedLayerIds.length) {
        e.preventDefault()
        copySelectedLayers(store)
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'x' && store.selectedKeyframes.length) {
        e.preventDefault()
        if (copySelectedKeyframes(store)) store.deleteSelectedKeyframes()
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v' && clipboardKind === 'layer' && layerClipboard?.layers.length) {
        e.preventDefault()
        pasteLayerClipboard(store)
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v' && clipboardKind === 'keyframe' && keyframeClipboard.length) {
        e.preventDefault()
        pasteKeyframeClipboard(store)
        return
      }

      // Parenting / ordering
      if ((e.ctrlKey || e.metaKey) && e.key === ']') {
        e.preventDefault(); store.moveSelectedUpLevel(); return
      }
      if ((e.ctrlKey || e.metaKey) && e.key === '[') {
        e.preventDefault(); store.moveSelectedIntoPreviousGroup(); return
      }
      if ((e.ctrlKey || e.metaKey) && e.altKey && e.key.toLowerCase() === 'g') {
        e.preventDefault(); store.groupSelected(); return
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'g') {
        e.preventDefault(); store.selectedLayerIds.forEach((id) => store.ungroupLayer(id)); return
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'g') {
        e.preventDefault(); store.groupSelected(); return
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'ArrowUp') {
        e.preventDefault(); store.moveSelectedWithinParent(-1); return
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'ArrowDown') {
        e.preventDefault(); store.moveSelectedWithinParent(1); return
      }

      // Tool shortcuts
      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        if (e.key === 'v' || e.key === 'V') { store.setTool('select'); return }
        if (e.key === 'h' || e.key === 'H') { store.setTool('hand'); return }
        if (e.key === 'r' || e.key === 'R') { store.setTool('rectangle'); return }
        if (e.key === 'e' || e.key === 'E') { store.setTool('ellipse'); return }
        if (e.key === 't' || e.key === 'T') { store.setTool('text'); return }
        if (e.key === 'l' || e.key === 'L') { store.setTool('line'); return }
        if (e.key === 'p' || e.key === 'P') { store.setTool('pen'); return }
      }

      // Playback
      if (e.key === ' ') {
        e.preventDefault()
        store.setPlaying(!store.isPlaying)
        return
      }

      // Delete selected layers
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        if (store.selectedKeyframes.length) {
          store.deleteSelectedKeyframes()
          return
        }
        store.selectedLayerIds.forEach((id) => store.deleteLayer(id))
        return
      }

      // Arrow keys to nudge x/y
      const { selectedLayerIds, selectedKeyframes, currentFrame, autoKeyframe, addKeyframe, setLayerAnimatedProperty, layers } = store
      const step = e.shiftKey ? 10 : 1
      if (selectedKeyframes.length && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        e.preventDefault()
        store.moveSelectedKeyframes(e.key === 'ArrowLeft' ? -step : step)
        return
      }
      if (!selectedLayerIds.length) return

      let dx = 0, dy = 0
      if (e.key === 'ArrowLeft') { e.preventDefault(); dx = -step }
      if (e.key === 'ArrowRight') { e.preventDefault(); dx = step }
      if (e.key === 'ArrowUp') { e.preventDefault(); dy = -step }
      if (e.key === 'ArrowDown') { e.preventDefault(); dy = step }

      if (dx !== 0 || dy !== 0) {
        getKeyboardMoveLayerIds(layers, selectedLayerIds).forEach((id) => {
          const layer = layers.find((l) => l.id === id)
          if (!layer) return
          const props = interpolateProps(currentFrame, layer.keyframes)
          if (autoKeyframe) {
            addKeyframe(id, currentFrame, { ...props, x: props.x + dx, y: props.y + dy })
          } else {
            if (dx !== 0) setLayerAnimatedProperty(id, 'x', props.x + dx)
            if (dy !== 0) setLayerAnimatedProperty(id, 'y', props.y + dy)
          }
        })
      }

      // Duplicate
      if (e.key === 'd' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        selectedLayerIds.forEach((id) => store.duplicateLayer(id))
      }

      // Video segment shortcuts — operate on the selected video layer (under playhead)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        const videoLayerId = selectedLayerIds.find((id) => layers.find((l) => l.id === id)?.type === 'video')
        if (videoLayerId) {
          e.preventDefault()
          store.splitVideoAt(videoLayerId, currentFrame)
        }
        return
      }
      if (e.shiftKey && !e.ctrlKey && !e.metaKey && (e.key === 'F' || e.key === 'f')) {
        const videoLayerId = selectedLayerIds.find((id) => layers.find((l) => l.id === id)?.type === 'video')
        if (videoLayerId) {
          const seg = store.selectActiveSegment(videoLayerId, currentFrame)
          if (seg) {
            e.preventDefault()
            store.freezeSegment(videoLayerId, seg.id)
          }
        }
        return
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [store])
}
