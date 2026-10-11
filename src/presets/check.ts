/**
 * What every preset must satisfy before it gets a page. Shared by
 * `presets.test.ts` and `npm run check:presets -- <slug…>`.
 *
 * Two kinds of rule. Engine rules keep the page honest: real utilities and
 * params, every sample reproduces its golden output on every run, and every
 * step earns its place (leaving any one out changes some sample's output).
 * Search rules keep it from being a thin or competing page: two real utility
 * steps (nested ones count), a guide long enough to be worth a visit, a title
 * and target query that no utility page already owns, and prose that is not a
 * near-copy of another page's.
 */
import type { PipelineStep, Utility } from '../types/utility'
import type { UtilityMeta } from '../core/registry'
import { formatForDisplay } from '../core/coerce'
import { validateParams } from '../core/params'
import { sanitizeSteps } from '../core/serialize'
import { isUtilityStep, stepTypeOf, walkSteps } from '../core/steps'
import { pageHeading, parseGuide } from '../app/pages/guide'
import { proseLines, proseWords } from '../utilities/guideCheck'
import { PRESET_CATEGORIES, toPipelineSteps, type Preset } from './types'
import { firstError, without, type PipelineRunner } from './trace'

export const PRESET_RULES = {
  slugMax: 60,
  nameMax: 60,
  summaryMin: 60,
  summaryMax: 220,
  whyMinWords: 6,
  whyMaxWords: 60,
  minSamples: 2,
  /** The worked example opens in the page's input box: keep it readable at a glance. */
  mainInputMax: 2000,
  /** Search results show ~60 characters of a title and ~155–160 of a description. */
  titleMin: 20,
  titleMax: 60,
  descriptionMin: 80,
  descriptionMax: 160,
  /** Prose words in `guide.md`. */
  minWords: 300,
  minSections: 3,
  /** Near-duplicate prose: the share of a guide's 8-word runs that also appear in another guide. */
  shingleWords: 8,
  maxOverlap: 0.25,
}

export const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const DATE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Tidying steps: useful, but no preset on their own. A page needs two real utility steps
 * besides these, at the top level or inside a branch, macro or "run on each" step.
 */
export const HELPER_UTILITIES: ReadonlySet<string> = new Set([
  'trim', 'trim_lines', 'remove_blank_lines', 'collapse_whitespace', 'normalize_line_endings',
])

/** The build runs every preset in Node and the page runs it in a worker: neither has a DOM or runs user code. */
const BLOCKED_ENV = ['dom', 'main', 'eval'] as const

export interface PresetCheckContext {
  utility: (id: string) => Utility | undefined
  meta: (id: string) => UtilityMeta | undefined
  run: PipelineRunner
  /** Every preset's slug, for `related` and guide links. */
  presetSlugs: ReadonlySet<string>
}

const show = (s: string) => JSON.stringify(s)
const words = (s: string) => s.split(/\s+/).filter(w => /[A-Za-z0-9]/.test(w)).length

/** Key-order-insensitive deep equality for plain JSON data. */
function sameData(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => sameData(x, b[i]))
  }
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false
  const ka = Object.keys(a as object)
  const kb = Object.keys(b as object)
  return ka.length === kb.length && ka.every(k => sameData((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]))
}

function stepName(step: PipelineStep, ctx: PresetCheckContext): string {
  if (isUtilityStep(step)) return `${step.id} (${ctx.meta(step.utilityId)?.name ?? step.utilityId})`
  return `${step.id} (${stepTypeOf(step)})`
}

function checkFields(preset: Preset, folder: string, ctx: PresetCheckContext): string[] {
  const R = PRESET_RULES
  const problems: string[] = []
  if (preset.slug !== folder) problems.push(`slug ${show(preset.slug)} must equal its folder name ${show(folder)}`)
  if (!SLUG.test(preset.slug) || preset.slug.length > R.slugMax) {
    problems.push(`slug must be lowercase words joined by single hyphens, ≤ ${R.slugMax} chars: ${show(preset.slug)}`)
  }
  if (!preset.name || preset.name.length > R.nameMax) problems.push(`name must be 1–${R.nameMax} chars: ${show(preset.name)}`)
  if (preset.summary.length < R.summaryMin || preset.summary.length > R.summaryMax) {
    problems.push(`summary must be ${R.summaryMin}–${R.summaryMax} chars, is ${preset.summary.length}`)
  }
  if (!(PRESET_CATEGORIES as readonly string[]).includes(preset.category)) {
    problems.push(`category must be one of ${PRESET_CATEGORIES.join(', ')}: ${show(preset.category)}`)
  }
  if (!preset.primaryQuery.trim() || preset.primaryQuery !== preset.primaryQuery.trim().toLowerCase()) {
    problems.push(`primaryQuery must be a trimmed, lowercase search phrase: ${show(preset.primaryQuery)}`)
  }
  for (const key of ['published', 'updated'] as const) {
    const value = preset[key]
    if (value === undefined && key === 'updated') continue
    if (!value || !DATE.test(value) || Number.isNaN(new Date(value).getTime())) problems.push(`${key} must be a YYYY-MM-DD date: ${show(String(value))}`)
  }
  if (preset.updated && preset.updated < preset.published) problems.push('updated must not be before published')
  for (const slug of preset.related ?? []) {
    if (slug === preset.slug) problems.push('related must not list the preset itself')
    else if (!ctx.presetSlugs.has(slug)) problems.push(`related: no preset ${show(slug)}`)
  }
  return problems
}

/** Step problems, and whether the steps can run at all (unknown utilities or bad params cannot). */
function checkSteps(preset: Preset, steps: PipelineStep[], ctx: PresetCheckContext): { problems: string[]; runnable: boolean } {
  const R = PRESET_RULES
  const problems: string[] = []
  const ids = new Set<string>()
  walkSteps(steps, s => {
    if (ids.has(s.id)) problems.push(`duplicate step id ${show(s.id)}`)
    ids.add(s.id)
    if (!isUtilityStep(s)) return
    const util = ctx.utility(s.utilityId)
    const meta = ctx.meta(s.utilityId)
    if (!util || !meta) { problems.push(`step ${s.id}: no utility ${show(s.utilityId)}`); return }
    const unknown = Object.keys(s.params ?? {}).filter(k => !(k in (util.params ?? {})))
    if (unknown.length) problems.push(`step ${s.id}: ${s.utilityId} has no param(s) ${unknown.join(', ')}`)
    const invalid = Object.entries(validateParams(util, s.params ?? {}))
    if (invalid.length) problems.push(`step ${s.id}: ${invalid.map(([k, m]) => `${k} ${m}`).join('; ')}`)
    const blocked = meta.env.filter(e => (BLOCKED_ENV as readonly string[]).includes(e))
    if (blocked.length) problems.push(`step ${s.id}: ${s.utilityId} needs ${blocked.join(', ')}, which the build (Node) and the page's worker do not have`)
  })
  const runnable = problems.length === 0
  if (!sameData(sanitizeSteps(steps), steps)) problems.push('steps change when sanitized (as share links and the library store them): use plain JSON params')

  // counted through containers too: one utility wrapped in a branch or "run on each" is still one utility
  let real = 0
  walkSteps(steps, s => { if (isUtilityStep(s) && !HELPER_UTILITIES.has(s.utilityId)) real++ })
  if (real < 2) {
    problems.push(`needs ≥ 2 utility steps besides ${[...HELPER_UTILITIES].join('/')}, nested ones included: one utility is its own page, at /util/<id>/`)
  }
  for (const s of preset.steps) {
    const n = words(s.why ?? '')
    if (n < R.whyMinWords || n > R.whyMaxWords) problems.push(`step ${s.id}: why must be ${R.whyMinWords}–${R.whyMaxWords} words, is ${n}`)
  }
  return { problems, runnable }
}

async function checkSamples(preset: Preset, steps: PipelineStep[], ctx: PresetCheckContext): Promise<string[]> {
  const R = PRESET_RULES
  const problems: string[] = []
  if (preset.samples.length < R.minSamples) problems.push(`needs ≥ ${R.minSamples} samples, has ${preset.samples.length}`)
  const main = preset.samples[0]
  if (main && main.input.length > R.mainInputMax) problems.push(`the first sample's input must be ≤ ${R.mainInputMax} chars, is ${main.input.length}`)
  const sampleIds = new Set<string>()
  for (const sample of preset.samples) {
    const label = `sample ${show(sample.id)}`
    if (!SLUG.test(sample.id)) problems.push(`${label}: id must be kebab-case`)
    if (sampleIds.has(sample.id)) problems.push(`${label}: duplicate id`)
    sampleIds.add(sample.id)
    if (!sample.title.trim()) problems.push(`${label}: needs a title`)
    const first = await ctx.run(sample.input, steps, false)
    const error = firstError(first, steps)
    if (error) { problems.push(`${label}: step ${error.stepId} fails: ${error.message}`); continue }
    if (first.halted) { problems.push(`${label}: the pipeline halted`); continue }
    const actual = formatForDisplay(first.out)
    if (actual !== sample.output) problems.push(`${label}: expected ${show(sample.output)}\n    actual   ${show(actual)}`)
    const again = formatForDisplay((await ctx.run(sample.input, steps, false)).out)
    if (again !== actual) problems.push(`${label}: output differs between runs — a preset page needs a fixed worked example`)
  }
  if (problems.length) return problems

  // every step earns its place: leaving it out changes (or breaks) some sample's output
  for (const [i, step] of steps.entries()) {
    const less = without(steps, i)
    let matters = false
    for (const sample of preset.samples) {
      const result = await ctx.run(sample.input, less, false)
      if (firstError(result, less) || formatForDisplay(result.out) !== sample.output) { matters = true; break }
    }
    if (!matters) {
      problems.push(`step ${stepName(step, ctx)} changes nothing on any sample: remove it, or add a sample that needs it`)
    }
  }
  return problems
}

function checkGuide(preset: Preset, source: string | null, ctx: PresetCheckContext): string[] {
  const R = PRESET_RULES
  if (source === null) return [`missing: create src/presets/${preset.slug}/guide.md`]
  const problems: string[] = []
  const guide = parseGuide(source)
  const title = guide.title ?? ''
  if (title.length < R.titleMin || title.length > R.titleMax) problems.push(`guide title must be ${R.titleMin}–${R.titleMax} chars, is ${title.length}: ${show(title)}`)
  const description = guide.description ?? ''
  if (description.length < R.descriptionMin || description.length > R.descriptionMax) {
    problems.push(`guide description must be ${R.descriptionMin}–${R.descriptionMax} chars, is ${description.length}: ${show(description)}`)
  }
  const lines = proseLines(source)
  if (lines.some(l => /^#\s/.test(l))) problems.push('guide: no "# " headings (the page has the preset name as its h1) — start sections at ##')
  const sections = lines.filter(l => /^##\s/.test(l)).length
  if (sections < R.minSections) problems.push(`guide needs ≥ ${R.minSections} "## " sections, has ${sections}`)
  const n = proseWords(guide)
  if (n < R.minWords) problems.push(`guide needs ≥ ${R.minWords} words of prose, has ${n}`)
  if (guide.blocks.some(b => b.kind === 'example')) problems.push('guide: no ```example blocks — the page already shows the worked example step by step')
  problems.push(...guide.errors)
  const backticks = lines.filter(l => l.includes('``'))
  if (backticks.length) problems.push(`guide: double or triple backticks in prose render broken: ${backticks.map(l => show(l.trim().slice(0, 60))).join(', ')}`)
  const prose = lines.join('\n').replace(/`[^`\n]*`/g, '')
  for (const [, href] of prose.matchAll(/\]\(([^)\s]+)\)/g)) {
    const util = /^\/util\/([^/]+)\/$/.exec(href)
    const other = /^\/presets\/([^/]+)\/$/.exec(href)
    if (util) { if (!ctx.meta(util[1])) problems.push(`guide link ${href}: no utility "${util[1]}"`) }
    else if (other) {
      if (other[1] === preset.slug) problems.push(`guide link ${href}: links the page to itself`)
      else if (!ctx.presetSlugs.has(other[1])) problems.push(`guide link ${href}: no preset "${other[1]}"`)
    }
    else if (!href.startsWith('https://')) problems.push(`guide link ${href}: use /util/<id>/, /presets/<slug>/ or an https:// URL`)
  }
  return problems
}

/** Every problem with one preset (empty when it passes). `folder` is the directory it was loaded from. */
export async function checkPreset(preset: Preset, folder: string, guideSource: string | null, ctx: PresetCheckContext): Promise<string[]> {
  const steps = toPipelineSteps(preset.steps)
  const checked = checkSteps(preset, steps, ctx)
  const problems = [...checkFields(preset, folder, ctx), ...checked.problems, ...checkGuide(preset, guideSource, ctx)]
  // samples run the steps: only once every step names a real utility with valid params
  return checked.runnable ? [...problems, ...await checkSamples(preset, steps, ctx)] : problems
}

// ---------------------------------------------------------------------------
// Rules across every preset and every utility guide
// ---------------------------------------------------------------------------

export interface GuideEntry {
  /** `preset:<slug>` or `util:<id>`, for messages. */
  key: string
  source: string
}

/**
 * What a utility page ranks for: its `<h1>` (`pageHeading`), lowercased — the guide
 * title before the first ": " or " — ", without "Online"
 * ("Slug Generator Online: URL-Safe Slugs" → "slug generator").
 */
export const headTerm = (title: string): string => pageHeading(title).toLowerCase()

/** A guide's prose (code spans and fenced blocks dropped) as a set of `shingleWords`-word runs. */
export function shingles(source: string, size = PRESET_RULES.shingleWords): Set<string> {
  const text = proseLines(source).join(' ').replace(/`[^`\n]*`/g, ' ').replace(/\]\([^)]*\)/g, ']')
  const tokens = text.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? []
  const out = new Set<string>()
  for (let i = 0; i + size <= tokens.length; i++) out.add(tokens.slice(i, i + size).join(' '))
  return out
}

/** The share of `a`'s runs that also appear in `b`. */
export function overlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0) return 0
  let shared = 0
  for (const s of a) if (b.has(s)) shared++
  return shared / a.size
}

/**
 * Problems no single preset shows: duplicate names, titles, descriptions or target
 * queries; a target query some utility page already leads with, or that contains its
 * head term ("bulk slug generator"); prose that is a near-copy of another preset's
 * guide or of a guide for a utility it uses.
 */
export function checkPresetSet(
  presets: Array<{ preset: Preset; guide: string | null }>,
  utilityGuides: Array<{ id: string; source: string }>,
): string[] {
  const problems: string[] = []
  const utilTitles = utilityGuides.map(g => ({ id: g.id, guide: parseGuide(g.source) }))
  const seen = new Map<string, string>()
  const claim = (kind: string, value: string | undefined, owner: string) => {
    if (!value) return
    const key = `${kind}:${value.trim().toLowerCase()}`
    const other = seen.get(key)
    if (other) problems.push(`${owner} and ${other} share a ${kind}: ${show(value)}`)
    else seen.set(key, owner)
  }
  for (const u of utilTitles) {
    claim('title', u.guide.title, `util:${u.id}`)
    claim('description', u.guide.description, `util:${u.id}`)
  }
  for (const { preset, guide } of presets) {
    const owner = `preset:${preset.slug}`
    claim('slug', preset.slug, owner)
    claim('name', preset.name, owner)
    claim('primary query', preset.primaryQuery, owner)
    if (guide !== null) {
      const parsed = parseGuide(guide)
      claim('title', parsed.title, owner)
      claim('description', parsed.description, owner)
    }
    const query = preset.primaryQuery.trim().toLowerCase()
    for (const u of utilTitles) {
      const title = u.guide.title
      if (!query || !title) continue
      const head = headTerm(title)
      if (title.toLowerCase().includes(query)) {
        problems.push(`${owner}: primary query ${show(query)} is the head term of /util/${u.id}/ (${show(title)}) — the pages would compete; target the task, not the tool`)
      } else if (head && query.includes(head)) {
        problems.push(`${owner}: primary query ${show(query)} contains ${show(head)}, the head term of /util/${u.id}/ (${show(title)}) — the pages would compete; target the task, not the tool`)
      }
    }
  }

  const utilSource = new Map(utilityGuides.map(g => [g.id, g.source]))
  const presetRuns = presets.filter(r => r.guide !== null).map(r => ({ preset: r.preset, runs: shingles(r.guide!) }))
  for (const mine of presetRuns) {
    const others: Array<[string, Set<string>]> = presetRuns
      .filter(o => o !== mine).map(o => [`preset:${o.preset.slug}`, o.runs] as [string, Set<string>])
    const used = new Set<string>()
    walkSteps(toPipelineSteps(mine.preset.steps), s => { if (isUtilityStep(s)) used.add(s.utilityId) })
    for (const id of used) {
      const source = utilSource.get(id)
      if (source) others.push([`util:${id}`, shingles(source)])
    }
    for (const [key, runs] of others) {
      const share = overlap(mine.runs, runs)
      if (share >= PRESET_RULES.maxOverlap) {
        problems.push(`preset:${mine.preset.slug}: ${Math.round(share * 100)}% of its guide's ${PRESET_RULES.shingleWords}-word runs also appear in ${key} — write it for this task`)
      }
    }
  }
  return problems
}
