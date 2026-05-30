import { useTranslation } from 'react-i18next'
import { Modal } from './Modal'
import { formatShortcut } from './TopMenu'

interface ShortcutRow {
  label: string
  /** Either a `mod+`-spec passed to formatShortcut, or a raw key list shown verbatim (e.g. ['↑', '↓']). */
  keys: string | string[]
}

interface ShortcutGroup {
  title: string
  rows: ShortcutRow[]
}

/* Single source of truth for every shortcut wired up in the editor.
   Keep this in sync with useKeyboardShortcuts + EditorScreen onKey. */
type TFn = (k: string, opts?: { defaultValue?: string }) => string
function buildGroups(t: TFn): ShortcutGroup[] {
  return [
    {
      title: t('shortcuts.general', { defaultValue: 'General' }),
      rows: [
        { label: t('shortcuts.save', { defaultValue: 'Save project' }), keys: 'mod+s' },
        { label: t('shortcuts.undo', { defaultValue: 'Undo' }), keys: 'mod+z' },
        { label: t('shortcuts.redo', { defaultValue: 'Redo' }), keys: 'mod+shift+z' },
        { label: t('shortcuts.deselect', { defaultValue: 'Deselect everything' }), keys: 'mod+d' },
        { label: t('shortcuts.toggleTimeline', { defaultValue: 'Toggle timeline' }), keys: 'mod+\\' },
        { label: t('shortcuts.showShortcuts', { defaultValue: 'Keyboard shortcuts' }), keys: '?' },
      ],
    },
    {
      title: t('shortcuts.view', { defaultValue: 'View' }),
      rows: [
        { label: t('shortcuts.preview', { defaultValue: 'Open preview' }), keys: 'mod+p' },
        { label: t('shortcuts.export', { defaultValue: 'Open export' }), keys: 'mod+e' },
        { label: t('shortcuts.playPause', { defaultValue: 'Play / pause' }), keys: 'Space' },
      ],
    },
    {
      title: t('shortcuts.tools', { defaultValue: 'Tools' }),
      rows: [
        { label: t('tools.select', { defaultValue: 'Select' }), keys: 'V' },
        { label: t('tools.hand', { defaultValue: 'Pan' }), keys: 'H' },
        { label: t('tools.rectangle', { defaultValue: 'Rectangle' }), keys: 'R' },
        { label: t('tools.ellipse', { defaultValue: 'Ellipse' }), keys: 'E' },
        { label: t('tools.text', { defaultValue: 'Text' }), keys: 'T' },
        { label: t('tools.line', { defaultValue: 'Line' }), keys: 'L' },
        { label: t('tools.pen', { defaultValue: 'Pen' }), keys: 'P' },
      ],
    },
    {
      title: t('shortcuts.edit', { defaultValue: 'Edit' }),
      rows: [
        { label: t('shortcuts.copy', { defaultValue: 'Copy selection' }), keys: 'mod+c' },
        { label: t('shortcuts.cut', { defaultValue: 'Cut keyframes' }), keys: 'mod+x' },
        { label: t('shortcuts.paste', { defaultValue: 'Paste' }), keys: 'mod+v' },
        { label: t('shortcuts.delete', { defaultValue: 'Delete selection' }), keys: ['Delete', '⌫'] },
      ],
    },
    {
      title: t('shortcuts.move', { defaultValue: 'Move & nudge' }),
      rows: [
        { label: t('shortcuts.nudge1', { defaultValue: 'Nudge 1px' }), keys: ['←', '↑', '↓', '→'] },
        { label: t('shortcuts.nudge10', { defaultValue: 'Nudge 10px' }), keys: 'shift+←' },
        { label: t('shortcuts.moveKf', { defaultValue: 'Move keyframes left / right' }), keys: ['←', '→'] },
      ],
    },
    {
      title: t('shortcuts.groupOrder', { defaultValue: 'Group & order' }),
      rows: [
        { label: t('shortcuts.group', { defaultValue: 'Group selection' }), keys: 'mod+g' },
        { label: t('shortcuts.ungroup', { defaultValue: 'Ungroup' }), keys: 'mod+shift+g' },
        { label: t('shortcuts.outdent', { defaultValue: 'Move up a level' }), keys: 'mod+]' },
        { label: t('shortcuts.indent', { defaultValue: 'Move into previous group' }), keys: 'mod+[' },
        { label: t('shortcuts.reorderUp', { defaultValue: 'Reorder up in parent' }), keys: 'mod+shift+↑' },
        { label: t('shortcuts.reorderDown', { defaultValue: 'Reorder down in parent' }), keys: 'mod+shift+↓' },
      ],
    },
    {
      title: t('shortcuts.penTool', { defaultValue: 'Pen tool (while drawing)' }),
      rows: [
        { label: t('shortcuts.penClose', { defaultValue: 'Close path' }), keys: 'C' },
        { label: t('shortcuts.penFinish', { defaultValue: 'Finish path' }), keys: 'Enter' },
        { label: t('shortcuts.penCancel', { defaultValue: 'Cancel path' }), keys: 'Esc' },
      ],
    },
    {
      title: t('shortcuts.video', { defaultValue: 'Video & segments' }),
      rows: [
        { label: t('shortcuts.splitVideo', { defaultValue: 'Split video at playhead' }), keys: 'mod+b' },
        { label: t('shortcuts.freezeSegment', { defaultValue: 'Freeze segment under playhead' }), keys: 'shift+F' },
      ],
    },
  ]
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: 22,
        height: 22,
        padding: '0 6px',
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: '0.03em',
        fontFamily: "'JetBrains Mono', ui-monospace, monospace",
        color: 'var(--text)',
        background: 'var(--panel2)',
        border: '1px solid var(--border)',
        borderRadius: 4,
        boxShadow: '0 1px 0 rgba(0,0,0,0.06)',
      }}
    >
      {children}
    </span>
  )
}

function ShortcutKeys({ keys }: { keys: string | string[] }) {
  // Single mod-spec like 'mod+shift+z' → one kbd with the formatted glyphs.
  if (typeof keys === 'string' && /\+/.test(keys) && keys.includes('mod')) {
    return <Kbd>{formatShortcut(keys)}</Kbd>
  }
  // Array of raw keys → render each as its own kbd with thin separators.
  const list = typeof keys === 'string' ? [keys] : keys
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      {list.map((k, i) => (
        <Kbd key={`${k}-${i}`}>{k}</Kbd>
      ))}
    </div>
  )
}

/**
 * Lists every keyboard shortcut wired into the editor, grouped by area.
 * Opened from View ▸ Keyboard shortcuts or the `?` key.
 */
export function ShortcutsModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const groups = buildGroups(t as unknown as TFn)
  return (
    <Modal
      title={t('shortcuts.title', { defaultValue: 'Keyboard shortcuts' })}
      onClose={onClose}
      width={640}
      zIndex={2500}
    >
      <div style={{
        padding: '14px 16px 18px',
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '18px 28px',
      }}>
        {groups.map((group) => (
          <div key={group.title} style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
            <div
              style={{
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--section-header)',
                marginBottom: 2,
              }}
            >
              {group.title}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {group.rows.map((row, i) => (
                <div
                  key={`${row.label}-${i}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                    minHeight: 28,
                    padding: '4px 0',
                    borderBottom: i === group.rows.length - 1 ? 'none' : '1px solid var(--border2)',
                  }}
                >
                  <span style={{
                    fontSize: 11,
                    color: 'var(--text)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>{row.label}</span>
                  <ShortcutKeys keys={row.keys} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Modal>
  )
}
