/**
 * data/assets/index.json is local runtime state (it lists narration audio) and
 * is not tracked, so a fresh clone has no such file. This keeps type-checking
 * working there; renders create the empty list when it is missing (see
 * ensureAssetIndex in tools/lesson/render.ts).
 */
declare module '*/assets/index.json' {
  const assets: { id: string; fileName: string }[]
  export default assets
}
