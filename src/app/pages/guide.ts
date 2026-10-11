import { mdToHtml, parseFrontmatter, escapeHtml } from '@/lib/markdown'
import type { UtilityExample } from '@/types/utility'

/**
 * Utility guides: the long-form "how it works" write-up behind each doc page's
 * expandable section. One markdown file per utility at
 * `src/utilities/<id>/guide.md`, served as `/guides/<id>.md`
 * (`scripts/vite-plugin-guides.ts`) and pre-rendered into `/util/<id>/`
 * (`scripts/seo/build.ts`).
 *
 * ```md
 * ---
 * title: Base64 Encode Online — Text to Base64 Converter     (<title>, ≤ 60 chars)
 * description: Encode text or bytes to Base64 …               (meta description)
 * ---
 * ## What is Base64?                                          (sections: ## and ###)
 * Prose, `code`, **bold**, [links](/util/base64_decode/), lists, pipe tables.
 *
 * ```example
 * title: three bytes become four characters
 * params: {"urlSafe": true}
 * input: Man
 * output: TWFu
 * ```
 * ```
 *
 * An `example` block is a worked example that `src/utilities/guides.test.ts`
 * executes, exactly like a utility's own `examples`, so a guide cannot show an
 * output the utility does not produce. Header lines (all optional) come first:
 * `title:`, `params:` (a JSON object), `input-encoding:` (`hex` | `base64` |
 * `json`), `output-matches:` (a regex, for output that varies between runs or that
 * markdown cannot hold, such as control bytes or CRLF —
 * any `output` is then a sample that must match it). Then `input:` and
 * `output:`. A value may start on its marker line (`input: Man`) or on the
 * next one, and runs over any further lines: the input up to `output:` (or a
 * `params:` / `input-encoding:` / `output-matches:` line, which may also sit
 * between input and output), the output to the closing fence. Use a longer
 * fence (````example) when a value itself contains ```.
 */

export interface Guide {
  /** SEO page title (without the site name). */
  title?: string
  /** Meta description. */
  description?: string
  blocks: GuideBlock[]
  /** Problems with `example` blocks (they render as plain code instead). */
  errors: string[]
}

export type GuideBlock =
  | { kind: 'markdown'; source: string }
  | { kind: 'list'; ordered: boolean; items: string[] }
  | { kind: 'table'; header: string[]; rows: string[][] }
  | { kind: 'example'; example: UtilityExample }

const FENCE_OPEN = /^(`{3,})[ \t]*([\w+#.-]*)[ \t]*$/
const LIST_ITEM = /^ {0,3}(?:[-*+]|(\d{1,9})[.)])[ \t]+(.*)$/
const LIST_CONTINUATION = /^(?: {2,}|\t)\S/
const TABLE_ROW = /^[ \t]*\|.*\|[ \t]*$/
const TABLE_SEPARATOR = /^[ \t]*\|?(?:[ \t]*:?-{3,}:?[ \t]*\|)+(?:[ \t]*:?-{3,}:?[ \t]*)?[ \t]*$/
const EXAMPLE_HEADER = /^([a-z-]+):(?:[ \t](.*))?$/
const INPUT_ENCODINGS = ['text', 'hex', 'base64', 'json'] as const

/** `| a | b \| c |` → `['a', 'b | c']` */
function tableCells(line: string): string[] {
  const inner = line.trim().replace(/^\|/, '').replace(/(?<!\\)\|$/, '')
  return inner.split(/(?<!\\)\|/).map(cell => cell.trim().replace(/\\\|/g, '|'))
}

/** An `input:` / `output:` marker: `inline` is set when the value starts on the marker line. */
function marker(line: string, name: 'input' | 'output'): { inline?: string } | null {
  if (!line.startsWith(`${name}:`)) return null
  const rest = line.slice(name.length + 1)
  return rest.trim() === '' ? {} : { inline: rest.replace(/^[ \t]/, '') }
}

function parseParams(value: string): Record<string, unknown> | null {
  try {
    const params: unknown = JSON.parse(value)
    return params && typeof params === 'object' && !Array.isArray(params) ? params as Record<string, unknown> : null
  } catch {
    return null
  }
}

/** Sets one header field on `example`; throws a readable message on a bad name or value. */
function applyField(example: Partial<UtilityExample>, name: string, value: string): void {
  switch (name) {
    case 'title':
      example.title = value
      break
    case 'params': {
      try { JSON.parse(value) } catch { throw new Error(`params is not valid JSON: ${value}`) }
      const params = parseParams(value)
      if (!params) throw new Error('params must be a JSON object')
      example.params = params
      break
    }
    case 'input-encoding':
      if (!(INPUT_ENCODINGS as readonly string[]).includes(value)) throw new Error(`input-encoding must be one of ${INPUT_ENCODINGS.join(', ')}`)
      example.inputEncoding = value as UtilityExample['inputEncoding']
      break
    case 'output-matches':
      try { new RegExp(value) } catch { throw new Error(`output-matches is not a valid regex: ${value}`) }
      example.outputMatches = value
      break
    default:
      throw new Error(`unknown example field "${name}"`)
  }
}

/**
 * A header field written between the input and the output. Stricter than the
 * header proper, so input text that merely looks like one stays input: no
 * `title:` (a YAML input's own `title:` key), `params:` only as a JSON object,
 * `input-encoding:` only with a known encoding.
 */
function lateField(line: string): [string, string] | null {
  const m = EXAMPLE_HEADER.exec(line)
  if (!m) return null
  const value = (m[2] ?? '').trim()
  if (m[1] === 'output-matches') return [m[1], value]
  if (m[1] === 'params' && parseParams(value)) return [m[1], value]
  if (m[1] === 'input-encoding' && (INPUT_ENCODINGS as readonly string[]).includes(value)) return [m[1], value]
  return null
}

/**
 * The value that starts at the marker on `lines[at]`: its inline part (if any)
 * plus every following line up to the first one `stop` accepts. After an inline
 * start, trailing blank lines are layout rather than data and are dropped.
 */
function takeValue(lines: string[], at: number, name: 'input' | 'output', stop: (line: string) => boolean): { value: string; next: number } {
  const { inline } = marker(lines[at], name)!
  let next = at + 1
  while (next < lines.length && !stop(lines[next])) next++
  const rest = lines.slice(at + 1, next)
  if (inline === undefined) return { value: rest.join('\n'), next }
  const all = [inline, ...rest]
  while (all.length > 1 && !all[all.length - 1].trim()) all.pop()
  return { value: all.join('\n'), next }
}

/** Parses the body of an `example` fence; throws a readable message on anything malformed. */
export function parseExampleBlock(lines: string[]): UtilityExample {
  const example: Partial<UtilityExample> = {}
  let i = 0
  for (; i < lines.length && !marker(lines[i], 'input'); i++) {
    const line = lines[i]
    if (!line.trim()) continue
    const m = EXAMPLE_HEADER.exec(line)
    if (!m) throw new Error(`unexpected line before input: ${JSON.stringify(line)}`)
    applyField(example, m[1], (m[2] ?? '').trim())
  }
  if (i === lines.length) throw new Error('missing input:')

  const input = takeValue(lines, i, 'input', line => !!marker(line, 'output') || !!lateField(line))
  example.input = input.value
  let j = input.next
  for (; j < lines.length && !marker(lines[j], 'output'); j++) {
    const field = lateField(lines[j])
    if (field) applyField(example, ...field)
  }
  if (j < lines.length) example.output = takeValue(lines, j, 'output', () => false).value

  if (example.output === undefined && example.outputMatches === undefined) throw new Error('needs output: or output-matches:')
  return example as UtilityExample
}

/**
 * A utility page's `<h1>`, from its guide's title: the search term before the first
 * `: ` or ` — `, without "Online", which the `<title>` already carries
 * ("Base64 Encode Online: Convert Text to Base64" → "Base64 Encode").
 */
export function pageHeading(title: string): string {
  return title.split(/: | — /)[0].replace(/\s+online\b/gi, '').trim()
}

/** Splits a guide into frontmatter and render blocks. Never throws: bad examples are reported in `errors`. */
export function parseGuide(source: string): Guide {
  const { frontmatter, body } = parseFrontmatter(String(source).replace(/\r\n?/g, '\n')) as {
    frontmatter: Record<string, string>
    body: string
  }
  const lines = body.split('\n')
  const blocks: GuideBlock[] = []
  const errors: string[] = []
  let markdown: string[] = []
  const flush = () => {
    if (markdown.some(l => l.trim())) blocks.push({ kind: 'markdown', source: markdown.join('\n') })
    markdown = []
  }

  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const fence = FENCE_OPEN.exec(line)
    if (fence) {
      const close = lines.findIndex((l, k) => k > i && l.trim() === fence[1])
      if (close === -1) { markdown.push(...lines.slice(i)); break }
      if (fence[2] === 'example') {
        try {
          const example = parseExampleBlock(lines.slice(i + 1, close))
          flush()
          blocks.push({ kind: 'example', example })
        } catch (e) {
          errors.push(`example block at line ${i + 1}: ${(e as Error).message}`)
          markdown.push('```', ...lines.slice(i + 1, close), '```')
        }
      } else {
        markdown.push(...lines.slice(i, close + 1))
      }
      i = close + 1
      continue
    }

    const item = LIST_ITEM.exec(line)
    if (item) {
      flush()
      const ordered = item[1] !== undefined
      const items: string[] = []
      while (i < lines.length) {
        const m = LIST_ITEM.exec(lines[i])
        if (m && (m[1] !== undefined) === ordered) items.push(m[2].trim())
        else if (!m && LIST_CONTINUATION.test(lines[i]) && items.length) items[items.length - 1] += ` ${lines[i].trim()}`
        else if (!lines[i].trim() && LIST_ITEM.test(lines[i + 1] ?? '') && (LIST_ITEM.exec(lines[i + 1])![1] !== undefined) === ordered) { /* loose list */ }
        else break
        i++
      }
      blocks.push({ kind: 'list', ordered, items })
      continue
    }

    if (TABLE_ROW.test(line) && TABLE_SEPARATOR.test(lines[i + 1] ?? '')) {
      flush()
      const header = tableCells(line)
      const rows: string[][] = []
      i += 2
      while (i < lines.length && TABLE_ROW.test(lines[i])) rows.push(tableCells(lines[i++]))
      blocks.push({ kind: 'table', header, rows })
      continue
    }

    markdown.push(line)
    i++
  }
  flush()

  return { title: frontmatter.title || undefined, description: frontmatter.description || undefined, blocks, errors }
}

// ---------------------------------------------------------------------------
// Rendering — everything goes through mdToHtml / escapeHtml, so guide text can
// only ever produce the markup those emit
// ---------------------------------------------------------------------------

const PARAGRAPH = /^<p class="md-p">([\s\S]*)<\/p>$/

/** One line of inline markdown (code, emphasis, links) without its paragraph wrapper. */
function inlineHtml(text: string): string {
  const html = mdToHtml(text)
  return PARAGRAPH.exec(html)?.[1] ?? html
}

/**
 * The page's `<h1>` is the guide title's search term (`pageHeading`) and the guide's `<summary>` is an
 * `<h2>`, so the guide's own `##` / `###` sections drop one level.
 */
function demoteHeadings(html: string): string {
  return html
    .replace(/<(\/?)h3\b/g, '<$1h4')
    .replace(/<(\/?)h2\b/g, '<$1h3')
    .replace(/<(\/?)h1\b/g, '<$1h2')
}

const codeBlock = (text: string) =>
  `<pre class="md-pre" tabindex="0"><code class="md-code-block">${escapeHtml(text)}</code></pre>`

function renderExample(ex: UtilityExample): string {
  const title = ex.title ? `<figcaption class="guide-example-title">${escapeHtml(ex.title)}</figcaption>` : ''
  const params = ex.params && Object.keys(ex.params).length > 0
    ? `<p class="guide-example-params">with ${Object.entries(ex.params)
      .map(([k, v]) => `<code class="md-code">${escapeHtml(k)}: ${escapeHtml(JSON.stringify(v))}</code>`)
      .join(' ')}</p>`
    : ''
  const encoding = ex.inputEncoding && ex.inputEncoding !== 'text' ? ` (${escapeHtml(ex.inputEncoding)})` : ''
  // a generator ignores its input: an empty input box would only be noise
  const input = ex.input === '' ? '' : `<div class="guide-example-label">Input${encoding}</div>${codeBlock(ex.input)}`
  const varies = ex.outputMatches !== undefined
  const output = ex.output !== undefined
    ? `<div class="guide-example-label">${varies ? 'Sample output (varies between runs)' : 'Output'}</div>${codeBlock(ex.output)}`
    // a pattern alone is also how an output that cannot be written in markdown (control bytes,
    // CRLF) is checked, so this label must not claim the output varies
    : `<div class="guide-example-label">Output matches this pattern</div>${codeBlock(`/${ex.outputMatches}/`)}`
  return `<figure class="guide-example">${title}${params}${input}${output}</figure>`
}

function renderBlock(block: GuideBlock, demote = true): string {
  switch (block.kind) {
    case 'markdown':
      return demote ? demoteHeadings(mdToHtml(block.source)) : mdToHtml(block.source)
    case 'list': {
      const tag = block.ordered ? 'ol' : 'ul'
      return `<${tag} class="md-${tag}">${block.items.map(item => `<li class="md-li">${inlineHtml(item)}</li>`).join('')}</${tag}>`
    }
    case 'table':
      return `<div class="md-table-wrap"><table class="md-table"><thead><tr>${block.header
        .map(cell => `<th scope="col">${inlineHtml(cell)}</th>`).join('')}</tr></thead><tbody>${block.rows
        .map(row => `<tr>${row.map(cell => `<td>${inlineHtml(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`
    case 'example':
      return renderExample(block.example)
  }
}

/** A parsed guide's body as trusted HTML (shared by `UtilityGuide` and the pre-rendered page). */
export function renderGuideHtml(guide: Guide): string {
  return guide.blocks.map(block => renderBlock(block)).join('\n')
}

/**
 * A standalone markdown document — blog post or site page body — with the
 * guide syntax (lists, pipe tables) but its headings at their own level: here
 * the page's `<h1>` is the document title, so `##` stays an `<h2>`.
 */
export function renderMarkdownDocument(source: string): string {
  return parseGuide(source).blocks.map(block => renderBlock(block, false)).join('\n')
}

/** Every worked example in a guide, in order. */
export const guideExamples = (guide: Guide): UtilityExample[] =>
  guide.blocks.flatMap(b => (b.kind === 'example' ? [b.example] : []))

/** The `<summary>` heading: `How base64 encode works` (legacy ids-as-names read better spaced). */
export const guideHeading = (name: string): string => `How ${name.replace(/_/g, ' ')} works`

/** Where the app fetches a guide from; the file itself lives at `src/utilities/<id>/guide.md`. */
export const guideUrl = (id: string, base = '/'): string => `${base}guides/${encodeURIComponent(id)}.md`
