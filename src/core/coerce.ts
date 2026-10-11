import type { Accepts, Value, ValueType } from '../types/utility'

/**
 * A real Uint8Array, including one from another realm (a Worker, jsdom). Checked via
 * the internal [[TypedArrayName]] slot rather than `constructor.name`: a plain JSON
 * object like `{"constructor":{"name":"Uint8Array"}}` must not pass for bytes.
 */
export const isBytes = (v: unknown): v is Uint8Array =>
  v instanceof Uint8Array ||
  (ArrayBuffer.isView(v) && Object.prototype.toString.call(v) === '[object Uint8Array]')

export function valueType(v: Value): ValueType {
  if (isBytes(v)) return 'bytes'
  // arrays are JSON too: a utility may legitimately produce a top-level list
  if (v && typeof v === 'object') return 'json'
  return 'string'
}

export const typesOf = (t: Accepts | undefined, fallback: ValueType = 'string'): ValueType[] =>
  t === undefined ? [fallback] : Array.isArray(t) ? t : [t]

export function resolveAccepts(accepts: Accepts | undefined, value: Value): ValueType {
  if (!accepts) return 'string'
  if (!Array.isArray(accepts)) return accepts
  const have = valueType(value)
  if (accepts.includes(have)) return have
  return accepts[0]
}

export function coerceInputFor(value: Value, want: ValueType): Value {
  const have = valueType(value)
  if (have === want) return value
  if (want === 'bytes' && have === 'string') return new TextEncoder().encode(value as string)
  if (want === 'string' && have === 'bytes') return new TextDecoder().decode(value as Uint8Array)
  if (want === 'json' && have === 'string') {
    try { return JSON.parse(value as string) } catch { return value }
  }
  if (want === 'json' && have === 'bytes') {
    try { return JSON.parse(new TextDecoder().decode(value as Uint8Array)) } catch { return value }
  }
  if (want === 'string' && have === 'json') {
    try { return JSON.stringify(value) } catch { return String(value) }
  }
  // json -> bytes: serialise, then encode
  if (want === 'bytes' && have === 'json') {
    try { return new TextEncoder().encode(JSON.stringify(value)) } catch { return value }
  }
  return value
}

/** The value as text: what a regex condition, a merge, or a copy button sees. */
export function asText(v: Value): string {
  const t = valueType(v)
  if (t === 'bytes') return new TextDecoder().decode(v as Uint8Array)
  if (t === 'json') { try { return JSON.stringify(v, null, 2) } catch { return String(v) } }
  return String(v ?? '')
}

export function isEmptyValue(v: Value): boolean {
  const t = valueType(v)
  if (t === 'bytes') return (v as Uint8Array).length === 0
  if (t === 'json') return Array.isArray(v) ? v.length === 0 : Object.keys(v as object).length === 0
  return String(v ?? '') === ''
}

export function formatForDisplay(v: Value): string {
  const t = valueType(v)
  if (t === 'bytes') {
    const arr = Array.from(v as Uint8Array)
    const byteArray = arr.map(b => b.toString().padStart(2, '0')).join(', ')
    const hexArray = arr.map(b => b.toString(16).padStart(2, '0')).join(', ')
    let utf8 = ''
    try { utf8 = new TextDecoder().decode(v as Uint8Array) } catch { /* non-UTF-8 bytes: omit utf8 line */ }
    return `bytes[${byteArray}]\nhex: [${hexArray}]${utf8 ? `\nutf8: ${utf8}` : ''}`
  }
  if (t === 'json') { try { return JSON.stringify(v, null, 2) } catch { return String(v) } }
  return String(v ?? '')
}

/**
 * C0 control characters other than tab, LF and CR, plus DEL: invisible on a page, and a
 * parse error in HTML (NUL becomes U+FFFD), so crawlers and tools may take the page as binary.
 */
// eslint-disable-next-line no-control-regex -- control characters are what this matches
export const HIDDEN_CONTROL_CHAR = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/
const HIDDEN_CONTROL_CHARS = new RegExp(HIDDEN_CONTROL_CHAR.source, 'g')
const CONTROL_PICTURES = /[\u2400-\u2408\u240B\u240C\u240E-\u241F\u2421]/g
const DEL = 0x7f
const PICTURE_OF_DEL = 0x2421
const PICTURES = 0x2400

/**
 * `text` with each of those characters as its Unicode Control Picture (U+2400 + code,
 * DEL as U+2421: NUL → ␀, ESC → ␛), so a page shows it. Display only: never for a value that
 * is copied, compared or run, which `formatForDisplay` gives as is.
 */
export const showControlChars = (text: string): string =>
  text.replace(HIDDEN_CONTROL_CHARS, ch => {
    const code = ch.charCodeAt(0)
    return String.fromCharCode(code === DEL ? PICTURE_OF_DEL : PICTURES + code)
  })

/** The inverse of `showControlChars`: each Control Picture it writes back as its control character. */
export const fromControlPictures = (text: string): string =>
  text.replace(CONTROL_PICTURES, ch => {
    const code = ch.charCodeAt(0)
    return String.fromCharCode(code === PICTURE_OF_DEL ? DEL : code - PICTURES)
  })

export type Compatibility = { level: 'exact' | 'coerce' | 'lossy'; note?: string }

/**
 * How well a value of type `from` feeds a utility that accepts `accepts`.
 * Every pairing is coercible, so the picker badges rather than hides.
 */
export function compatibility(from: ValueType[], accepts: Accepts | undefined): Compatibility {
  const want = typesOf(accepts)
  if (from.some(t => want.includes(t))) return { level: 'exact' }
  const f = from[0], w = want[0]
  if (f === 'bytes' && w === 'string') return { level: 'lossy', note: 'bytes are decoded as UTF-8' }
  if (f === 'string' && w === 'json') return { level: 'coerce', note: 'text must be valid JSON' }
  if (f === 'bytes' && w === 'json') return { level: 'coerce', note: 'bytes must be UTF-8 JSON' }
  return { level: 'coerce', note: `${f} is converted to ${w}` }
}
