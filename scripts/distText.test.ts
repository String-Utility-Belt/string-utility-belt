import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { checkDistText, controlCharProblems } from './distText'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dist-text-'))
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }))

describe('controlCharProblems', () => {
  it('passes text with only tab, LF and CR', () => {
    expect(controlCharProblems('a\tb\r\nc ␀ é')).toEqual([])
  })

  it('names each line holding one, showing it as a Control Picture', () => {
    expect(controlCharProblems('ok\n<pre>utf8: \u0000H\u0000i</pre>\nok\nx\u007f')).toEqual([
      'line 2: raw U+0000 in "<pre>utf8: ␀H␀i</pre>"',
      'line 4: raw U+007F in "x␡"',
    ])
  })
})

describe('checkDistText', () => {
  it('checks every text file under the output, nested ones too, and skips binary ones', () => {
    fs.mkdirSync(path.join(dir, 'util', 'get_bytes'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'util', 'get_bytes', 'index.html'), '<pre>\u0000</pre>')
    fs.writeFileSync(path.join(dir, 'ok.html'), '<p>fine</p>')
    fs.writeFileSync(path.join(dir, 'chunk.js'), 'x=`\u001a`')
    fs.writeFileSync(path.join(dir, 'og.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x1a]))
    expect(checkDistText(dir)).toEqual([
      'chunk.js: line 1: raw U+001A in "x=`␚`"',
      `${path.join('util', 'get_bytes', 'index.html')}: line 1: raw U+0000 in "<pre>␀</pre>"`,
    ])
  })
})
