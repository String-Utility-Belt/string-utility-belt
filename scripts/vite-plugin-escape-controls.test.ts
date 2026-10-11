import { describe, expect, it } from 'vitest'
import { escapeControlChars } from './vite-plugin-escape-controls'

/** The module's exports, by evaluating `code` as a data: URL module; a regex as the characters below U+0100 it matches. */
const run = async (code: string): Promise<Record<string, unknown>> => {
  const mod = await import(/* @vite-ignore */ `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
  return Object.fromEntries(Object.entries(mod).map(([k, v]) => [k, v instanceof RegExp
    ? Array.from({ length: 0x100 }, (_, i) => String.fromCharCode(i)).filter(ch => new RegExp(v.source, v.flags).test(ch)).join('')
    : v]))
}

describe('escapeControlChars', () => {
  it('leaves code without control characters untouched', () => {
    const code = 'export const a=`tab\there`,b="é😀",c=12n;'
    expect(escapeControlChars(code, 'a.js')).toBe(code)
  })

  it('escapes them in strings, untagged templates and regexes, keeping every value', async () => {
    const code = 'export const big=2n**64n,s="\u0001é\u007f",t=`a\u001a${1}b\u0002`,r=/[\u0000-\u001f\u007f]/u,n=r.test("\u0003");'
    const out = escapeControlChars(code, 'a.js')
    expect(out).toBe('export const big=2n**64n,s="\\x01é\\x7f",t=`a\\x1a${1}b\\x02`,r=/[\\x00-\\x1f\\x7f]/u,n=r.test("\\x03");')
    expect(await run(out)).toEqual(await run(code))
  })

  it('replaces an identity escape of one with the hex escape, and keeps an escaped backslash before one', async () => {
    const code = 'export const a="\\\u0001",b="\\\\\u0002";'
    const out = escapeControlChars(code, 'a.js')
    expect(out).toBe('export const a="\\x01",b="\\\\\\x02";')
    expect(await run(out)).toEqual({ a: '\u0001', b: '\\\u0002' })
  })

  it('refuses one in a tagged template, whose raw text the tag sees', () => {
    expect(() => escapeControlChars('export const a=String.raw`\u0001${1}`;', 'tag.js'))
      .toThrow(/tag\.js: raw U\+0001 at offset 26 is outside any string, untagged template or regex literal/)
  })

  it('refuses one in a comment or as whitespace', () => {
    expect(() => escapeControlChars('/* \u0001 */export const a=1;', 'c.js')).toThrow(/c\.js: raw U\+0001/)
    expect(() => escapeControlChars('export const a=1;\u000bexport const b=2;', 'w.js')).toThrow(/w\.js: raw U\+000B/)
  })

  it('escapes inside the expressions of a tagged template', () => {
    expect(escapeControlChars('export const a=String.raw`x${"\u0001"}y`;', 'a.js')).toBe('export const a=String.raw`x${"\\x01"}y`;')
  })
})
