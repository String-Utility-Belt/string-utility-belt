import type { Utility } from '@/types/utility'
import { isBytes } from '../helpers'

/** brotli 2.x is ESM only: `brotli/decompress` has a named `decompress` export and its own types. */
type BrotliDecompressFn = typeof import('brotli/decompress').decompress

// Cached dynamic import — the pipeline re-runs on every keystroke, and a
// top-level static import would drag the decoder into the initial bundle.
let _brotli: BrotliDecompressFn | null = null
const getBrotli = async (): Promise<BrotliDecompressFn> => {
  if (!_brotli) {
    const { decompress } = await import('brotli/decompress')
    _brotli = decompress
  }
  return _brotli
}

const errorMessage = (e: unknown): string =>
  e instanceof Error ? e.message : String(e)

/** Accept real bytes, array-buffer views, or a binary/UTF-8 string. */
const toBytes = (input: unknown): Uint8Array => {
  if (isBytes(input)) return input
  if (input instanceof ArrayBuffer) return new Uint8Array(input)
  if (ArrayBuffer.isView(input)) {
    const view = input as ArrayBufferView
    return new Uint8Array(view.buffer, view.byteOffset, view.byteLength)
  }
  const s = input == null ? '' : String(input)
  // A binary string (every code unit <= 0xFF, e.g. the result of atob) maps 1:1 to bytes.
  let binary = true
  for (let i = 0; i < s.length; i++) {
    if (s.charCodeAt(i) > 0xff) { binary = false; break }
  }
  if (binary) {
    const out = new Uint8Array(s.length)
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
    return out
  }
  return new TextEncoder().encode(s)
}

/**
 * brotli.js sizes its output buffer from the first meta-block header but grows it
 * again at every later meta-block boundary, and trims it back to the real length
 * before returning — so no explicit output size is ever needed, and a stream that
 * cannot be decoded raises a decoder error rather than returning short output.
 */
export const brotliDecompressBytes = async (bytes: Uint8Array): Promise<Uint8Array> => {
  const decompress = await getBrotli()
  let out: Uint8Array | null
  try {
    out = decompress(bytes)
  } catch (e) {
    throw new Error(`Not valid brotli data: ${errorMessage(e)}`)
  }
  if (!out) throw new Error('Not valid brotli data: the decoder produced no output')
  return out
}

const util: Utility = {
  id: 'brotli_decompress',
  name: 'brotli decompress',
  category: 'Compression',
  description:
    'Decompress a Brotli stream, returning the result as UTF-8 text or as raw bytes.',
  accepts: ['string', 'bytes'],
  produces: ['string', 'bytes'],
  tags: ['brotli', 'decompress', 'compression', 'br', 'inflate'],
  examples: [
    {
      title: 'decompress a brotli stream to text',
      input: '1b1c00001ca9539f3b740d22f426a742e82a8dad06d1a784d56935bc01',
      inputEncoding: 'hex',
      params: { output: 'text' },
      output: 'Hello, Brotli! Hello, Brotli!'
    }
  ],
  params: {
    output: {
      kind: 'select',
      label: 'output',
      options: ['text', 'bytes'],
      default: 'text'
    }
  },
  async apply(input: any, params: any) {
    const output = params?.output === 'bytes' ? 'bytes' : 'text'
    const bytes = toBytes(input)
    if (bytes.length === 0) return output === 'bytes' ? new Uint8Array(0) : ''

    const out = await brotliDecompressBytes(bytes)
    if (output === 'bytes') return out
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(out)
    } catch {
      throw new Error(
        'Decompressed data is not valid UTF-8 text — set output to "bytes".'
      )
    }
  }
}

export default util
