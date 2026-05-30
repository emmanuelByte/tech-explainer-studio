import { useTranslation } from 'react-i18next'
import {
  Circle, Hand, MousePointer2, PenLine, Slash, Square, Triangle, Type,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useStore } from '../store'
import type { Tool } from '../types'

interface ToolDef {
  id: Tool
  label: string
  key: string
  icon: LucideIcon
}

/* Three logical groups divided by thin separators, like Figma's bottom dock. */
const POINTER_TOOLS: ToolDef[] = [
  { id: 'select', label: 'Select', key: 'V', icon: MousePointer2 },
  { id: 'hand', label: 'Pan', key: 'H', icon: Hand },
]

const SHAPE_TOOLS: ToolDef[] = [
  { id: 'rectangle', label: 'Rectangle', key: 'R', icon: Square },
  { id: 'ellipse', label: 'Ellipse', key: 'E', icon: Circle },
  { id: 'triangle', label: 'Triangle', key: '', icon: Triangle },
  { id: 'line', label: 'Line', key: 'L', icon: Slash },
]

const DRAWING_TOOLS: ToolDef[] = [
  { id: 'text', label: 'Text', key: 'T', icon: Type },
  { id: 'pen', label: 'Pen', key: 'P', icon: PenLine },
]

function ToolButton({ tool }: { tool: ToolDef }) {
  const { t } = useTranslation()
  const currentTool = useStore((s) => s.currentTool)
  const setTool = useStore((s) => s.setTool)
  const Icon = tool.icon
  const active = currentTool === tool.id
  const label = t(`tools.${tool.id}`, { defaultValue: tool.label })
  return (
    <button
      onClick={() => setTool(tool.id)}
      title={`${label}${tool.key ? ` (${tool.key})` : ''}`}
      className={`icon-btn ${active ? 'active' : ''}`}
      style={{ width: 30, height: 30, minWidth: 30, borderRadius: 5 }}
    >
      <Icon size={15} strokeWidth={2.2} />
    </button>
  )
}

function Divider() {
  return (
    <div
      style={{
        width: 1,
        height: 18,
        background: 'var(--border)',
        opacity: 0.7,
        flexShrink: 0,
        margin: '0 2px',
      }}
    />
  )
}

/**
 * Figma-style floating tool dock. Pinned to the bottom-center of the canvas
 * viewport, above the timeline. Uses panel/border/shadow tokens so it sits
 * cleanly on top of the canvas in both light and dark modes.
 */
export function FloatingToolbar() {
  return (
    <div
      role="toolbar"
      aria-label="Tools"
      style={{
        position: 'absolute',
        bottom: 14,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        padding: 4,
        background: 'var(--panel)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        boxShadow: '0 1px 0 rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.18)',
        zIndex: 50,
        // Stops marquee/drag handlers on the canvas from firing through the dock.
        pointerEvents: 'auto',
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {POINTER_TOOLS.map((tool) => <ToolButton key={tool.id} tool={tool} />)}
      <Divider />
      {SHAPE_TOOLS.map((tool) => <ToolButton key={tool.id} tool={tool} />)}
      <Divider />
      {DRAWING_TOOLS.map((tool) => <ToolButton key={tool.id} tool={tool} />)}
    </div>
  )
}
