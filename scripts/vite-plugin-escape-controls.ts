import { parseAst, type Plugin } from 'vite'
import { HIDDEN_CONTROL_CHAR } from '../src/core/coerce'

/**
 * Escapes the raw control characters the minifier leaves in built JS chunks.
 *
 * The Oxc minifier turns string literals into template literals where that is shorter, and
 * prints some C0 control characters (U+0001, U+001A, DEL…) raw inside them, `asciiOnly` or
 * not: a utility's example output, or a dependency's `"\x02"`, then ships as a raw byte, and
 * `grep` and other tools take the chunk as binary. This rewrites each one as `\xNN` inside the
 * string, untagged template or regex literal that holds it, where the escape means the same
 * character, and re-parses the chunk to prove nothing else changed. A control character
 * anywhere else (a tagged template, whose raw text is observable, or a comment) fails the
 * build rather than being guessed at. `scripts/distText.ts` checks the result in every build.
 */

type Span = { start: number; end: number }

const HIDDEN = new RegExp(HIDDEN_CONTROL_CHAR.source, 'g')

interface Node { type: string; start: number; end: number; [key: string]: unknown }
const isNode = (v: unknown): v is Node => !!v && typeof v === 'object' && typeof (v as Node).type === 'string'

/** The spans of every literal in which `\xNN` means the character itself, in source order. */
function escapableSpans(ast: unknown): Span[] {
  const spans: Span[] = []
  const visit = (value: unknown, tagged = false): void => {
    if (Array.isArray(value)) { for (const v of value) visit(v); return }
    if (!isNode(value)) return
    if (value.type === 'Literal' && (typeof value.value === 'string' || value.regex)) spans.push({ start: value.start, end: value.end })
    // a tagged template's quasis reach the tag as raw text too: an escape there is observable
    if (value.type === 'TemplateElement' && !tagged) spans.push({ start: value.start, end: value.end })
    for (const [key, child] of Object.entries(value)) {
      if (key === 'quasi' && value.type === 'TaggedTemplateExpression' && isNode(child)) {
        visit(child.expressions)
        for (const q of child.quasis as unknown[]) visit(q, true)
      } else if (child && typeof child === 'object') {
        visit(child)
      }
    }
  }
  visit(ast)
  return spans.sort((a, b) => a.start - b.start)
}

/** The AST without positions or raw source text: equal for two chunks that mean the same. */
function shape(ast: unknown): string {
  return JSON.stringify(ast, (key, value) => {
    if (key === 'start' || key === 'end' || key === 'raw') return undefined
    // a regex's pattern is source text; its flags and every other node must match
    if (key === 'pattern') return undefined
    return typeof value === 'bigint' ? `${value}n` : value
  })
}

const hex = (ch: string) => `\\x${ch.charCodeAt(0).toString(16).padStart(2, '0')}`

/**
 * `code` with every raw hidden control character (C0 other than tab, LF and CR, plus DEL) in
 * a string, untagged template or regex literal written as `\xNN`. Throws, naming `fileName`
 * and the offset, on one anywhere else, or if the rewrite changed what the code means.
 */
export function escapeControlChars(code: string, fileName: string): string {
  if (!HIDDEN_CONTROL_CHAR.test(code)) return code
  const before = parseAst(code, { lang: 'js', sourceType: 'module' }, fileName)
  const spans = escapableSpans(before)

  let out = ''
  let copied = 0
  let s = 0
  for (const m of code.matchAll(HIDDEN)) {
    const at = m.index
    while (s < spans.length && spans[s].end <= at) s++
    if (s === spans.length || spans[s].start > at) {
      const code16 = m[0].charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')
      throw new Error(`${fileName}: raw U+${code16} at offset ${at} is outside any string, untagged template or regex literal, so it cannot be escaped safely: "${code.slice(Math.max(0, at - 40), at + 20).replace(HIDDEN, hex)}"`)
    }
    // an odd run of backslashes before it makes it an identity escape (`"\<U+0001>"` is U+0001): replace both
    let slashes = 0
    while (at - slashes - 1 >= spans[s].start && code[at - slashes - 1] === '\\') slashes++
    const from = slashes % 2 === 1 ? at - 1 : at
    out += code.slice(copied, from) + hex(m[0])
    copied = at + 1
  }
  out += code.slice(copied)

  if (shape(parseAst(out, { lang: 'js', sourceType: 'module' }, fileName)) !== shape(before)) {
    throw new Error(`${fileName}: escaping its raw control characters changed the parsed code`)
  }
  return out
}

/** Runs `escapeControlChars` over every JS chunk once it is minified, before anything reads its code. */
export function escapeControls(): Plugin {
  return {
    name: 'escape-controls',
    apply: 'build',
    enforce: 'post',
    generateBundle: {
      // first: the service worker plugin fingerprints the chunks' code in its own generateBundle
      order: 'pre',
      handler(_options, bundle) {
        for (const chunk of Object.values(bundle)) {
          if (chunk.type !== 'chunk') continue
          const code = escapeControlChars(chunk.code, chunk.fileName)
          if (code === chunk.code) continue
          // a source map's columns would point past every escape on the line
          if (chunk.map) this.error(`${chunk.fileName}: cannot escape control characters in a chunk with a source map`)
          chunk.code = code
        }
      },
    },
  }
}
