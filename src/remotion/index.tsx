import { useEffect, useRef } from 'react'
import { Composition, continueRender, delayRender, registerRoot, staticFile } from 'remotion'
import { EditorComposition } from './Composition'
import { GOOGLE_FONTS, Layer, MotionProject } from '../types'
import { migrateProject } from '../domains/project/migrations'
import assetIndex from '../../data/assets/index.json'

type RenderProps = Partial<MotionProject> & {
  layers?: Layer[]
  canvasWidth?: number
  canvasHeight?: number
  backgroundColor?: string
  showOutsideCanvas?: boolean
}

const fallbackProps: RenderProps = {
  layers: [],
  canvas: {
    width: 1080,
    height: 1080,
    fps: 30,
    durationFrames: 1,
    backgroundColor: '#ffffff',
    presetName: 'Custom',
  },
  editor: {
    zoom: 1,
    panX: 0,
    panY: 0,
    selectedLayerIds: [],
    playheadFrame: 0,
    showOutsideCanvas: false,
  },
}

const GOOGLE_FONTS_STYLESHEET =
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=Lato:wght@300;400;700;900&family=Montserrat:wght@300;400;500;600;700;800;900&family=Open+Sans:wght@300;400;500;600;700;800&family=Oswald:wght@300;400;500;600;700&family=Playfair+Display:wght@400;500;600;700;800;900&family=Poppins:wght@300;400;500;600;700;800;900&family=Raleway:wght@300;400;500;600;700;800;900&family=Roboto:wght@300;400;500;700;900&family=Space+Grotesk:wght@300;400;500;600;700&display=swap'

const FONT_WEIGHTS = [300, 400, 500, 600, 700, 800, 900]
let editorFontsReady: Promise<void> | null = null

function ensureLink(rel: string, href: string, attrs: Record<string, string> = {}) {
  if (document.querySelector(`link[rel="${rel}"][href="${href}"]`)) return
  const link = document.createElement('link')
  link.rel = rel
  link.href = href
  Object.entries(attrs).forEach(([key, value]) => link.setAttribute(key, value))
  document.head.appendChild(link)
}

function loadEditorFonts() {
  if (typeof document === 'undefined') return Promise.resolve()
  if (editorFontsReady) return editorFontsReady

  ensureLink('preconnect', 'https://fonts.googleapis.com')
  ensureLink('preconnect', 'https://fonts.gstatic.com', { crossorigin: 'anonymous' })
  ensureLink('stylesheet', GOOGLE_FONTS_STYLESHEET, { 'data-editor-fonts': 'google' })

  if (!document.fonts) {
    editorFontsReady = Promise.resolve()
    return editorFontsReady
  }

  const fontLoads = GOOGLE_FONTS.flatMap((family) =>
    FONT_WEIGHTS.map((weight) => document.fonts.load(`${weight} 16px "${family}"`))
  )

  editorFontsReady = Promise.allSettled([...fontLoads, document.fonts.ready]).then(() => undefined)
  return editorFontsReady
}

function FontPreloader() {
  const handleRef = useRef<number | null>(null)
  const continuedRef = useRef(false)

  if (handleRef.current === null) {
    handleRef.current = delayRender('Loading editor fonts')
  }

  useEffect(() => {
    const handle = handleRef.current
    if (handle === null) return

    const finish = () => {
      if (continuedRef.current) return
      continuedRef.current = true
      continueRender(handle)
    }

    const timeout = window.setTimeout(finish, 5000)
    loadEditorFonts()
      .catch(() => undefined)
      .finally(() => {
        window.clearTimeout(timeout)
        finish()
      })

    return () => window.clearTimeout(timeout)
  }, [])

  return null
}

const assetFileById = new Map(
  (assetIndex as { id: string; fileName: string }[]).map((asset) => [asset.id, asset.fileName])
)

function resolveAssetSrc(src?: string) {
  const match = src?.match(/^\/api\/assets\/([^/]+)\/file$/)
  if (!match) return src
  const fileName = assetFileById.get(match[1])
  return fileName ? staticFile(`assets/files/${fileName}`) : src
}

function resolveLayerAssets(layers: Layer[]) {
  return layers.map((layer) => ({
    ...layer,
    src: resolveAssetSrc(layer.src),
  }))
}

function isPersistedProject(props: RenderProps): props is MotionProject {
  return typeof props.id === 'string'
    && typeof props.name === 'string'
    && Boolean(props.canvas)
    && Array.isArray(props.layers)
    && Boolean(props.timeline)
    && Boolean(props.editor)
}

function projectValues(props: RenderProps) {
  const projectProps: RenderProps = isPersistedProject(props) ? migrateProject(props) : props
  const canvas = projectProps.canvas ?? fallbackProps.canvas!
  return {
    layers: resolveLayerAssets(projectProps.layers ?? []),
    width: projectProps.canvasWidth ?? canvas.width,
    height: projectProps.canvasHeight ?? canvas.height,
    fps: canvas.fps,
    durationInFrames: Math.max(1, canvas.durationFrames),
    backgroundColor: projectProps.backgroundColor ?? canvas.backgroundColor,
    showOutsideCanvas: projectProps.showOutsideCanvas ?? projectProps.editor?.showOutsideCanvas ?? false,
  }
}

function ProjectComposition(props: RenderProps) {
  const project = projectValues(props)
  return (
    <>
      <FontPreloader />
      <EditorComposition
        layers={project.layers}
        canvasWidth={project.width}
        canvasHeight={project.height}
        backgroundColor={project.backgroundColor}
        showOutsideCanvas={project.showOutsideCanvas}
      />
    </>
  )
}

function RemotionRoot() {
  return (
    <Composition
      id="EditorComposition"
      component={ProjectComposition}
      defaultProps={fallbackProps}
      durationInFrames={fallbackProps.canvas!.durationFrames}
      fps={fallbackProps.canvas!.fps}
      width={fallbackProps.canvas!.width}
      height={fallbackProps.canvas!.height}
      calculateMetadata={({ props }) => {
        const project = projectValues(props as RenderProps)
        return {
          durationInFrames: project.durationInFrames,
          fps: project.fps,
          width: project.width,
          height: project.height,
        }
      }}
    />
  )
}

registerRoot(RemotionRoot)
