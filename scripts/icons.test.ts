// @vitest-environment node
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { EXTENSION_ICON_SPECS, ICON_SPECS, ICON_TARGETS, buildIconSvg, generateIcons, renderIconPng, renderIconPixels, LOGO_COLOR, LOGO_FOREGROUND } from './icons'

const ROOT = path.resolve(__dirname, '..')

/** Width/height from a PNG's IHDR chunk. */
function pngSize(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return { width: view.getUint32(16), height: view.getUint32(20) }
}

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

describe('ICON_SPECS', () => {
  it('covers the manifest requirement: 192 + 512 "any", a 512 maskable, and a 180 apple-touch-icon', () => {
    const summary = ICON_SPECS.map(({ file, size, maskable }) => ({ file, size, maskable }))
    expect(summary).toEqual(expect.arrayContaining([
      { file: 'icon-192.png', size: 192, maskable: false },
      { file: 'icon-512.png', size: 512, maskable: false },
      { file: 'icon-maskable-512.png', size: 512, maskable: true },
      { file: 'apple-touch-icon.png', size: 180, maskable: false },
      { file: 'favicon-32.png', size: 32, maskable: false },
    ]))
  })

  it('draws the three-letter keycap only where it can be read: 128 px and up', () => {
    for (const spec of [...ICON_SPECS, ...EXTENSION_ICON_SPECS]) {
      expect(spec.variant === 'full', spec.file).toBe(spec.size - 2 * (spec.padding ?? 0) >= 96)
    }
  })
})

describe('buildIconSvg', () => {
  it('is a font-independent vector mark using the brand colours', () => {
    const svg = buildIconSvg({ variant: 'full', maskable: false })
    expect(svg).toContain('<svg')
    expect(svg).toContain(LOGO_COLOR)
    expect(svg).toContain(LOGO_FOREGROUND)
    expect(svg).not.toMatch(/<text|font-family/)
  })

  it('rounds the corners for the "any" purpose icon', () => {
    expect(buildIconSvg({ variant: 'full', maskable: false })).toMatch(/<rect x="0" y="0" width="512" height="512" rx="[1-9]\d*"/)
  })

  it('is full-bleed (no corner rounding) when the OS applies its own mask: maskable and apple-touch-icon', () => {
    expect(buildIconSvg({ variant: 'full', maskable: true })).toMatch(/<rect x="0" y="0" width="512" height="512" rx="0"/)
    expect(buildIconSvg({ variant: 'full', maskable: false, fullBleed: true })).toMatch(/<rect x="0" y="0" width="512" height="512" rx="0"/)
  })

  it('leaves a transparent margin when the spec asks for padding (Chrome\'s 128 px icon)', () => {
    expect(buildIconSvg({ variant: 'full', maskable: false, padding: 16, size: 128 })).toMatch(/<rect x="64" y="64" width="384" height="384"/)
  })
})

describe('the rendered mark', () => {
  const isCream = (p: Uint8Array, i: number) => p[i + 3] > 200 && p[i] > 230 && p[i + 1] > 230 && p[i + 2] > 220
  const isAccent = (p: Uint8Array, i: number) => p[i + 3] > 200 && p[i] > 170 && p[i + 1] < 110 && p[i + 2] < 70

  /** Lengths of the cream runs down the middle column, top to bottom. */
  function creamRuns({ width, height, pixels }: { width: number; height: number; pixels: Uint8Array }, x: number) {
    const runs: number[] = []
    let run = 0
    for (let y = 0; y < height; y++) {
      if (isCream(pixels, (y * width + x) * 4)) run++
      else if (run) { runs.push(run); run = 0 }
    }
    if (run) runs.push(run)
    return runs
  }

  // A key seen from the front: a thin rim on top, letters on the accent face, a deep base.
  it.each([...ICON_SPECS, ...EXTENSION_ICON_SPECS].filter(s => s.variant !== 'tiny' && s.size >= 128))('is a keycap with a deep base ($file)', async (spec) => {
    const image = await renderIconPixels(spec)
    // left of centre: through the key's rim and base, clear of the letters
    const runs = creamRuns(image, Math.round(image.width * 0.27))
    expect(runs.length, 'a rim above and a base below').toBe(2)
    expect(runs[1]).toBeGreaterThan(runs[0] * 1.5)
  }, 30_000)

  it.each([...ICON_SPECS, ...EXTENSION_ICON_SPECS])('is the accent tile with cream on it ($file)', async (spec) => {
    const { pixels, width, height } = await renderIconPixels(spec)
    let accent = 0
    let cream = 0
    for (let i = 0; i < pixels.length; i += 4) {
      if (isAccent(pixels, i)) accent++
      else if (isCream(pixels, i)) cream++
    }
    expect(accent / (width * height)).toBeGreaterThan(0.25)
    expect(cream / (width * height)).toBeGreaterThan(0.05)
  }, 30_000)
})

describe('generateIcons', () => {
  it('renders every spec to a PNG of the declared size', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'subelt-icons-'))
    try {
      const written = await generateIcons(dir)
      expect(written).toHaveLength(ICON_SPECS.length)
      for (const spec of ICON_SPECS) {
        const bytes = fs.readFileSync(path.join(dir, spec.file))
        expect([...bytes.subarray(0, 8)]).toEqual(PNG_MAGIC)
        expect(pngSize(bytes)).toEqual({ width: spec.size, height: spec.size })
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  }, 30_000)
})

describe('committed icons (public/icons, packages/extension/icons, packages/mcp/assets)', () => {
  it('are up to date with the generator: run `npx vite-node scripts/icons.ts` after changing the mark', async () => {
    for (const [dir, specs] of ICON_TARGETS) {
      for (const spec of specs) {
        const committed = fs.readFileSync(path.join(ROOT, dir, spec.file))
        expect(Buffer.from(await renderIconPng(spec)).equals(committed), `${dir}/${spec.file}`).toBe(true)
      }
    }
  }, 30_000)

  it('match the sizes and purposes public/manifest.webmanifest declares, and index.html links them', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/manifest.webmanifest'), 'utf8'))
    const purposes = new Set<string>()
    for (const icon of manifest.icons) {
      const bytes = fs.readFileSync(path.join(ROOT, 'public', icon.src))
      const [w, h] = String(icon.sizes).split('x').map(Number)
      expect(pngSize(bytes), icon.src).toEqual({ width: w, height: h })
      purposes.add(icon.purpose ?? 'any')
    }
    expect([...purposes].sort()).toEqual(['any', 'maskable'])

    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')
    expect(html).toMatch(/<link rel="manifest" href="\/manifest\.webmanifest">/)
    expect(html).toMatch(/<link rel="apple-touch-icon" href="\/icons\/apple-touch-icon\.png">/)
    expect(html).toMatch(/<link rel="icon" type="image\/png" sizes="32x32" href="\/icons\/favicon-32\.png">/)
  })
})
