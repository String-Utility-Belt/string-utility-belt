/**
 * Generates the brand icons from a vector mark, using @resvg/resvg-wasm so the build has no
 * native image dependency: the site's PWA icons and favicon (public/icons/*.png), the browser
 * extension's toolbar icons (packages/extension/icons/*.png) and the icon directories list the MCP
 * server with (packages/mcp/assets, plugins/string-utility-belt). Run with
 * `npx vite-node scripts/icons.ts` after touching the mark and commit the resulting PNGs.
 * They are NOT regenerated at build time.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** The accent: `--c-acc` in src/index.css (light theme). */
export const LOGO_COLOR = '#ca4b20'
/** The cream the keycap is drawn in: `--c-surface` in src/index.css. */
export const LOGO_FOREGROUND = '#fefdfa'

/**
 * `full`: the "sub" keycap, the site header's mark. `compact`: the keycap with a single "s",
 * for 32 and 48 px, where three letters would blur into a smudge. `tiny`: at 16 px a rim is a
 * single pixel, so the key is solid cream with the "s" cut out of it in the accent.
 */
export type IconVariant = 'full' | 'compact' | 'tiny'

export interface IconSpec {
  file: string
  size: number
  variant: IconVariant
  /** Maskable icons must be full-bleed (no baked-in rounding) with content kept inside the safe zone. */
  maskable: boolean
  /** No baked-in rounding: iOS masks the apple-touch-icon itself and fills transparent corners black. */
  fullBleed?: boolean
  /** Transparent margin around the tile, in px of the output (Chrome's 128 px icon wants 16). */
  padding?: number
}

export const ICON_SPECS: IconSpec[] = [
  { file: 'icon-192.png', size: 192, variant: 'full', maskable: false },
  { file: 'icon-512.png', size: 512, variant: 'full', maskable: false },
  { file: 'icon-maskable-512.png', size: 512, variant: 'full', maskable: true },
  { file: 'apple-touch-icon.png', size: 180, variant: 'full', maskable: false, fullBleed: true },
  { file: 'favicon-32.png', size: 32, variant: 'compact', maskable: false },
]

/** The extension's toolbar and store icons (packages/extension/icons), the sizes its manifest declares. */
export const EXTENSION_ICON_SPECS: IconSpec[] = [
  { file: 'icon16.png', size: 16, variant: 'tiny', maskable: false },
  { file: 'icon32.png', size: 32, variant: 'compact', maskable: false },
  { file: 'icon48.png', size: 48, variant: 'compact', maskable: false },
  { file: 'icon128.png', size: 128, variant: 'full', maskable: false, padding: 16 },
]

/**
 * The icon a directory lists the MCP server with, inside what it installs: the .mcpb (manifest.json's `icon`;
 * Claude Desktop wants 512 px) and the Claude plugin (plugin.json's `icon`).
 */
export const LISTING_ICON_SPECS: IconSpec[] = [
  { file: 'icon-512.png', size: 512, variant: 'full', maskable: false },
]

/** Where each set is committed, relative to the repository root. */
export const ICON_TARGETS: ReadonlyArray<readonly [dir: string, specs: IconSpec[]]> = [
  ['public/icons', ICON_SPECS],
  ['packages/extension/icons', EXTENSION_ICON_SPECS],
  ['packages/mcp/assets', LISTING_ICON_SPECS],
  ['plugins/string-utility-belt', LISTING_ICON_SPECS],
]

/*
 * Outlines of "sub" and "s" in JetBrains Mono SemiBold (SIL Open Font License 1.1), the site's
 * monospace face, extracted once with satori at a 100 px font size. Drawn as paths, the mark
 * renders identically on every machine: no font lookup inside the wasm renderer.
 */
const SUB_GLYPHS = 'M32.3 86.9L28 86.9Q21.9 86.9 17.4 85.0Q12.8 83 10.2 79.5Q7.5 76.1 7.2 71.4L7.2 71.4L18.9 71.4Q19.2 74.1 21.7 75.7Q24.1 77.3 28 77.3L28 77.3L32.3 77.3Q37.1 77.3 39.5 75.4Q41.9 73.5 41.9 70.3L41.9 70.3Q41.9 67.3 39.8 65.5Q37.6 63.8 33.3 63.2L33.3 63.2L26.3 62.2Q17.2 60.8 13.0 57.1Q8.7 53.5 8.7 46.2L8.7 46.2Q8.7 38.5 13.8 34.3Q18.8 30.1 28.7 30.1L28.7 30.1L32.5 30.1Q41.4 30.1 46.7 34.1Q52 38.1 52.6 44.9L52.6 44.9L40.9 44.9Q40.6 42.6 38.4 41.1Q36.2 39.7 32.5 39.7L32.5 39.7L28.7 39.7Q24.2 39.7 22.2 41.3Q20.1 43 20.1 46.2L20.1 46.2Q20.1 49.1 21.9 50.5Q23.7 52 27.6 52.6L27.6 52.6L34.8 53.6Q44.3 55 48.8 58.8Q53.3 62.7 53.3 70.1L53.3 70.1Q53.3 78.1 48.1 82.5Q42.8 86.9 32.3 86.9L32.3 86.9ZM89.9 87L89.9 87Q79.7 87 73.8 81.2Q67.8 75.4 67.8 65.4L67.8 65.4L67.8 31L79.5 31L79.5 65.3Q79.5 70.8 82.3 73.8Q85 76.8 89.9 76.8L89.9 76.8Q94.9 76.8 97.7 73.8Q100.5 70.8 100.5 65.3L100.5 65.3L100.5 31L112.2 31L112.2 65.4Q112.2 75.4 106.2 81.2Q100.1 87 89.9 87ZM154.3 87L154.3 87Q147.5 87 143.5 83.2Q139.5 79.4 139.5 72.8L139.5 72.8L142 75.5L139.5 75.5L139.5 86L128 86L128 13L139.7 13L139.7 28.6L139.4 41.5L142 41.5L139.5 44.2Q139.5 37.6 143.6 33.8Q147.6 30 154.3 30L154.3 30Q162.6 30 167.6 35.6Q172.6 41.3 172.6 50.9L172.6 50.9L172.6 66.1Q172.6 75.7 167.6 81.3Q162.6 87 154.3 87ZM150.2 76.9L150.2 76.9Q155.3 76.9 158.2 74.0Q161 71 161 65.6L161 65.6L161 51.4Q161 46 158.2 43.0Q155.3 40.1 150.2 40.1L150.2 40.1Q145.4 40.1 142.6 43.1Q139.7 46.1 139.7 51.4L139.7 51.4L139.7 65.6Q139.7 70.9 142.6 73.9Q145.4 76.9 150.2 76.9Z '
const S_GLYPH = 'M32.3 86.9L28 86.9Q21.9 86.9 17.4 85.0Q12.8 83 10.2 79.5Q7.5 76.1 7.2 71.4L7.2 71.4L18.9 71.4Q19.2 74.1 21.7 75.7Q24.1 77.3 28 77.3L28 77.3L32.3 77.3Q37.1 77.3 39.5 75.4Q41.9 73.5 41.9 70.3L41.9 70.3Q41.9 67.3 39.8 65.5Q37.6 63.8 33.3 63.2L33.3 63.2L26.3 62.2Q17.2 60.8 13.0 57.1Q8.7 53.5 8.7 46.2L8.7 46.2Q8.7 38.5 13.8 34.3Q18.8 30.1 28.7 30.1L28.7 30.1L32.5 30.1Q41.4 30.1 46.7 34.1Q52 38.1 52.6 44.9L52.6 44.9L40.9 44.9Q40.6 42.6 38.4 41.1Q36.2 39.7 32.5 39.7L32.5 39.7L28.7 39.7Q24.2 39.7 22.2 41.3Q20.1 43 20.1 46.2L20.1 46.2Q20.1 49.1 21.9 50.5Q23.7 52 27.6 52.6L27.6 52.6L34.8 53.6Q44.3 55 48.8 58.8Q53.3 62.7 53.3 70.1L53.3 70.1Q53.3 78.1 48.1 82.5Q42.8 86.9 32.3 86.9L32.3 86.9Z '
/** Each outline's ink box in its 100 px em: [left, top, right, bottom]. */
const SUB_BOX = [7.2, 13, 172.6, 87] as const
const S_BOX = [7.2, 30.1, 53.3, 86.9] as const

interface Keycap {
  /** A solid key with the letters in the accent, instead of a rim around an accent face. */
  solid?: boolean
  /** The keycap's outer box on the 512 canvas. */
  x: number; y: number; w: number; h: number; rx: number
  /** Its rim: thin on top and at the sides, deep at the bottom, like a key seen from the front. */
  rim: number; base: number
  glyph: string; box: readonly [number, number, number, number]
  /** Width of the ink inside the key. */
  ink: number
}

const KEYCAPS: Record<IconVariant, Keycap> = {
  full: { x: 76, y: 150, w: 360, h: 226, rx: 40, rim: 18, base: 40, glyph: SUB_GLYPHS, box: SUB_BOX, ink: 232 },
  compact: { x: 64, y: 72, w: 384, h: 368, rx: 64, rim: 34, base: 72, glyph: S_GLYPH, box: S_BOX, ink: 150 },
  tiny: { x: 56, y: 56, w: 400, h: 400, rx: 80, rim: 0, base: 60, glyph: S_GLYPH, box: S_BOX, ink: 230, solid: true },
}

/** The keycap on its own: a cream key with an accent face and the letters in cream. */
function keycapSvg(k: Keycap): string {
  const [left, top, right, bottom] = k.box
  const scale = k.ink / (right - left)
  const face = { x: k.x + k.rim, y: k.y + k.rim, w: k.w - 2 * k.rim, h: k.h - k.rim - k.base }
  // the ink box centred on the key's face
  const tx = face.x + (face.w - k.ink) / 2 - left * scale
  const ty = face.y + (face.h - (bottom - top) * scale) / 2 - top * scale
  const letters = `<path transform="translate(${round(tx)} ${round(ty)}) scale(${round(scale)})" d="${k.glyph}" fill="${k.solid ? LOGO_COLOR : LOGO_FOREGROUND}"/>`
  const key = `<rect x="${k.x}" y="${k.y}" width="${k.w}" height="${k.h}" rx="${k.rx}" fill="${LOGO_FOREGROUND}"/>`
  if (k.solid) return `${key}\n  ${letters}`
  return `${key}
  <rect x="${face.x}" y="${face.y}" width="${face.w}" height="${face.h}" rx="${Math.max(0, k.rx - k.rim)}" fill="${LOGO_COLOR}"/>
  ${letters}`
}

const round = (n: number) => Math.round(n * 1000) / 1000

/**
 * The mark on a 512 canvas: an accent tile with the keycap on it. `maskable` drops the corner
 * rounding (the OS applies its own mask) and shrinks the key into the ~80% safe zone; `padding`
 * insets the tile, leaving the margin transparent.
 */
export function buildIconSvg({ variant, maskable, fullBleed, padding = 0, size = 512 }: Pick<IconSpec, 'variant' | 'maskable' | 'fullBleed' | 'padding'> & { size?: number }): string {
  const inset = (padding / size) * 512
  const tile = 512 - 2 * inset
  const rx = maskable || fullBleed ? 0 : round(112 * (tile / 512))
  const keyScale = (maskable ? 0.78 : 1) * (tile / 512)
  const keyOffset = inset + (tile - 512 * keyScale) / 2
  return `<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <rect x="${round(inset)}" y="${round(inset)}" width="${round(tile)}" height="${round(tile)}" rx="${rx}" fill="${LOGO_COLOR}"/>
  <g transform="translate(${round(keyOffset)} ${round(keyOffset)}) scale(${round(keyScale)})">
  ${keycapSvg(KEYCAPS[variant])}
  </g>
</svg>`
}

let wasmInit: Promise<typeof import('@resvg/resvg-wasm')> | undefined

/** Lazily initializes the resvg wasm module once, cached across calls. */
async function getResvg() {
  if (!wasmInit) {
    wasmInit = (async () => {
      const resvg = await import('@resvg/resvg-wasm')
      const wasmPath = path.join(ROOT, 'node_modules/@resvg/resvg-wasm/index_bg.wasm')
      await resvg.initWasm(await readFile(wasmPath))
      return resvg
    })()
  }
  return wasmInit
}

async function rasterize(spec: IconSpec) {
  const { Resvg } = await getResvg()
  return new Resvg(buildIconSvg(spec), { fitTo: { mode: 'width', value: spec.size } }).render()
}

/** Renders one icon spec to a PNG buffer. */
export async function renderIconPng(spec: IconSpec): Promise<Uint8Array> {
  return (await rasterize(spec)).asPng()
}

/** Renders one icon spec to raw RGBA pixels (row-major, 4 bytes per pixel). */
export async function renderIconPixels(spec: IconSpec): Promise<{ width: number; height: number; pixels: Uint8Array }> {
  const image = await rasterize(spec)
  return { width: image.width, height: image.height, pixels: image.pixels }
}

/** Renders `specs` and writes them under `outDir`. Returns the written paths. */
export async function generateIcons(outDir = path.join(ROOT, 'public/icons'), specs = ICON_SPECS): Promise<string[]> {
  await mkdir(outDir, { recursive: true })
  const written: string[] = []
  for (const spec of specs) {
    const dest = path.join(outDir, spec.file)
    await writeFile(dest, await renderIconPng(spec))
    written.push(dest)
  }
  return written
}

// CLI entry point: `npx vite-node scripts/icons.ts` (guarded so importing the
// pure functions from a test, which also loads this module, doesn't
// trigger a wasm init + file write as a side effect).
if (!process.env.VITEST) {
  Promise.all(ICON_TARGETS.map(([dir, specs]) => generateIcons(path.join(ROOT, dir), specs))).then(
    (sets) => {
      const written = sets.flat()
      console.log(`[icons] wrote ${written.length} icon(s):\n` + written.map((w) => `  ${w}`).join('\n'))
    },
    (e) => { console.error(`[icons] ${e?.message ?? e}`); process.exit(1) },
  )
}
