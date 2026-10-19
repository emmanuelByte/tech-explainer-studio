import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { LessonSpecError } from '../../src/domains/lesson-spec/compile'
import { lintLesson } from '../../src/domains/lesson-spec/lint'
import { compileLessonSpec } from '../../src/domains/lesson-spec/compile'
import type { LessonSpec } from '../../src/domains/lesson-spec/types'
import { validateLessonSpec } from '../../src/domains/lesson-spec/validate'
import { loadArtwork } from './artwork'
import { ASPECT_CANVAS } from './pipeline'

/**
 * Hands a plain teaching script to an AI agent CLI that writes the lesson spec.
 * Nothing here interprets the script: the agent does, guided by
 * docs/AUTHORING_GUIDE.md. Our part is the loop around it: validate and lint
 * the spec, and give the agent concrete errors to correct, a few times.
 */
export interface AuthorOptions {
  root: string
  scriptPath: string
  /** Where the spec is written (absolute). */
  specPath: string
  /** `codex` or `claude`, or a shell command that reads the prompt on stdin. */
  agent: string
  maxAttempts: number
  log: (line: string) => void
}

export function agentCommand(agent: string): { command: string; args: string[] } {
  if (agent === 'codex') return { command: 'codex', args: ['exec', '--sandbox', 'workspace-write', '-'] }
  if (agent === 'claude') return { command: 'claude', args: ['-p', '--permission-mode', 'acceptEdits'] }
  return { command: '/bin/sh', args: ['-c', agent] }
}

export function authoringPrompt(guide: string, script: string, specPath: string, problems: string[]) {
  const head = `You are authoring a lesson spec for Tech Explainer Studio.\n\nWrite the finished spec as JSON to this file (create or overwrite it): ${specPath}\nDo not edit any other file. Follow the guide below exactly.\n`
  const fix = problems.length
    ? `\nYour previous version of ${specPath} has these problems. Read it, fix every one, and write it back:\n${problems.map((problem) => `- ${problem}`).join('\n')}\n`
    : ''
  return `${head}${fix}\n=== AUTHORING GUIDE ===\n${guide}\n\n=== TEACHING SCRIPT ===\n${script}\n`
}

function runAgent(root: string, agent: string, prompt: string, log: (line: string) => void) {
  const { command, args } = agentCommand(agent)
  return new Promise<void>((done, fail) => {
    const child = spawn(command, args, { cwd: root, stdio: ['pipe', 'pipe', 'pipe'] })
    child.stdout.on('data', (chunk: Buffer) => { for (const line of chunk.toString().split('\n')) if (line.trim()) log(`  [${agent}] ${line.slice(0, 160)}`) })
    let stderr = ''
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString() })
    child.on('error', (error) => fail(new Error(`Could not start the authoring agent "${agent}": ${error.message}. Install it, or write the spec by hand following docs/AUTHORING_GUIDE.md and run produce on the JSON file.`)))
    child.on('close', (code) => (code === 0 ? done() : fail(new Error(`The authoring agent "${agent}" exited with code ${code}.\n${stderr.trim().split('\n').slice(-8).join('\n')}`))))
    child.stdin.end(prompt)
  })
}

/** Problems a reviewer would raise about a spec in both output formats; empty when it is ready to produce. */
export async function specProblems(root: string, specPath: string): Promise<string[]> {
  let spec: unknown
  try {
    spec = JSON.parse(await readFile(specPath, 'utf-8'))
  } catch (error) {
    return [`${specPath} is missing or is not valid JSON (${(error as Error).message}).`]
  }
  const issues = validateLessonSpec(spec)
  if (issues.length) return issues.map((issue) => `${issue.path || '(root)'}: ${issue.message}`)
  const artwork = await loadArtwork(root)
  const problems: string[] = []
  for (const [aspect, canvas] of Object.entries(ASPECT_CANVAS)) {
    try {
      const project = compileLessonSpec(spec, { artwork, now: '2026-01-01T00:00:00.000Z', canvas })
      for (const issue of lintLesson(spec as LessonSpec, project)) {
        if (issue.severity === 'error') problems.push(`${aspect} lint [${issue.scene}] ${issue.rule}: ${issue.message}`)
      }
    } catch (error) {
      problems.push(error instanceof LessonSpecError ? error.message : (error as Error).message)
    }
  }
  return problems
}

export async function authorFromScript(options: AuthorOptions) {
  const script = await readFile(options.scriptPath, 'utf-8')
  const guide = await readFile(resolve(options.root, 'docs', 'AUTHORING_GUIDE.md'), 'utf-8')
  let problems: string[] = []
  for (let attempt = 1; attempt <= options.maxAttempts; attempt += 1) {
    options.log(`[author] attempt ${attempt}/${options.maxAttempts}: asking ${options.agent} to ${problems.length ? 'correct the spec' : 'write the spec'}...`)
    await runAgent(options.root, options.agent, authoringPrompt(guide, script, options.specPath, problems), options.log)
    problems = await specProblems(options.root, options.specPath)
    if (!problems.length) {
      options.log(`[author] ${options.specPath} validates and lints clean in 16:9 and 9:16`)
      return
    }
    options.log(`[author] ${problems.length} problem(s) found:\n${problems.map((problem) => `    ${problem}`).join('\n')}`)
  }
  throw new Error(`The authored spec still has problems after ${options.maxAttempts} attempts:\n${problems.map((problem) => `  ${problem}`).join('\n')}\nEdit ${options.specPath} by hand, then run produce on it.`)
}
