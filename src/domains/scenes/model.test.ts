import { describe, expect, it } from 'vitest'
import type { Scene } from '../../types'
import {
  createScenesForScript,
  addScene,
  mergeSceneWithNext,
  moveScene,
  normalizeScenes,
  sceneAtFrame,
  splitScene,
  splitScriptSegment,
  suggestedScriptSplitOffset,
  mergeScriptSegmentWithNext,
  updateScriptSegment,
  updateScene,
} from './model'

const scenes: Scene[] = [
  { id: 'one', title: 'One', startFrame: 0, endFrame: 30, scriptSegmentIds: ['a'] },
  { id: 'two', title: 'Two', startFrame: 30, endFrame: 60, scriptSegmentIds: ['b'] },
]

describe('scene timing', () => {
  it('sorts, clamps and prevents overlapping scene ranges', () => {
    expect(normalizeScenes([
      { id: 'two', title: 'Two', startFrame: 20, endFrame: 90, scriptSegmentIds: [] },
      { id: 'one', title: 'One', startFrame: -4, endFrame: 30, scriptSegmentIds: [] },
    ], 60)).toMatchObject([
      { id: 'one', startFrame: 0, endFrame: 30 },
      { id: 'two', startFrame: 30, endFrame: 60 },
    ])
  })

  it('keeps edits inside adjacent scene boundaries', () => {
    const edited = updateScene(scenes, 'one', { endFrame: 55 }, 60)
    expect(edited[0]).toMatchObject({ startFrame: 0, endFrame: 30 })
  })

  it('splits and merges a scene without losing timeline coverage', () => {
    const split = splitScene(scenes, 'one', 12, 60)
    expect(split).toHaveLength(3)
    expect(split[0].endFrame).toBe(12)
    expect(split[1]).toMatchObject({ startFrame: 12, endFrame: 30 })
    expect(mergeSceneWithNext(split, 'one', 60)[0]).toMatchObject({ startFrame: 0, endFrame: 30 })
  })

  it('finds the active scene with an exclusive end frame', () => {
    expect(sceneAtFrame(scenes, 29)?.id).toBe('one')
    expect(sceneAtFrame(scenes, 30)?.id).toBe('two')
  })

  it('inserts a new scene at the playhead by splitting the active range', () => {
    const result = addScene(scenes, 60, 12)
    expect(result).toHaveLength(3)
    expect(result[0]).toMatchObject({ id: 'one', startFrame: 0, endFrame: 12 })
    expect(result[1]).toMatchObject({ startFrame: 12, endFrame: 30, scriptSegmentIds: [] })
  })

  it('reorders scene content while preserving valid timeline ranges', () => {
    const result = moveScene(scenes, 'two', -1, 60)
    expect(result.map((scene) => scene.id)).toEqual(['two', 'one'])
    expect(result.map((scene) => [scene.startFrame, scene.endFrame])).toEqual([[0, 30], [30, 60]])
  })
})

describe('script helpers', () => {
  it('creates timed scenes from paragraph-separated script text', () => {
    const result = createScenesForScript({ rawText: 'First idea.\n\nSecond idea.', segments: [] }, 60)
    expect(result.script.segments).toHaveLength(2)
    expect(result.scenes).toMatchObject([
      { startFrame: 0, endFrame: 30 },
      { startFrame: 30, endFrame: 60 },
    ])
  })

  it('splits a script segment into two editable segments', () => {
    const result = splitScriptSegment({ rawText: 'First second', segments: [{ id: 'a', text: 'First second' }] }, 'a', 5)
    expect(result.segments.map((segment) => segment.text)).toEqual(['First', 'second'])
  })

  it('suggests a sentence boundary for a manual segment split', () => {
    const text = 'Explain the overload problem. Then introduce the load balancer.'
    expect(text.slice(0, suggestedScriptSplitOffset(text))).toBe('Explain the overload problem.')
  })

  it('edits and merges script segments while maintaining the raw script', () => {
    const script = { rawText: 'First\n\nSecond', segments: [{ id: 'a', text: 'First' }, { id: 'b', text: 'Second' }] }
    expect(updateScriptSegment(script, 'a', 'Updated').rawText).toBe('Updated\n\nSecond')
    expect(mergeScriptSegmentWithNext(script, 'a')).toMatchObject({
      removedSegmentId: 'b',
      script: { rawText: 'First Second', segments: [{ id: 'a', text: 'First Second' }] },
    })
  })
})
