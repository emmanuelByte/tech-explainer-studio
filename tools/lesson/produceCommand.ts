import { access } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
import { THEME_IDS, type ThemeId } from '../../src/domains/lesson-spec/theme'
import { authorFromScript } from './author'
import { ASPECT_CANVAS, produce, StageError, type Aspect } from './pipeline'
import type { Quality } from './render'

export const PRODUCE_USAGE = `Usage: npm run produce -- <lessons/x.lesson.json | --script script.md> [options]

  --aspect 16:9|9:16|both   output format(s)                       (default 16:9)
  --theme dark-sketch|clean-technical   override the spec's theme
  --quality draft|standard|high         draft is half size, for checking  (default standard)
  --voice <id>  --exaggeration <n>  --cfg <n>  --worker <url>   voice settings
  --narration local|none    "none" makes a silent video, no voice worker needed
  --out <path>              .mp4 file (one aspect) or directory (default data/exports/)
  --no-stills               skip the per-scene frames
  --force                   redo every stage
  --allow-lint-errors       render even if lint finds layout errors
  --script <file>           author the spec from a plain script first
  --author codex|claude|"<command>"   agent that writes the spec     (default codex)
  --spec <file>             where to write an authored spec          (default lessons/<script name>.lesson.json)
`

function parse(argv: string[]) {
  const values = new Map<string, string>()
  const flags = new Set<string>()
  const positional: string[] = []
  const withValue = new Set(['aspect', 'theme', 'quality', 'voice', 'exaggeration', 'cfg', 'worker', 'narration', 'out', 'script', 'author', 'spec'])
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (!arg.startsWith('--')) { positional.push(arg); continue }
    const name = arg.slice(2)
    if (withValue.has(name)) {
      const value = argv[i + 1]
      if (value === undefined || value.startsWith('--')) throw new Error(`--${name} needs a value.\n\n${PRODUCE_USAGE}`)
      values.set(name, value)
      i += 1
    } else flags.add(name)
  }
  return { values, flags, positional }
}

function choice<T extends string>(name: string, value: string | undefined, allowed: readonly T[], fallback: T): T {
  if (value === undefined) return fallback
  if (!(allowed as readonly string[]).includes(value)) throw new Error(`--${name} must be one of: ${allowed.join(', ')}.`)
  return value as T
}

export async function produceCommand(root: string, argv: string[]) {
  const { values, flags, positional } = parse(argv)
  const known = new Set(['no-stills', 'force', 'allow-lint-errors'])
  for (const flag of flags) if (!known.has(flag)) throw new Error(`Unknown option --${flag}.\n\n${PRODUCE_USAGE}`)
  const log = (line: string) => console.log(line)

  let specPath: string
  const script = values.get('script')
  if (script) {
    const slug = basename(script).replace(/(\.script)?\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    specPath = resolve(process.cwd(), values.get('spec') ?? `lessons/${slug}.lesson.json`)
    await authorFromScript({ root, scriptPath: resolve(process.cwd(), script), specPath, agent: values.get('author') ?? 'codex', maxAttempts: 3, log })
  } else if (positional[0]) {
    specPath = resolve(process.cwd(), positional[0])
    try { await access(specPath) } catch { throw new Error(`No such lesson spec: ${specPath}\n\n${PRODUCE_USAGE}`) }
  } else {
    throw new Error(PRODUCE_USAGE)
  }

  const aspectChoice = choice('aspect', values.get('aspect'), ['16:9', '9:16', 'both'] as const, '16:9')
  const aspects: Aspect[] = aspectChoice === 'both' ? (Object.keys(ASPECT_CANVAS) as Aspect[]) : [aspectChoice]
  const results = await produce({
    root,
    specPath,
    aspects,
    theme: values.has('theme') ? choice<ThemeId>('theme', values.get('theme'), THEME_IDS, 'dark-sketch') : undefined,
    voice: values.get('voice') ?? 'baseVoice',
    exaggeration: Number(values.get('exaggeration') ?? 0.5),
    cfgWeight: Number(values.get('cfg') ?? 0.5),
    workerUrl: values.get('worker') ?? 'http://127.0.0.1:8123',
    narration: choice('narration', values.get('narration'), ['local', 'none'] as const, 'local'),
    quality: choice<Quality>('quality', values.get('quality'), ['draft', 'standard', 'high'], 'standard'),
    out: values.get('out'),
    stills: !flags.has('no-stills'),
    force: flags.has('force'),
    allowLintErrors: flags.has('allow-lint-errors'),
    log,
  })
  console.log('\nDone:')
  for (const result of results) console.log(`  ${result.aspect}  ${result.videoPath}  (ran: ${result.ran.join(', ') || 'nothing'}; reused: ${result.reused.join(', ') || 'nothing'})`)
  console.log('Review it at /review/<project id> in the app (npm run dev), or play the MP4.')
}

export function reportFailure(error: unknown) {
  if (error instanceof StageError) {
    console.error(`\nStopped at stage "${error.stage}": ${error.message}`)
    if (error.hint) console.error(`\nNext: ${error.hint}`)
    console.error('\nFinished stages are saved. Run the same command again to resume.')
  } else {
    console.error(error instanceof Error ? error.message : error)
  }
}
