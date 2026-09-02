import { readdir, readFile } from 'node:fs/promises'
import { extname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const assetRoot = fileURLToPath(new URL('../src/domains/technical-components/assets', import.meta.url))

async function findSvgFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const nestedFiles = await Promise.all(entries.map(async (entry) => {
    const entryPath = join(directory, entry.name)
    if (entry.isDirectory()) return findSvgFiles(entryPath)
    return extname(entry.name).toLowerCase() === '.svg' ? [entryPath] : []
  }))
  return nestedFiles.flat().sort()
}

function validateSvg(source) {
  const rules = [
    ['an SVG root', /^<svg\b[^>]*>/],
    ['the standard viewBox', /<svg\b[^>]*\bviewBox="0 0 240 150"/],
    ['fill="none"', /<svg\b[^>]*\bfill="none"/],
    ['stroke="currentColor"', /<svg\b[^>]*\bstroke="currentColor"/],
    ['stroke-width="4"', /<svg\b[^>]*\bstroke-width="4"/],
    ['round line caps', /<svg\b[^>]*\bstroke-linecap="round"/],
    ['round line joins', /<svg\b[^>]*\bstroke-linejoin="round"/],
    ['image role', /<svg\b[^>]*\brole="img"/],
    ['title/description references', /<svg\b[^>]*\baria-labelledby="title desc"/],
    ['an accessible title', /<title id="title">[^<]+<\/title>/],
    ['an accessible description', /<desc id="desc">[^<]+<\/desc>/],
    ['a closing SVG tag', /<\/svg>\s*$/],
  ]

  const errors = rules
    .filter(([, expression]) => !expression.test(source))
    .map(([description]) => `missing ${description}`)

  if (/<text\b/i.test(source)) errors.push('contains embedded text')
  if (/#[0-9a-f]{3,8}\b/i.test(source)) errors.push('contains a hard-coded color')
  if (/\b(?:href|xlink:href)\s*=\s*["'](?:https?:|data:)/i.test(source)) {
    errors.push('contains an external or embedded resource')
  }

  return errors
}

const files = await findSvgFiles(assetRoot)
const failures = []

for (const file of files) {
  const source = await readFile(file, 'utf8')
  const errors = validateSvg(source)
  if (errors.length) failures.push({ file: relative(assetRoot, file), errors })
}

if (failures.length) {
  for (const failure of failures) {
    console.error(`${failure.file}:`)
    for (const error of failure.errors) console.error(`  - ${error}`)
  }
  process.exitCode = 1
} else {
  console.log(`Validated ${files.length} technical SVG assets.`)
}
