import { describe, it, expect } from 'vitest'
import { HIDDEN_CONTROL_CHAR } from '@/core/coerce'
import { parseGuide, parseExampleBlock, renderGuideHtml, renderMarkdownDocument, guideExamples, guideHeading, guideUrl, pageHeading } from './guide'
import { HEADINGS } from '@/utilities/_generated/headings'
import { MANIFEST } from '@/utilities/_generated/manifest'
import { utilityHeading } from './utilityHeading'

const FENCE = '```'
const html = (source: string) => renderGuideHtml(parseGuide(source))

describe('parseGuide', () => {
  it('reads the SEO title and description from frontmatter', () => {
    const g = parseGuide('---\ntitle: Base64 Encode Online\ndescription: "Encode text: fast"\n---\n## Hi\n')
    expect(g.title).toBe('Base64 Encode Online')
    expect(g.description).toBe('Encode text: fast')
    expect(g.errors).toEqual([])
  })

  it('handles CRLF sources and a guide with no frontmatter', () => {
    const g = parseGuide('## A\r\n\r\n- one\r\n- two\r\n')
    expect(g.title).toBeUndefined()
    expect(g.blocks).toEqual([
      { kind: 'markdown', source: '## A\n' },
      { kind: 'list', ordered: false, items: ['one', 'two'] },
    ])
  })

  it('splits out lists (with continuation lines and loose items) and ordered lists', () => {
    const g = parseGuide('- first\n  wrapped\n\n- second\n\n1. one\n2) two\n\nafter')
    expect(g.blocks).toEqual([
      { kind: 'list', ordered: false, items: ['first wrapped', 'second'] },
      { kind: 'list', ordered: true, items: ['one', 'two'] },
      { kind: 'markdown', source: '\nafter' },
    ])
  })

  it('splits out pipe tables, honouring escaped pipes', () => {
    const g = parseGuide('| char | code |\n| --- | :---: |\n| `a` | 97 |\n| \\| | 124 |\n\ntext')
    expect(g.blocks[0]).toEqual({ kind: 'table', header: ['char', 'code'], rows: [['`a`', '97'], ['|', '124']] })
  })

  it('leaves list- and table-looking lines inside a code fence alone', () => {
    const source = `${FENCE}\n- not a list\n| a | b |\n|---|---|\n${FENCE}`
    expect(parseGuide(source).blocks).toEqual([{ kind: 'markdown', source }])
  })

  it('parses example blocks into worked examples, in order', () => {
    const g = parseGuide([
      '## Examples', '',
      `${FENCE}example`, 'title: three bytes', 'input: Man', 'output: TWFu', FENCE,
      'between',
      `${FENCE}example`, 'params: {"urlSafe": true}', 'input:', 'line 1', 'line 2', 'output:', 'out 1', 'out 2', FENCE,
    ].join('\n'))
    expect(g.errors).toEqual([])
    expect(guideExamples(g)).toEqual([
      { title: 'three bytes', input: 'Man', output: 'TWFu' },
      { params: { urlSafe: true }, input: 'line 1\nline 2', output: 'out 1\nout 2' },
    ])
    expect(g.blocks.map(b => b.kind)).toEqual(['markdown', 'example', 'markdown', 'example'])
  })

  it('takes a longer fence so a value can contain ```', () => {
    const g = parseGuide(['````example', 'input:', FENCE, 'code', FENCE, 'output: code', '````'].join('\n'))
    expect(guideExamples(g)).toEqual([{ input: `${FENCE}\ncode\n${FENCE}`, output: 'code' }])
  })

  it('reports a malformed example and renders it as plain code instead', () => {
    const g = parseGuide(`${FENCE}example\ninput: a\n${FENCE}`)
    expect(g.errors).toEqual(['example block at line 1: needs output: or output-matches:'])
    expect(guideExamples(g)).toEqual([])
    expect(renderGuideHtml(g)).toContain('<pre class="md-pre"')
  })
})

describe('parseExampleBlock', () => {
  it('keeps inline values exact, leading spaces included', () => {
    expect(parseExampleBlock(['input:   padded', 'output: padded'])).toEqual({ input: '  padded', output: 'padded' })
  })

  it('reads Control Pictures in a value back as the control characters', () => {
    expect(parseExampleBlock(['input: ␛[31mred␛[0m', 'output: ␀x␡'])).toEqual({ input: '\u001b[31mred\u001b[0m', output: '\u0000x\u007f' })
  })

  it('takes an empty input (a generator) and output-matches without an output', () => {
    expect(parseExampleBlock(['output-matches: ^[0-9a-f]{8}$', 'input:'])).toEqual({ input: '', outputMatches: '^[0-9a-f]{8}$' })
    expect(parseExampleBlock(['input:', 'output: x'])).toEqual({ input: '', output: 'x' })
  })

  it('accepts input-encoding', () => {
    expect(parseExampleBlock(['input-encoding: hex', 'input: 48 69', 'output: SGk='])).toMatchObject({ inputEncoding: 'hex' })
  })

  it.each([
    [['title: x'], 'missing input:'],
    [['params: [1]', 'input: a', 'output: b'], 'params must be a JSON object'],
    [['params: {bad}', 'input: a', 'output: b'], 'params is not valid JSON'],
    [['input-encoding: utf16', 'input: a', 'output: b'], 'input-encoding must be one of'],
    [['output-matches: (', 'input: a'], 'not a valid regex'],
    [['colour: red', 'input: a', 'output: b'], 'unknown example field "colour"'],
    [['just prose', 'input: a', 'output: b'], 'unexpected line before input'],
  ])('rejects %j', (lines, message) => {
    expect(() => parseExampleBlock(lines)).toThrow(message)
  })

  it('continues a value that starts on its marker line over the following lines', () => {
    expect(parseExampleBlock(['input: name age', 'Alice 30', 'output: name   age', 'Alice  30'])).toEqual({
      input: 'name age\nAlice 30',
      output: 'name   age\nAlice  30',
    })
  })

  it('drops trailing blank lines after an inline start, but keeps a block value exact', () => {
    expect(parseExampleBlock(['input: a', '', 'output: b', ''])).toEqual({ input: 'a', output: 'b' })
    expect(parseExampleBlock(['input:', 'a', '', 'output:', 'b', ''])).toEqual({ input: 'a\n', output: 'b\n' })
  })

  it('takes params / input-encoding / output-matches written between input and output', () => {
    expect(parseExampleBlock(['input: 48 69', 'input-encoding: hex', 'params: {"n": 1}', 'output: SGk='])).toEqual({
      input: '48 69', inputEncoding: 'hex', params: { n: 1 }, output: 'SGk=',
    })
    expect(parseExampleBlock(['params: {"password": "pw"}', 'input: secret', 'output-matches: ^[A-Za-z0-9+/]+=*$'])).toEqual({
      params: { password: 'pw' }, input: 'secret', outputMatches: '^[A-Za-z0-9+/]+=*$',
    })
  })

  it('keeps input lines that only look like fields (a YAML title:, non-JSON params:) as input', () => {
    expect(parseExampleBlock(['input:', 'title: My doc', 'params: {a: 1}', 'output: {}'])).toEqual({
      input: 'title: My doc\nparams: {a: 1}', output: '{}',
    })
  })
})

describe('renderGuideHtml', () => {
  it('drops ## and ### one level (the guide sits under the page h1 and its own h2)', () => {
    const out = html('## Section\n\n### Sub')
    expect(out).toContain('<h3 class="md-h2">Section</h3>')
    expect(out).toContain('<h4 class="md-h3">Sub</h4>')
    expect(out).not.toMatch(/<h2\b/)
  })

  it('renders inline markdown in list items and table cells', () => {
    const out = html('- **bold** and `code`\n\n| a |\n|---|\n| [x](/util/trim/) |')
    expect(out).toContain('<ul class="md-ul"><li class="md-li"><strong>bold</strong> and <code class="md-code">code</code></li></ul>')
    expect(out).toContain('<td><a class="md-link" href="/util/trim/">x</a></td>')
    expect(out).toContain('<th scope="col">a</th>')
  })

  it('renders a worked example with its params, input label and output', () => {
    const out = html(`${FENCE}example\ntitle: t\nparams: {"n": 2, "mode": "x"}\ninput-encoding: hex\ninput: 00ff\noutput: <b>\n${FENCE}`)
    expect(out).toContain('<figcaption class="guide-example-title">t</figcaption>')
    expect(out).toContain('<code class="md-code">n: 2</code> <code class="md-code">mode: &quot;x&quot;</code>')
    expect(out).toContain('Input (hex)')
    expect(out).toContain('&lt;b&gt;')
    expect(out).not.toContain('<b>')
  })

  it('labels varying output and hides the input box for a generator', () => {
    const sample = html(`${FENCE}example\noutput-matches: ^\\d+$\ninput:\noutput: 42\n${FENCE}`)
    expect(sample).toContain('Sample output (varies between runs)')
    expect(sample).not.toContain('>Input<')
    const pattern = html(`${FENCE}example\noutput-matches: ^\\d+$\ninput: x\n${FENCE}`)
    expect(pattern).toContain('/^\\d+$/')
    // a pattern also stands in for deterministic output markdown can't hold (CRLF)
    expect(pattern).toContain('Output matches this pattern')
    expect(pattern).not.toContain('varies')
  })

  it('shows control characters in an example as Control Pictures, never raw', () => {
    const out = html(`${FENCE}example\ninput: ␛]0;t␇x\noutput: x\n${FENCE}`)
    expect(out).toContain('␛]0;t␇x')
    expect(out).not.toMatch(HIDDEN_CONTROL_CHAR)
  })

  it('never lets raw HTML in any part of a guide become markup', () => {
    const xss = '<img src=x onerror=alert(1)>'
    const out = html([
      `## ${xss}`, xss, `- ${xss}`, '', `| ${xss} |`, '|---|', `| ${xss} |`, '',
      `${FENCE}example`, `title: ${xss}`, `params: {"${xss}": "${xss.replace(/"/g, '')}"}`, `input: ${xss}`, `output: ${xss}`, FENCE,
    ].join('\n'))
    expect(out).not.toContain('<img')
    expect(out).toContain('&lt;img')
  })

  it('never turns a javascript: link into a live href', () => {
    expect(html('- [x](javascript:alert(1))')).toContain('href="#"')
  })
})

describe('helpers', () => {
  it('builds the summary heading and guide url', () => {
    expect(guideHeading('base64_encode')).toBe('How base64 encode works')
    expect(guideHeading('aes decrypt')).toBe('How aes decrypt works')
    expect(guideUrl('trim')).toBe('/guides/trim.md')
    expect(guideUrl('trim', '/app/')).toBe('/app/guides/trim.md')
  })
})

describe('pageHeading', () => {
  it('takes the search term before the first ": " or " — ", without "Online"', () => {
    expect(pageHeading('Base64 Encode Online: Convert Text to Base64')).toBe('Base64 Encode')
    expect(pageHeading('Slug Generator Online — URL-Safe Slugs')).toBe('Slug Generator')
    expect(pageHeading('CSV to HTML Table Converter Online')).toBe('CSV to HTML Table Converter')
    expect(pageHeading('Tabs to Spaces Converter Online (and Back)')).toBe('Tabs to Spaces Converter (and Back)')
    expect(pageHeading('Escape HTML Online: Encode &, <, > and quotes')).toBe('Escape HTML')
  })

  it('gives every utility page a heading, falling back to the utility name', () => {
    expect(utilityHeading('base64_encode', 'base64 encode')).toBe('Base64 Encode')
    expect(utilityHeading('no_guide', 'no_guide')).toBe('no guide')
    for (const m of MANIFEST) {
      const heading = HEADINGS[m.id]
      expect(heading, m.id).toBeTruthy()
      expect(heading.length, m.id).toBeLessThanOrEqual(60)
    }
  })
})

describe('renderMarkdownDocument', () => {
  it('keeps headings at their own level (a document, not a guide under an h2), with lists and tables', () => {
    const out = renderMarkdownDocument('# Title\n\n## Section\n\n### Sub\n\n- a\n- b\n\n| x | y |\n| --- | --- |\n| 1 | 2 |\n')
    expect(out).toContain('<h1 class="md-h1">Title</h1>')
    expect(out).toContain('<h2 class="md-h2">Section</h2>')
    expect(out).toContain('<h3 class="md-h3">Sub</h3>')
    expect(out).toContain('<ul class="md-ul">')
    expect(out).toContain('<table class="md-table">')
  })

  it('escapes raw HTML like every other renderer', () => {
    expect(renderMarkdownDocument('<img src=x onerror=alert(1)>\n\n- <script>x</script>')).not.toMatch(/<img|<script/)
  })
})
