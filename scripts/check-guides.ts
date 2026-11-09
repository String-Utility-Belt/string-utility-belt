/**
 * Checks utility guides (`src/utilities/<id>/guide.md`) against the rules in
 * `src/utilities/guideCheck.ts` — the same check `guides.test.ts` runs — but
 * loads only the utilities named, so it is quick while writing a guide:
 *
 *   npm run check:guides -- base64_encode pad     (no ids: every utility)
 *
 * A failing worked example prints the actual output next to the expected one.
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { MANIFEST } from '../src/utilities/_generated/manifest'
import { LOADERS } from '../src/utilities/_generated/loaders'
import { PRESET_INDEX } from '../src/presets/_generated/index'
import { checkGuide } from '../src/utilities/guideCheck'

/** DOM-dependent utilities (see `env: ['dom']`) get the same jsdom the test suite runs them under. */
async function installDom() {
  // jsdom ships no types (and @types/jsdom is not installed): a non-literal
  // specifier keeps tsc from looking for them; only the constructor is used
  const specifier = 'jsdom'
  const { JSDOM } = (await import(/* @vite-ignore */ specifier)) as { JSDOM: new (html: string) => { window: Window } }
  const { window } = new JSDOM('')
  const g = globalThis as Record<string, unknown>
  for (const key of ['window', 'document', 'DOMParser', 'XMLSerializer', 'Node', 'NodeFilter', 'HTMLElement', 'Element']) {
    if (!(key in g)) g[key] = key === 'window' ? window : (window as unknown as Record<string, unknown>)[key]
  }
}

async function main() {
  const ids = process.argv.slice(2).filter(a => a !== '--')
  const known = new Set(MANIFEST.map(m => m.id))
  const presets = new Set(PRESET_INDEX.map(p => p.slug))
  const unknown = ids.filter(id => !known.has(id))
  if (unknown.length) {
    console.error(`[check-guides] unknown utility id(s): ${unknown.join(', ')}`)
    process.exit(2)
  }
  const targets = ids.length ? ids : [...known]
  await installDom()

  let failed = 0
  for (const id of targets) {
    const file = path.join(process.cwd(), 'src', 'utilities', id, 'guide.md')
    const source = existsSync(file) ? readFileSync(file, 'utf8') : null
    const util = (await LOADERS[id]()).default
    const problems = await checkGuide(util, source, known, presets)
    if (problems.length === 0) {
      console.log(`✓ ${id}`)
    } else {
      failed++
      console.log(`✗ ${id}\n${problems.map(p => `  - ${p}`).join('\n')}`)
    }
  }
  console.log(`\n${targets.length - failed}/${targets.length} guides pass`)
  if (failed) process.exit(1)
}

main().catch(e => {
  console.error(`[check-guides] ${e?.stack ?? e}`)
  process.exit(1)
})
