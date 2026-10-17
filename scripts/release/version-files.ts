/**
 * Reading and rewriting version strings inside JSON files without reformatting
 * them: the value at a path is located in the source text and replaced in
 * place, so inline arrays, indentation and key order survive a release commit
 * byte for byte (a `JSON.parse` + `JSON.stringify` round trip would not).
 */

/** One place a target's version is written: a JSON file and the path to the string inside it. */
export interface VersionFile {
  path: string
  pointer: readonly (string | number)[]
  /** What the string holds before the version, e.g. `@scope/pkg@` in an `npx` argument that pins a package. */
  prefix?: string
}

export function readJsonVersion(text: string, pointer: VersionFile['pointer'], prefix = ''): string {
  const [start, end] = locateString(text, pointer)
  return versionAfter(JSON.parse(text.slice(start, end)) as string, pointer, prefix)
}

export function writeJsonVersion(text: string, pointer: VersionFile['pointer'], version: string, prefix = ''): string {
  const [start, end] = locateString(text, pointer)
  // a value that doesn't have the expected shape is refused, not overwritten
  versionAfter(JSON.parse(text.slice(start, end)) as string, pointer, prefix)
  const next = `${text.slice(0, start)}${JSON.stringify(prefix + version)}${text.slice(end)}`
  // belt and braces: the edit must change exactly that one value
  const expected = JSON.parse(text)
  setAt(expected, pointer, prefix + version)
  if (JSON.stringify(JSON.parse(next)) !== JSON.stringify(expected)) {
    throw new Error(`rewriting ${formatPointer(pointer)} changed more than the version`)
  }
  return next
}

/** What follows `prefix` in `value`, the string at `pointer`; throws when `value` doesn't start with it. */
function versionAfter(value: string, pointer: VersionFile['pointer'], prefix: string): string {
  if (!value.startsWith(prefix)) throw new Error(`the value at ${formatPointer(pointer)} does not start with ${JSON.stringify(prefix)}`)
  return value.slice(prefix.length)
}

export function formatPointer(pointer: VersionFile['pointer']): string {
  return pointer.map(p => (typeof p === 'number' ? `[${p}]` : `[${JSON.stringify(p)}]`)).join('')
}

function setAt(root: any, pointer: VersionFile['pointer'], value: string): void {
  let node = root
  for (const key of pointer.slice(0, -1)) node = node[key]
  node[pointer[pointer.length - 1]] = value
}

/** The `[start, end)` offsets of the JSON string literal at `pointer` in `text`. */
function locateString(text: string, pointer: VersionFile['pointer']): [number, number] {
  let i = skipWs(text, 0)
  for (let depth = 0; depth < pointer.length; depth++) {
    const key = pointer[depth]
    const found = typeof key === 'number' ? findElement(text, i, key) : findMember(text, i, key)
    if (found < 0) throw new Error(`no value at ${formatPointer(pointer.slice(0, depth + 1))}`)
    i = found
  }
  if (text[i] !== '"') throw new Error(`the value at ${formatPointer(pointer)} is not a string`)
  return [i, scanString(text, i)]
}

/** Offset of the value of member `key` in the object starting at `i`, or -1. */
function findMember(text: string, i: number, key: string): number {
  if (text[i] !== '{') return -1
  i = skipWs(text, i + 1)
  while (text[i] !== '}') {
    const keyEnd = scanString(text, i)
    const name = JSON.parse(text.slice(i, keyEnd)) as string
    i = skipWs(text, keyEnd)
    expect(text, i, ':')
    const valueStart = skipWs(text, i + 1)
    if (name === key) return valueStart
    i = afterSeparator(text, scanValue(text, valueStart), '}')
  }
  return -1
}

/** Offset of element `index` of the array starting at `i`, or -1. */
function findElement(text: string, i: number, index: number): number {
  if (text[i] !== '[') return -1
  i = skipWs(text, i + 1)
  for (let n = 0; text[i] !== ']'; n++) {
    if (n === index) return i
    i = afterSeparator(text, scanValue(text, i), ']')
  }
  return -1
}

/** After a member/element ending at `i`: the start of the next one, or the closing bracket. */
function afterSeparator(text: string, i: number, close: '}' | ']'): number {
  i = skipWs(text, i)
  if (text[i] === ',') return skipWs(text, i + 1)
  expect(text, i, close)
  return i
}

/** End offset (exclusive) of the JSON value starting at `i`. */
function scanValue(text: string, i: number): number {
  const c = text[i]
  if (c === '"') return scanString(text, i)
  if (c === '{' || c === '[') {
    const close = c === '{' ? '}' : ']'
    i = skipWs(text, i + 1)
    while (text[i] !== close) {
      if (c === '{') {
        i = skipWs(text, scanString(text, i))
        expect(text, i, ':')
        i = skipWs(text, i + 1)
      }
      i = afterSeparator(text, scanValue(text, i), close)
    }
    return i + 1
  }
  const m = /^(?:true|false|null|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(text.slice(i, i + 64))
  if (!m) throw new Error(`invalid JSON at offset ${i}`)
  return i + m[0].length
}

function scanString(text: string, i: number): number {
  expect(text, i, '"')
  for (i++; i < text.length; i++) {
    if (text[i] === '\\') i++
    else if (text[i] === '"') return i + 1
  }
  throw new Error('unterminated JSON string')
}

function skipWs(text: string, i: number): number {
  while (i < text.length && /\s/.test(text[i])) i++
  return i
}

function expect(text: string, i: number, char: string): void {
  if (text[i] !== char) throw new Error(`expected "${char}" at offset ${i} of JSON`)
}

/**
 * Turns a Keep a Changelog `## [Unreleased]` section into `## [version] - date`
 * under a fresh, empty `## [Unreleased]`. Returns `null` when the section is
 * missing or has no entries (there is nothing to announce).
 */
export function promoteUnreleased(markdown: string, version: string, date: string): string | null {
  const lines = markdown.split('\n')
  const start = lines.findIndex(l => /^##\s*\[unreleased\]\s*$/i.test(l.trim()))
  if (start < 0) return null
  const next = lines.findIndex((l, i) => i > start && /^##\s/.test(l))
  const end = next < 0 ? lines.length : next
  const body = lines.slice(start + 1, end)
  const firstEntry = body.findIndex(l => l.trim() !== '')
  if (firstEntry < 0) return null
  const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  if (lines.some(l => new RegExp(`^##\\s*\\[${escaped}\\]`).test(l.trim()))) {
    throw new Error(`the changelog already has a section for ${version}, and [Unreleased] is not empty`)
  }
  return [
    ...lines.slice(0, start + 1),
    '',
    `## [${version}] - ${date}`,
    '',
    ...body.slice(firstEntry),
    ...lines.slice(end),
  ].join('\n')
}
