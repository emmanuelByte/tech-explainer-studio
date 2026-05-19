import { useEffect, useRef } from 'react'
import { useStore } from '../store'

export function usePlayback() {
  const { isPlaying, fps, currentFrame, totalFrames, setCurrentFrame, setPlaying } = useStore()
  const rafRef = useRef<number | null>(null)
  const lastTimeRef = useRef<number | null>(null)
  const frameRef = useRef(currentFrame)

  frameRef.current = currentFrame

  useEffect(() => {
    if (!isPlaying) {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      lastTimeRef.current = null
      return
    }

    const spf = 1000 / fps  // ms per frame

    function tick(now: number) {
      if (lastTimeRef.current === null) {
        lastTimeRef.current = now
      }
      const elapsed = now - lastTimeRef.current
      if (elapsed >= spf) {
        const advance = Math.floor(elapsed / spf)
        lastTimeRef.current = now - (elapsed % spf)
        const next = frameRef.current + advance
        if (next >= totalFrames) {
          setCurrentFrame(0)
          setPlaying(false)
          return
        }
        setCurrentFrame(next)
      }
      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [isPlaying, fps, totalFrames])
}
