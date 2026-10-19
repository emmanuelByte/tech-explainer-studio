import { describe, expect, it } from 'vitest'
import { checkProbe, expectedVideo, renderArgs, type Probe } from './render'

const canvas = { width: 1080, height: 1920, fps: 30, durationFrames: 300 }
const good = (over: Partial<Probe['streams'][number]> = {}): Probe => ({
  streams: [
    { codec_type: 'video', codec_name: 'h264', width: 1080, height: 1920, r_frame_rate: '30/1', pix_fmt: 'yuv420p', ...over },
    { codec_type: 'audio', codec_name: 'aac' },
  ],
  format: { duration: '10.000000' },
})

describe('renderArgs', () => {
  it('renders every frame from first to last at the requested scale', () => {
    const args = renderArgs({ projectPath: 'p.json', outPath: 'o.mp4', quality: 'standard', durationFrames: 300 })
    expect(args).toContain('--frames=0-299')
    expect(args).toContain('--scale=1')
    expect(args).toContain('--public-dir=data')
  })

  it('never produces an empty frame range', () => {
    expect(renderArgs({ projectPath: 'p', outPath: 'o', quality: 'draft', durationFrames: 0 })).toContain('--frames=0-0')
  })
})

describe('expectedVideo', () => {
  it('is native size for standard and high, half size for draft', () => {
    expect(expectedVideo(canvas, 'standard', true)).toMatchObject({ width: 1080, height: 1920 })
    expect(expectedVideo(canvas, 'high', true)).toMatchObject({ width: 1080, height: 1920 })
    expect(expectedVideo(canvas, 'draft', true)).toMatchObject({ width: 540, height: 960 })
  })
})

describe('checkProbe', () => {
  const expected = expectedVideo(canvas, 'standard', true)

  it('accepts a matching file', () => {
    expect(checkProbe(expected, good())).toEqual([])
  })

  it('reports wrong dimensions, frame rate, codec and duration', () => {
    expect(checkProbe(expected, good({ width: 1920, height: 1080 }))[0]).toContain('1920x1080')
    expect(checkProbe(expected, good({ r_frame_rate: '25/1' }))[0]).toContain('Frame rate')
    expect(checkProbe(expected, good({ codec_name: 'vp9' }))[0]).toContain('codec')
    expect(checkProbe(expected, { ...good(), format: { duration: '3.0' } })[0]).toContain('Duration')
  })

  it('tolerates a frame of container rounding but not a missing tail', () => {
    expect(checkProbe(expected, { ...good(), format: { duration: '10.033' } })).toEqual([])
    expect(checkProbe(expected, { ...good(), format: { duration: '9.5' } })).not.toEqual([])
  })

  it('requires audio when the lesson is narrated and accepts either when it is silent', () => {
    const silent: Probe = { ...good(), streams: [good().streams[0]] }
    expect(checkProbe(expected, silent).join()).toContain('no audio')
    expect(checkProbe(expectedVideo(canvas, 'standard', false), good())).toEqual([])
    expect(checkProbe(expectedVideo(canvas, 'standard', false), silent)).toEqual([])
  })
})
