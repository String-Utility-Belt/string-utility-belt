/** Response helpers shared by the API routes. Every error body is JSON `{ error }`. */

/** Public, credential-free CORS for the pipeline API (never used on `/api/fetch`). */
export const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Max-Age': '86400',
}

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'x-content-type-options': 'nosniff',
      ...headers,
    },
  })
}

export function jsonError(status: number, error: string, extra: Record<string, unknown> = {},
  headers: Record<string, string> = {}): Response {
  return json({ error, ...extra }, status, { 'cache-control': 'no-store', ...headers })
}

/**
 * Whether a request came from anywhere but one of this site's own pages, for the routes
 * only the site calls (`/api/event`, `/api/feedback`): browsers set Sec-Fetch-Site on
 * every request, and Origin on a cross-origin one, and neither can be set from a page.
 */
export function isCrossSite(request: Request): boolean {
  const origin = request.headers.get('origin')
  return request.headers.get('sec-fetch-site') !== 'same-origin'
    || (origin !== null && origin !== new URL(request.url).origin)
}

export class TooLargeError extends Error {
  readonly limit: number
  constructor(limit: number) {
    super(`larger than ${limit} bytes`)
    this.limit = limit
  }
}

/** A promise that rejects once `signal` aborts (never settles without one). */
export function untilAborted(signal?: AbortSignal): Promise<never> {
  const p = new Promise<never>((_, reject) => {
    if (!signal) return
    const fail = () => reject(signal.reason ?? new DOMException('aborted', 'AbortError'))
    if (signal.aborted) fail()
    else signal.addEventListener('abort', fail, { once: true })
  })
  p.catch(() => { /* callers observe it through Promise.race */ })
  return p
}

/**
 * Read a body stream into memory, refusing (and cancelling the stream) as soon as it
 * passes `limit` bytes — a declared Content-Length is never trusted on its own.
 * With `signal`, an abort rejects the read even if the stream itself stalls.
 */
export async function readCapped(body: ReadableStream<Uint8Array> | null, limit: number,
  signal?: AbortSignal): Promise<Uint8Array<ArrayBuffer>> {
  if (!body) return new Uint8Array(0)
  const reader = body.getReader()
  const aborted = untilAborted(signal)
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await Promise.race([reader.read(), aborted])
      if (done) break
      total += value.byteLength
      if (total > limit) throw new TooLargeError(limit)
      chunks.push(value)
    }
  } catch (e) {
    reader.cancel().catch(() => { /* already errored */ })
    throw e
  }
  const out = new Uint8Array(total)
  let off = 0
  for (const c of chunks) { out.set(c, off); off += c.byteLength }
  return out
}

/** Declared length as a number, or null when absent or garbage. */
export function contentLength(headers: Headers): number | null {
  const raw = headers.get('content-length')
  if (raw === null || !/^\d+$/.test(raw.trim())) return null
  return Number(raw)
}

// btoa/atob work on binary strings; go through them in chunks so large inputs do not
// blow the argument limit of String.fromCharCode.
export function bytesToBase64(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(bin)
}

/** Strict base64 (standard or URL-safe alphabet, padding optional, whitespace ignored), or null. */
export function base64ToBytes(text: string): Uint8Array | null {
  let s = text.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/')
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(s)) return null
  s = s.replace(/=+$/, '')
  if (s.length % 4 === 1) return null
  s += '='.repeat((4 - (s.length % 4)) % 4)
  try {
    const bin = atob(s)
    const out = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
    return out
  } catch {
    return null
  }
}
