import { useEffect, useRef } from 'react'
import { useStore } from '../store'

export function usePlayback() {
  const { isPlaying, fps, currentFrame, totalFrames, loopIn, loopOut, loopEnabled, setCurrentFrame, setPlaying } =
    useStore()
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

    const spf = 1000 / fps
    const inPoint = loopEnabled && loopIn !== null ? loopIn : 0
    const outPoint = loopEnabled && loopOut !== null ? loopOut : totalFrames - 1

    function tick(now: number) {
      if (lastTimeRef.current === null) lastTimeRef.current = now
      const elapsed = now - lastTimeRef.current
      if (elapsed >= spf) {
        const advance = Math.floor(elapsed / spf)
        lastTimeRef.current = now - (elapsed % spf)
        const next = frameRef.current + advance
        if (next > outPoint) {
          if (loopEnabled) {
            setCurrentFrame(inPoint)
          } else {
            setCurrentFrame(outPoint)
            setPlaying(false)
            return
          }
        } else {
          setCurrentFrame(next)
        }
      }
      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current) }
  }, [isPlaying, fps, totalFrames, loopIn, loopOut, loopEnabled])
}
