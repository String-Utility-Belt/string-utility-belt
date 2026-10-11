import type { Utility } from '../types/utility'
import { formatForDisplay, coerceInputFor, resolveAccepts, HIDDEN_CONTROL_CHAR, showControlChars } from '../core/coerce'
import { resolveParams, validateParams } from '../core/params'
import { parseGuide, guideExamples, type Guide } from '../app/pages/guide'
import { decodeExampleInput } from './exampleInput'

/**
 * What every utility guide (`src/utilities/<id>/guide.md`, format in
 * `src/app/pages/guide.ts`) must satisfy. Shared by `guides.test.ts` and
 * `npm run check:guides -- <id…>` (which loads only the utilities it checks).
 */
export const GUIDE_RULES = {
  /** Search results show ~60 characters of a title; the site name is appended after it. */
  titleMin: 20,
  titleMax: 60,
  /** Search results show ~155–160 characters of a description. */
  descriptionMin: 80,
  descriptionMax: 160,
  /** Prose words, worked examples not counted. */
  minWords: 250,
  minSections: 3,
  minExamples: 2,
}

/** Prose word count: markdown text, lists and tables — not the worked examples or code blocks. */
export function proseWords(guide: Guide): number {
  const text = guide.blocks.map(b =>
    b.kind === 'markdown' ? b.source : b.kind === 'list' ? b.items.join(' ') : b.kind === 'table' ? [b.header, ...b.rows].flat().join(' ') : '',
  ).join(' ')
  return text.replace(/```[\s\S]*?```/g, ' ').split(/\s+/).filter(w => /[A-Za-z0-9]/.test(w)).length
}

/** Lines outside fenced code blocks (and outside the frontmatter). */
export function proseLines(source: string): string[] {
  let fence: string | null = null
  const out: string[] = []
  const body = source.replace(/\r\n?/g, '\n').replace(/^---\n[\s\S]*?\n---\n/, '')
  for (const line of body.split('\n')) {
    const m = /^(`{3,})/.exec(line)
    if (m && (fence === null || line.trim() === fence)) { fence = fence === null ? m[1] : null; continue }
    if (fence === null) out.push(line)
  }
  return out
}

const show = (s: string) => JSON.stringify(s)

/**
 * Every problem with one utility's guide, as readable messages (empty when it
 * passes). `utilityIds` are the ids a guide may link to. Worked examples run
 * exactly as the golden `examples` test runs a utility's own examples.
 */
export async function checkGuide(u: Utility, source: string | null, utilityIds: ReadonlySet<string>): Promise<string[]> {
  if (source === null) return [`missing: create src/utilities/${u.id}/guide.md`]
  const problems: string[] = []
  const guide = parseGuide(source)
  const R = GUIDE_RULES

  const title = guide.title ?? ''
  if (title.length < R.titleMin || title.length > R.titleMax) problems.push(`title must be ${R.titleMin}–${R.titleMax} chars, is ${title.length}: ${show(title)}`)
  const description = guide.description ?? ''
  if (description.length < R.descriptionMin || description.length > R.descriptionMax) {
    problems.push(`description must be ${R.descriptionMin}–${R.descriptionMax} chars, is ${description.length}: ${show(description)}`)
  }

  // the file is served as text and pre-rendered into HTML, where NUL becomes U+FFFD
  const controls = source.split('\n').flatMap((l, i) => HIDDEN_CONTROL_CHAR.test(l) ? [`line ${i + 1}: ${show(showControlChars(l).slice(0, 60))}`] : [])
  if (controls.length) problems.push(`raw control characters — write each as its Control Picture (␛ for ESC, ␀ for NUL, ␡ for DEL), which an example reads back as the character: ${controls.join(', ')}`)

  const lines = proseLines(source)
  // the page already has the utility name as its <h1>
  if (lines.some(l => /^#\s/.test(l))) problems.push('no "# " headings — start sections at ##')
  const sections = lines.filter(l => /^##\s/.test(l)).length
  if (sections < R.minSections) problems.push(`needs ≥ ${R.minSections} "## " sections, has ${sections}`)
  const words = proseWords(guide)
  if (words < R.minWords) problems.push(`needs ≥ ${R.minWords} words of prose, has ${words}`)

  // mdToHtml has no multi-backtick code spans, and a ``` anywhere in a line opens a code block
  const backticks = lines.filter(l => l.includes('``'))
  if (backticks.length) {
    problems.push(`double or triple backticks in prose render broken on the site — describe them in words ("a backtick", "three backticks") or show them inside an example block: ${backticks.map(l => show(l.trim().slice(0, 60))).join(', ')}`)
  }

  // prose only: example inputs and `code` may hold markdown links on purpose
  const prose = lines.join('\n').replace(/`[^`\n]*`/g, '')
  for (const [, href] of prose.matchAll(/\]\(([^)\s]+)\)/g)) {
    const util = /^\/util\/([^/]+)\/$/.exec(href)
    if (util) { if (!utilityIds.has(util[1])) problems.push(`link ${href}: no utility "${util[1]}"`) }
    else if (href.startsWith('#')) problems.push(`link ${href}: use /util/<id>/ paths, not #/ routes (search engines drop fragments)`)
    else if (!href.startsWith('https://')) problems.push(`link ${href}: link other utilities as /util/<id>/, or use an https:// URL`)
  }

  problems.push(...guide.errors)
  const examples = guideExamples(guide)
  if (examples.length < R.minExamples) problems.push(`needs ≥ ${R.minExamples} worked examples, has ${examples.length}`)
  for (const [i, ex] of examples.entries()) {
    const label = `example ${i + 1}${ex.title ? ` (${ex.title})` : ''}`
    const unknown = Object.keys(ex.params ?? {}).filter(k => !(k in u.params))
    if (unknown.length) { problems.push(`${label}: unknown param(s) ${unknown.join(', ')}`); continue }
    const invalid = Object.entries(validateParams(u, ex.params ?? {}))
    if (invalid.length) { problems.push(`${label}: ${invalid.map(([k, m]) => `${k} ${m}`).join('; ')}`); continue }
    let shown: string
    try {
      const raw = decodeExampleInput(ex)
      const input = coerceInputFor(raw, resolveAccepts(u.accepts, raw))
      shown = formatForDisplay(await u.apply(input, resolveParams(u, ex.params ?? {})))
    } catch (e) {
      problems.push(`${label}: threw ${(e as Error)?.message ?? e}`)
      continue
    }
    if (ex.outputMatches !== undefined) {
      const re = new RegExp(ex.outputMatches)
      if (!re.test(shown)) problems.push(`${label}: output ${show(shown)} does not match /${ex.outputMatches}/`)
      if (ex.output !== undefined && !re.test(ex.output)) problems.push(`${label}: sample output ${show(ex.output)} does not match /${ex.outputMatches}/`)
    } else if (shown !== ex.output) {
      const expected = ex.output ?? ''
      // a value that starts on its `output:` line drops trailing blank lines, so it cannot end in a newline
      const hint = shown.replace(/\n+$/, '') === expected.replace(/\n+$/, '')
        ? '\n    (differs only in trailing newlines: put `output:` alone on its line, the value below it, and one blank line per trailing newline before the closing fence)'
        : ''
      problems.push(`${label}: expected ${show(expected)}\n    actual   ${show(shown)}${hint}`)
    }
  }
  return problems
}
