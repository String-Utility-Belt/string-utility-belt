import { describe, it, expect } from 'vitest'
import { isBytes, valueType, coerceInputFor, showControlChars, fromControlPictures, HIDDEN_CONTROL_CHAR } from './coerce'
import { isBytes as helperIsBytes } from '../utilities/helpers'

describe('isBytes', () => {
  it('accepts real Uint8Arrays, including views onto a larger buffer', () => {
    expect(isBytes(new Uint8Array([1, 2]))).toBe(true)
    expect(isBytes(new Uint8Array(new ArrayBuffer(8), 2, 3))).toBe(true)
  })

  it('rejects JSON shaped to look like bytes', () => {
    // a JSON-producing step (custom code included) could otherwise make the next step
    // treat an object as bytes and crash in TextDecoder
    const spoof = JSON.parse('{"constructor":{"name":"Uint8Array"},"byteLength":3,"buffer":{}}')
    expect(isBytes(spoof)).toBe(false)
    expect(helperIsBytes(spoof)).toBe(false)
    expect(valueType(spoof)).toBe('json')
    expect(coerceInputFor(spoof, 'string')).toBe(JSON.stringify(spoof))
  })

  it('rejects other typed arrays and array-likes', () => {
    expect(isBytes(new Uint16Array([1]))).toBe(false)
    expect(isBytes(new Int8Array([1]))).toBe(false)
    expect(isBytes([1, 2, 3])).toBe(false)
    expect(isBytes(new ArrayBuffer(4))).toBe(false)
  })
})

describe('showControlChars', () => {
  it('shows NUL, ESC and the other hidden C0 controls as Control Pictures', () => {
    expect(showControlChars('\u0000H\u0000i')).toBe('␀H␀i')
    expect(showControlChars('\u001b[31mred\u001b[0m')).toBe('␛[31mred␛[0m')
    expect(showControlChars('\u0001\u0007\u0008\u000b\u000c\u000e\u001f')).toBe('␁␇␈␋␌␎␟')
  })

  it('shows DEL as U+2421', () => {
    expect(showControlChars('a\u007fb')).toBe('a␡b')
  })

  it('leaves tab, LF, CR and every other character alone', () => {
    const text = 'a\tb\nc\r\nd é 😀 \u0080   ␛'
    expect(showControlChars(text)).toBe(text)
  })

  it('leaves no hidden control character in any string', () => {
    const all = Array.from({ length: 0x80 }, (_, i) => String.fromCharCode(i)).join('')
    expect(HIDDEN_CONTROL_CHAR.test(all)).toBe(true)
    expect(HIDDEN_CONTROL_CHAR.test(showControlChars(all))).toBe(false)
  })

  it('is undone by fromControlPictures', () => {
    const all = Array.from({ length: 0x80 }, (_, i) => String.fromCharCode(i)).join('')
    expect(fromControlPictures(showControlChars(all))).toBe(all)
    expect(fromControlPictures('␛]0;title␇ ␤ ␠')).toBe('\u001b]0;title\u0007 ␤ ␠')
  })
})
