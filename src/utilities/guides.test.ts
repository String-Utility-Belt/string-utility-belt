/**
 * Utility guides (`src/utilities/<id>/guide.md`, format in `src/app/pages/guide.ts`):
 * every utility has one, its SEO frontmatter fits a search result, it is long
 * enough to be worth a search visit, and every worked example actually produces
 * the output it shows — the same golden check as a utility's own `examples`.
 * Rules and messages: `guideCheck.ts`.
 *
 * Check a few guides without loading every utility:  npm run check:guides -- base64_encode pad
 */
import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { UTILITIES } from './index'
import { parseGuide } from '../app/pages/guide'
import { checkGuide } from './guideCheck'

const DIR = path.join(process.cwd(), 'src', 'utilities')
const readGuide = (id: string): string | null => {
  const file = path.join(DIR, id, 'guide.md')
  return existsSync(file) ? readFileSync(file, 'utf8') : null
}
const ids = new Set(UTILITIES.map(u => u.id))

describe('utility guides', () => {
  for (const u of UTILITIES) {
    it(`${u.id} guide`, async () => {
      expect(await checkGuide(u, readGuide(u.id), ids)).toEqual([])
    })
  }

  it('rejects a raw control character, naming its line and the Control Picture to write instead', async () => {
    const source = readGuide('strip_ansi')!.replace('␛[31mred', '\u001b[31mred')
    const problems = await checkGuide(UTILITIES.find(u => u.id === 'strip_ansi')!, source, ids)
    expect(problems).toEqual([expect.stringMatching(/^raw control characters — write each as its Control Picture .*line 16: "input: ␛\[31mred/)])
  })

  it('gives every guide a unique title and description (one search result per utility)', () => {
    const seen = { title: new Map<string, string>(), description: new Map<string, string>() }
    const dupes: string[] = []
    for (const u of UTILITIES) {
      const source = readGuide(u.id)
      if (source === null) continue
      const guide = parseGuide(source)
      for (const key of ['title', 'description'] as const) {
        const value = guide[key]?.toLowerCase()
        if (!value) continue
        const other = seen[key].get(value)
        if (other) dupes.push(`${key} of ${other} & ${u.id}: ${value}`)
        else seen[key].set(value, u.id)
      }
    }
    expect(dupes).toEqual([])
  })
})
