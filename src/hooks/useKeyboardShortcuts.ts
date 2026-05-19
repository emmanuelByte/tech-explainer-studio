import { useEffect } from 'react'
import { useStore } from '../store'
import { interpolateProps } from '../remotion/interpolateProps'

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
      const { selectedLayerIds, currentFrame, addKeyframe, layers } = store
      if (!selectedLayerIds.length) return
      const step = e.shiftKey ? 10 : 1

      let dx = 0, dy = 0
      if (e.key === 'ArrowLeft') { e.preventDefault(); dx = -step }
      if (e.key === 'ArrowRight') { e.preventDefault(); dx = step }
      if (e.key === 'ArrowUp') { e.preventDefault(); dy = -step }
      if (e.key === 'ArrowDown') { e.preventDefault(); dy = step }

      if (dx !== 0 || dy !== 0) {
        selectedLayerIds.forEach((id) => {
          const layer = layers.find((l) => l.id === id)
          if (!layer) return
          const props = interpolateProps(currentFrame, layer.keyframes)
          addKeyframe(id, currentFrame, { ...props, x: props.x + dx, y: props.y + dy })
        })
      }

      // Duplicate
      if (e.key === 'd' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        selectedLayerIds.forEach((id) => store.duplicateLayer(id))
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [store])
}
