import { readFileSync } from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import satori from 'satori'
import { initWasm, Resvg } from '@resvg/resvg-wasm'

// this module runs under vite-node as ESM; `require.resolve` is the simplest
// reliable way to locate a dependency's on-disk files (fonts, the .wasm binary)
// regardless of the current working directory
const require = createRequire(import.meta.url)

const WIDTH = 1200
const HEIGHT = 630
const BRAND = 'String Utility Belt'
const SITE_HOST = 'stringutilitybelt.com'

let resvgReady: Promise<void> | null = null

/** Initializes the resvg-wasm module exactly once, from the package's own binary. */
export function ensureResvgInit(): Promise<void> {
  if (!resvgReady) {
    const wasmPath = require.resolve('@resvg/resvg-wasm/index_bg.wasm')
    resvgReady = initWasm(readFileSync(wasmPath))
  }
  return resvgReady
}

export interface OgFonts {
  regular: Buffer
  semibold: Buffer
  mono: Buffer
}

/** Loads the site's typefaces as satori needs them (Latin, .woff): Instrument Sans 400 + 600, JetBrains Mono 500. */
export function loadOgFonts(): OgFonts {
  const sans = path.dirname(require.resolve('@fontsource/instrument-sans/package.json'))
  const mono = path.dirname(require.resolve('@fontsource/jetbrains-mono/package.json'))
  return {
    regular: readFileSync(path.join(sans, 'files/instrument-sans-latin-400-normal.woff')),
    semibold: readFileSync(path.join(sans, 'files/instrument-sans-latin-600-normal.woff')),
    mono: readFileSync(path.join(mono, 'files/jetbrains-mono-latin-500-normal.woff')),
  }
}

/** The brand mark (scripts/icons.ts), for the card's lockup. */
let mark: string | undefined
const brandMark = (): string => {
  mark ??= `data:image/png;base64,${readFileSync(path.join(path.dirname(require.resolve('../../package.json')), 'public/icons/icon-192.png')).toString('base64')}`
  return mark
}

// The site's light tokens (src/index.css).
const COLOR = { canvas: '#f8f7f3', ink: '#1f1915', muted: '#69625d', line: '#dcd9d3', accent: '#ca4b20' }

export interface OgCardOptions {
  name: string
  category?: string
  description: string
}

const truncate = (s: string, max: number): string => (s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s)

const sub = (codePoint: number, text: string): [string, string] => [String.fromCodePoint(codePoint), text]

/**
 * Symbols utility names/descriptions use that the Latin subsets of the card's
 * fonts have no glyph for, or draw in a mismatched face, mapped to plain text.
 * `findMissingGlyphs` (and its manifest-wide test) catches new ones.
 */
const OG_SUBSTITUTES = new Map<string, string>([
  sub(0x2010, '-'), // hyphen
  sub(0x2011, '-'), // non-breaking hyphen ("UTF-8", "SHA-256")
  sub(0x2190, '<-'), // leftwards arrow
  sub(0x2192, '->'), // rightwards arrow
  sub(0x2194, '<->'), // left right arrow ("number <-> words")
  sub(0x21d2, '=>'), // rightwards double arrow
  sub(0x2260, '!='), // not equal
  sub(0x2264, '<='), // less-than or equal
  sub(0x2265, '>='), // greater-than or equal
])

/** Replaces characters the OG font cannot draw with ASCII equivalents. */
export function ogText(text: string): string {
  let out = ''
  for (const ch of text) out += OG_SUBSTITUTES.get(ch) ?? ch
  return out
}

const satoriFonts = (fonts: OgFonts) => [
  { name: 'Instrument Sans', data: fonts.regular, weight: 400 as const, style: 'normal' as const },
  { name: 'Instrument Sans', data: fonts.semibold, weight: 600 as const, style: 'normal' as const },
  { name: 'JetBrains Mono', data: fonts.mono, weight: 500 as const, style: 'normal' as const },
]

/**
 * Satori calls `loadAdditionalAsset` with every run of text no loaded font
 * covers; answering with no fonts keeps the render going while recording it.
 */
const missingGlyphHook = (onMissing: (segment: string) => void) =>
  async (_languageCode: string, segment: string) => {
    onMissing(segment)
    return []
  }

/** The distinct characters in `text` that no OG font can draw (whitespace ignored). */
export async function findMissingGlyphs(text: string, fonts: OgFonts): Promise<string[]> {
  const unique = [...new Set(text)].filter(ch => ch.trim() !== '').join(' ')
  const missing = new Set<string>()
  await satori({ type: 'div', props: { style: { display: 'flex', flexWrap: 'wrap', fontFamily: 'Instrument Sans' }, children: unique } } as unknown as Parameters<typeof satori>[0], {
    width: WIDTH,
    height: HEIGHT,
    fonts: satoriFonts(fonts),
    loadAdditionalAsset: missingGlyphHook(segment => {
      for (const ch of segment) if (ch.trim() !== '') missing.add(ch)
    }),
  })
  return [...missing]
}

/** Minimal shape satori's object syntax needs — avoids depending on React's JSX types. */
interface SatoriNode {
  type: string
  props: { style?: Record<string, string | number>; src?: string; width?: number; height?: number; children?: SatoriNode[] | SatoriNode | string }
}

/** The 1200x630 satori element tree (object syntax, no JSX) for one OG card, in the site's design. */
function ogTemplate({ name, category, description }: OgCardOptions): SatoriNode {
  const text = (style: Record<string, string | number>, children: string): SatoriNode => ({ type: 'div', props: { style: { display: 'flex', ...style }, children } })
  return {
    type: 'div',
    props: {
      style: {
        width: `${WIDTH}px`,
        height: `${HEIGHT}px`,
        // satori >= 0.63 lays out content-box like CSS; keep the padding inside the card
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        backgroundColor: COLOR.canvas,
        padding: '64px 72px 56px',
        fontFamily: 'Instrument Sans',
        color: COLOR.ink,
      },
      children: [
        {
          type: 'div',
          props: {
            style: { display: 'flex', alignItems: 'center', gap: '16px' },
            children: [
              { type: 'img', props: { src: brandMark(), width: 48, height: 48, style: { borderRadius: '11px' } } },
              text({ fontSize: '28px', fontWeight: 600, letterSpacing: '-0.01em' }, BRAND),
            ],
          },
        },
        {
          type: 'div',
          props: {
            style: { display: 'flex', flexDirection: 'column', gap: '22px' },
            children: [
              category
                ? text({
                    fontFamily: 'JetBrains Mono', fontSize: '20px', fontWeight: 500, color: COLOR.accent,
                    border: `1.5px solid ${COLOR.accent}`, borderRadius: '8px', padding: '6px 14px', alignSelf: 'flex-start',
                  }, category)
                : { type: 'div', props: { style: { display: 'flex' }, children: [] } },
              text({ fontSize: '72px', fontWeight: 600, lineHeight: 1.06, letterSpacing: '-0.03em' }, truncate(name, 60)),
              text({ fontSize: '30px', lineHeight: 1.4, color: COLOR.muted, maxWidth: '1000px' }, truncate(description, 140)),
            ],
          },
        },
        {
          type: 'div',
          props: {
            style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '22px', borderTop: `1px solid ${COLOR.line}` },
            children: [
              text({ fontFamily: 'JetBrains Mono', fontSize: '22px', fontWeight: 500, color: COLOR.muted }, SITE_HOST),
              text({ fontSize: '22px', color: COLOR.muted }, 'Free. Runs in your browser.'),
            ],
          },
        },
      ],
    },
  }
}

export interface RenderOgOptions {
  /** Called with any run of text no OG font can draw (it would render as boxes). */
  onMissingGlyphs?: (segment: string) => void
}

/** Renders one OG card to PNG bytes (satori → SVG, resvg-wasm → raster). */
export async function renderOgPng(opts: OgCardOptions, fonts: OgFonts, { onMissingGlyphs }: RenderOgOptions = {}): Promise<Uint8Array> {
  await ensureResvgInit()
  const card: OgCardOptions = {
    name: ogText(opts.name),
    category: opts.category === undefined ? undefined : ogText(opts.category),
    description: ogText(opts.description),
  }
  const svg = await satori(ogTemplate(card) as unknown as Parameters<typeof satori>[0], {
    width: WIDTH,
    height: HEIGHT,
    fonts: satoriFonts(fonts),
    ...(onMissingGlyphs ? { loadAdditionalAsset: missingGlyphHook(onMissingGlyphs) } : {}),
  })
  // satori already converts every glyph to a vector path, so resvg never shapes
  // text itself — skip system font discovery entirely for speed and determinism
  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: WIDTH }, font: { loadSystemFonts: false } })
  // free the wasm-side objects now rather than whenever GC finalizes them —
  // hundreds of renders otherwise grow the (never-shrinking) wasm heap
  try {
    const image = resvg.render()
    try {
      return image.asPng()
    } finally {
      image.free()
    }
  } finally {
    resvg.free()
  }
}

/** Tiny concurrency pool: runs `items` through `worker`, at most `limit` in flight. */
export async function runPool<T>(items: T[], limit: number, worker: (item: T, index: number) => Promise<void>): Promise<void> {
  let next = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++
      await worker(items[i], i)
    }
  })
  await Promise.all(runners)
}
