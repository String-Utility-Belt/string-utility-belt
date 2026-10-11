import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { isUnsafeSvg } from './sponsors/check'
import { MAX_LOGO_BYTES } from './sponsors/sponsors'
import { DEVHUNT } from './listings'

const publicFile = (url: string) => readFileSync(path.resolve(__dirname, '../../public', `.${url}`))

describe('the DevHunt badge', () => {
  it('links to the listing over https', () => {
    expect(DEVHUNT.href).toMatch(/^https:\/\/devhunt\.org\//)
  })

  it.each([DEVHUNT.light, DEVHUNT.dark])('%s is our own copy: small, and with no script or external reference', url => {
    expect(url).toMatch(/^\/badges\/[a-z0-9-]+\.svg$/)
    const bytes = publicFile(url)
    expect(bytes.byteLength).toBeLessThanOrEqual(MAX_LOGO_BYTES)
    const svg = bytes.toString('utf8')
    expect(svg).toMatch(/^<svg[\s>]/)
    expect(isUnsafeSvg(svg)).toBe(false)
  })

  it('is shown at the aspect ratio it is drawn at', () => {
    const [, w, h] = /viewBox="0 0 (\d+) (\d+)"/.exec(publicFile(DEVHUNT.light).toString('utf8'))!
    expect(Math.abs(DEVHUNT.width / DEVHUNT.height - Number(w) / Number(h))).toBeLessThan(0.02)
  })
})

describe('isUnsafeSvg', () => {
  it.each([
    '<svg><script>alert(1)</script></svg>',
    '<svg onload="alert(1)"></svg>',
    '<svg><image href="https://example.com/x.png"/></svg>',
    '<svg><a href="javascript:alert(1)"/></svg>',
  ])('flags %s', svg => {
    expect(isUnsafeSvg(svg)).toBe(true)
  })
})
