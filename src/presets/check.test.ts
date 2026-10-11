import { describe, expect, it } from 'vitest'
import { runPipeline } from '../core/runner'
import { staticRegistry, STATIC_UTILITIES } from '../utilities/static-registry'
import { MANIFEST } from '../utilities/_generated/manifest'
import { checkPreset, checkPresetSet, headTerm, overlap, shingles, type PresetCheckContext } from './check'
import { branch, each, laneBranch, laneStep, step } from './define'
import type { Preset } from './types'

const byId = new Map(STATIC_UTILITIES.map(u => [u.id, u]))
const metas = new Map(MANIFEST.map(m => [m.id, m]))
const ctx = (over: Partial<PresetCheckContext> = {}): PresetCheckContext => ({
  utility: id => byId.get(id),
  meta: id => metas.get(id),
  run: (input, steps, previews) => runPipeline(input, steps, { load: staticRegistry.load, previews, env: 'node' }),
  presetSlugs: new Set(['upper-slugs', 'other-preset']),
  ...over,
})

/** Deterministic filler prose: `n` distinct words, so no two generated guides share 8-word runs. */
const filler = (seed: string, n: number) => Array.from({ length: n }, (_, i) => `${seed}${i.toString(36)}`).join(' ')

const guide = (opts: { title?: string; description?: string; body?: string } = {}) => [
  '---',
  `title: ${opts.title ?? 'Uppercase Slugs From a List of Titles'}`,
  `description: ${opts.description ?? 'Turn a list of titles into uppercase, hyphenated slugs, one per line, with accents removed and punctuation collapsed.'}`,
  '---',
  opts.body ?? ['## One', filler('a', 110), '', '## Two', filler('b', 110), '', '## Three', filler('c', 110)].join('\n'),
].join('\n')

const preset = (over: Partial<Preset> = {}): Preset => ({
  slug: 'upper-slugs',
  name: 'Make uppercase slugs from titles',
  summary: 'Turn a list of titles into uppercase slugs, one per line, with accents stripped and runs of punctuation collapsed to one hyphen.',
  category: 'Writing & Marketing',
  primaryQuery: 'uppercase slugs from titles',
  published: '2026-10-07',
  steps: [
    step('accents', 'diacritics', {}, 'Accented letters would otherwise be dropped by the next step entirely.'),
    step('hyphens', 'replace', { pattern: '[^A-Za-z0-9\\n]+', replacement: '-', regex: true, flags: 'g' },
      'Collapses every run of spaces and punctuation into a single hyphen, line by line.'),
    step('upper', 'case', { mode: 'upper' }, 'Slugs in this system are uppercase, so convert every letter.'),
  ],
  samples: [
    { id: 'titles', title: 'Titles', input: 'Café au lait\nTwo words', output: 'CAFE-AU-LAIT\nTWO-WORDS' },
    { id: 'punctuation', title: 'Punctuation', input: 'Rock & Roll', output: 'ROCK-ROLL' },
  ],
  ...over,
})

describe('checkPreset', () => {
  it('passes a sound preset', async () => {
    expect(await checkPreset(preset(), 'upper-slugs', guide(), ctx())).toEqual([])
  })

  it('reports field problems: folder, slug shape, summary, category, query, dates, related', async () => {
    const problems = await checkPreset(preset({
      slug: 'Upper_Slugs', summary: 'short', category: 'Nope' as Preset['category'], primaryQuery: ' Mixed Case ',
      published: '2026-13-45', updated: '2020-01-01', related: ['Upper_Slugs', 'missing-one'],
    }), 'upper-slugs', guide(), ctx({ presetSlugs: new Set(['upper-slugs']) }))
    const text = problems.join('\n')
    expect(text).toContain('must equal its folder name')
    expect(text).toContain('lowercase words joined by single hyphens')
    expect(text).toContain('summary must be')
    expect(text).toContain('category must be one of')
    expect(text).toContain('primaryQuery must be a trimmed, lowercase')
    expect(text).toContain('published must be a YYYY-MM-DD date')
    expect(text).toContain('related must not list the preset itself')
    expect(text).toContain('related: no preset "missing-one"')
  })

  it('refuses unknown utilities and params without running the samples', async () => {
    const problems = await checkPreset(preset({
      steps: [
        step('a', 'no_such_utility', {}, 'This step names a utility that does not exist at all.'),
        step('b', 'case', { mode: 'upper', shout: true }, 'This step passes a param the utility does not have.'),
      ],
    }), 'upper-slugs', guide(), ctx())
    expect(problems).toContain('step a: no utility "no_such_utility"')
    expect(problems).toContain('step b: case has no param(s) shout')
    expect(problems.some(p => p.startsWith('sample '))).toBe(false)
  })

  it('refuses steps the build and the worker cannot run (DOM)', async () => {
    const problems = await checkPreset(preset({
      steps: [
        step('x', 'xml_to_json', {}, 'Parses the XML into JSON with the browser parser.'),
        step('upper', 'case', { mode: 'upper' }, 'Uppercases the whole JSON document for no good reason.'),
      ],
    }), 'upper-slugs', guide(), ctx())
    expect(problems.join('\n')).toMatch(/step x: xml_to_json needs dom/)
  })

  it('needs two real steps: helpers and a single utility are not a preset', async () => {
    const problems = await checkPreset(preset({
      steps: [
        step('t', 'trim', {}, 'Removes the whitespace around the whole input first.'),
        step('upper', 'case', { mode: 'upper' }, 'Uppercases every letter of the trimmed input.'),
      ],
      samples: [
        { id: 'a', title: 'A', input: ' ab ', output: 'AB' },
        { id: 'b', title: 'B', input: 'cd ', output: 'CD' },
      ],
    }), 'upper-slugs', guide(), ctx())
    expect(problems.join('\n')).toContain('needs ≥ 2 utility steps besides')
  })

  it('counts the utilities inside a container: one utility wrapped in "run on each" is still one', async () => {
    const wrapped = (steps: Preset['steps']) => checkPreset(preset({
      steps,
      samples: [
        { id: 'a', title: 'A', input: ' ab\ncd', output: 'AB\nCD' },
        { id: 'b', title: 'B', input: 'x', output: 'X' },
      ],
    }), 'upper-slugs', guide(), ctx())
    const perLine = each('per-line', { mode: 'lines' }, [laneStep('l1', 'case', { mode: 'upper' })],
      'Uppercases every line on its own, which one utility does for the whole text.')
    const trimmed = step('t', 'trim_lines', { side: 'both', characters: '' }, 'Removes the spaces around every line before anything else.')
    expect((await wrapped([perLine])).join('\n')).toContain('needs ≥ 2 utility steps besides')
    expect((await wrapped([trimmed, perLine])).join('\n')).toContain('needs ≥ 2 utility steps besides')
  })

  it('accepts one container holding two utilities across a nested branch and a pass-through lane', async () => {
    const counted = each('per-line', { mode: 'lines' }, [
      laneBranch('both', [[laneStep('n', 'text_stats', {}), laneStep('g', 'jsonpath', { path: '$.graphemes', mode: 'first', indent: 2 })], []],
        { mode: 'concat', separator: ' · ' }),
    ], 'Writes how many characters each line has in front of the line itself.')
    expect(await checkPreset(preset({
      steps: [counted],
      samples: [
        { id: 'a', title: 'A', input: 'ab\ncde', output: '2 · ab\n3 · cde' },
        { id: 'b', title: 'B', input: 'é', output: '1 · é' },
      ],
    }), 'upper-slugs', guide(), ctx())).toEqual([])
  })

  it('accepts a branch as the multi-step part', async () => {
    const problems = await checkPreset(preset({
      steps: [
        branch('both', [[laneStep('l1', 'case', { mode: 'upper' })], [laneStep('l2', 'case', { mode: 'lower' })]],
          { mode: 'concat', separator: '\n' }, 'Shows the uppercase and lowercase forms one above the other.'),
      ],
      samples: [
        { id: 'a', title: 'A', input: 'Ab', output: 'AB\nab' },
        { id: 'b', title: 'B', input: 'Cd', output: 'CD\ncd' },
      ],
    }), 'upper-slugs', guide(), ctx())
    expect(problems).toEqual([])
  })

  it('accepts a "run on each" step as the multi-step part, sanitised unchanged', async () => {
    const perLine = each('per-line', { mode: 'lines' }, [laneStep('l1', 'reverse'), laneStep('l2', 'case', { mode: 'upper' })],
      'Reverses and uppercases every line on its own, so the lines keep their order.')
    const problems = await checkPreset(preset({
      steps: [perLine],
      samples: [
        { id: 'a', title: 'A', input: 'ab\ncd', output: 'BA\nDC' },
        { id: 'b', title: 'B', input: 'xy\n\nz', output: 'YX\n\nZ' },
      ],
    }), 'upper-slugs', guide(), ctx())
    expect(problems).toEqual([])
  })

  it('names an each step by its type when it changes nothing', async () => {
    const r = preset()
    r.steps.push(each('noop', { mode: 'lines' }, [laneStep('n1', 'case', { mode: 'upper' })],
      'Uppercases every line again, which can never change anything here.'))
    const problems = await checkPreset(r, 'upper-slugs', guide(), ctx())
    expect(problems).toContain('step noop (each) changes nothing on any sample: remove it, or add a sample that needs it')
  })

  it('needs a reason of sensible length on every top-level step', async () => {
    const r = preset()
    r.steps[0] = { ...r.steps[0], why: 'Too short.' }
    expect(await checkPreset(r, 'upper-slugs', guide(), ctx())).toContain('step accents: why must be 6–60 words, is 2')
  })

  it('needs at least two samples and a short first input', async () => {
    const problems = await checkPreset(preset({
      samples: [{ id: 'long', title: 'Long', input: 'x'.repeat(2001), output: 'X'.repeat(2001) }],
    }), 'upper-slugs', guide(), ctx())
    expect(problems).toContain('needs ≥ 2 samples, has 1')
    expect(problems).toContain("the first sample's input must be ≤ 2000 chars, is 2001")
  })

  it('prints the actual output of a sample that does not match', async () => {
    const r = preset()
    r.samples[1] = { ...r.samples[1], output: 'WRONG' }
    const problems = await checkPreset(r, 'upper-slugs', guide(), ctx())
    expect(problems).toContain('sample "punctuation": expected "WRONG"\n    actual   "ROCK-ROLL"')
  })

  it('reports a failing step by id', async () => {
    const r = preset({
      steps: [
        step('parse', 'json_pretty', { indent: 2 }, 'Pretty-prints the JSON so the next step sees one key per line.'),
        step('upper', 'case', { mode: 'upper' }, 'Uppercases every key and value in the document.'),
      ],
      samples: [
        { id: 'bad', title: 'Bad', input: 'not json', output: 'NOT JSON' },
        { id: 'ok', title: 'OK', input: '{"a":1}', output: '{\n  "A": 1\n}' },
      ],
    })
    const problems = await checkPreset(r, 'upper-slugs', guide(), ctx())
    expect(problems.some(p => p.startsWith('sample "bad": step parse fails:'))).toBe(true)
  })

  it('flags a step that changes nothing on any sample', async () => {
    const r = preset()
    r.steps.push(step('again', 'case', { mode: 'upper' }, 'Uppercases a second time, which can never change anything.'))
    // either uppercase step alone does the job, so leaving out one changes nothing: both are reported
    expect(await checkPreset(r, 'upper-slugs', guide(), ctx())).toEqual([
      'step upper (change case) changes nothing on any sample: remove it, or add a sample that needs it',
      'step again (change case) changes nothing on any sample: remove it, or add a sample that needs it',
    ])
  })

  it('keeps a conditional step that only one sample needs', async () => {
    const r = preset()
    r.steps.unshift(step('unquote', 'replace', { pattern: '^"|"$', replacement: '', regex: true, flags: 'g' },
      'Drops the quotes around a value pasted from a CSV cell, when there are any.',
      { condition: { kind: 'regex', pattern: '^"' } }))
    r.samples.push({ id: 'quoted', title: 'Quoted', input: '"Hello there"', output: 'HELLO-THERE' })
    expect(await checkPreset(r, 'upper-slugs', guide(), ctx())).toEqual([])
  })

  it('refuses a worked example that changes between runs', async () => {
    let n = 0
    const flaky = ctx({
      run: async (input, steps, previews) => {
        const result = await runPipeline(input, steps, { load: staticRegistry.load, previews, env: 'node' })
        return n++ === 1 ? { ...result, out: `${String(result.out)}!` } : result
      },
    })
    expect((await checkPreset(preset(), 'upper-slugs', guide(), flaky)).join('\n')).toContain('output differs between runs')
  })

  it('applies the guide rules: SEO lengths, sections, words, no examples, links', async () => {
    const body = [
      '# A second h1', '## Only section', filler('d', 40),
      'See [case](/util/case/), [nothing](/util/nope/), [other](/presets/other-preset/), [gone](/presets/gone/),',
      '[me](/presets/upper-slugs/), [hash](#/util/case), [http](http://example.com).',
      '```example', 'input: a', 'output: a', '```',
    ].join('\n')
    const problems = await checkPreset(preset(), 'upper-slugs', guide({ title: 'Short', description: 'Too short too.', body }), ctx())
    const text = problems.join('\n')
    expect(text).toContain('guide title must be 20–60 chars')
    expect(text).toContain('guide description must be 80–160 chars')
    expect(text).toContain('no "# " headings')
    expect(text).toContain('guide needs ≥ 3 "## " sections, has 1')
    expect(text).toContain('guide needs ≥ 300 words of prose')
    expect(text).toContain('no ```example blocks')
    expect(text).toContain('guide link /util/nope/: no utility "nope"')
    expect(text).toContain('guide link /presets/gone/: no preset "gone"')
    expect(text).toContain('guide link /presets/upper-slugs/: links the page to itself')
    expect(text).toContain('guide link #/util/case: use /util/<id>/, /presets/<slug>/ or an https:// URL')
    expect(text).toContain('guide link http://example.com: use /util/<id>/')
    expect(text).not.toContain('/util/case/:')
    expect(text).not.toContain('/presets/other-preset/:')
  })

  it('reports a missing guide', async () => {
    expect(await checkPreset(preset(), 'upper-slugs', null, ctx())).toContain('missing: create src/presets/upper-slugs/guide.md')
  })
})

describe('checkPresetSet', () => {
  const utilGuide = (id: string, title: string) => ({ id, source: guide({ title, description: `About ${id}: ${filler(id, 20)}`, body: filler(`u${id}`, 50) }) })

  it('passes distinct presets', () => {
    const other = preset({ slug: 'other-preset', name: 'Another preset', primaryQuery: 'another thing' })
    expect(checkPresetSet([
      { preset: preset(), guide: guide() },
      { preset: other, guide: guide({ title: 'A Different Search Title Here', description: `Different description: ${filler('z', 15)}`, body: filler('y', 300) }) },
    ], [utilGuide('case', 'Change Text Case Online')])).toEqual([])
  })

  it('refuses shared names, titles, descriptions and queries', () => {
    const problems = checkPresetSet([
      { preset: preset(), guide: guide() },
      { preset: preset({ slug: 'other-preset' }), guide: guide() },
    ], [])
    const text = problems.join('\n')
    for (const kind of ['name', 'primary query', 'title', 'description']) expect(text).toContain(`share a ${kind}`)
  })

  it("refuses a target query that is a utility page's head term", () => {
    const problems = checkPresetSet([{ preset: preset({ primaryQuery: 'csv to sql insert' }), guide: guide() }],
      [utilGuide('csv_to_sql', 'CSV to SQL INSERT Generator Online')])
    expect(problems.join('\n')).toContain('is the head term of /util/csv_to_sql/')
  })

  it("refuses a target query that contains a utility page's head term, and only its head term", () => {
    const utils = [utilGuide('slug', 'Slug Generator Online — URL-Safe Slugs From Any Text'), utilGuide('case', 'Change Case Online')]
    const check = (primaryQuery: string) => checkPresetSet([{ preset: preset({ primaryQuery }), guide: guide() }], utils).join('\n')
    expect(check('bulk slug generator')).toContain('primary query "bulk slug generator" contains "slug generator", the head term of /util/slug/')
    expect(check('change case of every heading')).toContain('contains "change case", the head term of /util/case/')
    // words of the subtitle, or of the head term on their own, are fine
    expect(check('url-safe slugs from a list of titles')).toBe('')
    expect(check('slug list from titles')).toBe('')
  })

  it('takes the head term of a ": " title too, as every current guide writes it', () => {
    const utils = [utilGuide('base64_encode', 'Base64 Encode Online: Convert Text to Base64')]
    const check = (primaryQuery: string) => checkPresetSet([{ preset: preset({ primaryQuery }), guide: guide() }], utils).join('\n')
    expect(check('base64 encode a jwt payload')).toContain('contains "base64 encode", the head term of /util/base64_encode/')
    expect(check('convert text to base64')).toContain('is the head term of /util/base64_encode/')
    expect(check('jwt payload as base64')).toBe('')
  })

  it('refuses near-copied prose, from another preset or a utility the preset uses', () => {
    const shared = filler('s', 300)
    const problems = checkPresetSet([
      { preset: preset(), guide: guide({ body: shared }) },
      { preset: preset({ slug: 'other-preset', name: 'Other', primaryQuery: 'other' }), guide: guide({ title: 'Another Title For The Page', description: `Another: ${filler('q', 20)}`, body: shared }) },
    ], [{ id: 'case', source: guide({ title: 'Case Converter Online Tool', description: `Case: ${filler('w', 20)}`, body: shared }) }])
    const text = problems.join('\n')
    expect(text).toContain("preset:upper-slugs: 100% of its guide's 8-word runs also appear in preset:other-preset")
    expect(text).toContain('also appear in util:case')
  })
})

describe('headTerm', () => {
  it('is the title before the first ": " or " — ", without "Online", lowercased', () => {
    expect(headTerm('Base64 Encode Online: Convert Text to Base64')).toBe('base64 encode')
    expect(headTerm('Escape HTML Online: Encode &, <, > and quotes')).toBe('escape html')
    expect(headTerm('Slug Generator Online — URL-Safe Slugs From Any Text')).toBe('slug generator')
    expect(headTerm('CSV to SQL INSERT Generator Online')).toBe('csv to sql insert generator')
    expect(headTerm('Tabs to Spaces Converter Online (and Back)')).toBe('tabs to spaces converter (and back)')
  })
})

describe('shingles / overlap', () => {
  it('compares prose as 8-word runs, ignoring code, link targets and case', () => {
    const a = shingles('---\ntitle: t\n---\nOne two three four five six seven eight nine `code here` [x](/util/a/)')
    expect([...a]).toEqual([
      'one two three four five six seven eight',
      'two three four five six seven eight nine',
      'three four five six seven eight nine x',
    ])
    expect(overlap(a, shingles('ONE TWO THREE FOUR FIVE SIX SEVEN EIGHT'))).toBeCloseTo(1 / 3)
    expect(overlap(new Set(), a)).toBe(0)
  })
})
