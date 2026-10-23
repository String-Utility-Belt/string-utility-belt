import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseCountedEvent } from '@/lib/countedEvents'
import { countEvent, counts, sendEvent } from './countEvent'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('counts', () => {
  it('counts only on the production site, and never in a browser driven by automation', () => {
    expect(counts('stringutilitybelt.com', false)).toBe(true)
    expect(counts('www.stringutilitybelt.com', undefined)).toBe(true)
    expect(counts('stringutilitybelt.com', true)).toBe(false)
    for (const host of ['localhost', '127.0.0.1', 'string-utility-belt.example.workers.dev']) expect(counts(host, false)).toBe(false)
  })

  it('never counts crawlers or audit tools that run the page, but counts ordinary browsers', () => {
    const chrome = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'
    expect(counts('stringutilitybelt.com', false, chrome)).toBe(true)
    // a phone whose model name ends in "bot" is still a person
    expect(counts('stringutilitybelt.com', false, 'Mozilla/5.0 (Linux; Android 12; Cubot X30) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Mobile Safari/537.36')).toBe(true)
    for (const agent of [
      'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36 (compatible; bingbot/2.0)',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/141.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Linux; Android 11) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Mobile Safari/537.36 Chrome-Lighthouse',
    ]) expect(counts('stringutilitybelt.com', false, agent)).toBe(false)
  })
})

describe('countEvent', () => {
  it('sends nothing off the production site', () => {
    const sendBeacon = vi.fn(() => true)
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    Object.defineProperty(navigator, 'sendBeacon', { value: sendBeacon, configurable: true })
    countEvent({ name: 'preset_open', preset: 'decode-kubernetes-secret', source: 'page' })
    expect(sendBeacon).not.toHaveBeenCalled()
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe('sendEvent', () => {
  const event = { name: 'preset_open', preset: 'decode-kubernetes-secret', source: 'page' } as const

  it('sends the event as a JSON beacon to the Worker', async () => {
    const sendBeacon = vi.fn<(url: string, data: Blob) => boolean>(() => true)
    Object.defineProperty(navigator, 'sendBeacon', { value: sendBeacon, configurable: true })
    sendEvent(event)
    const [url, data] = sendBeacon.mock.calls[0]
    expect(url).toBe('/api/event')
    expect(data.type).toBe('application/json')
    const text = await new Promise<string>(resolve => {
      const reader = new FileReader() // jsdom's Blob has no text()
      reader.onload = () => resolve(String(reader.result))
      reader.readAsText(data)
    })
    expect(JSON.parse(text)).toEqual(event)
  })

  it('falls back to a keepalive fetch, without credentials, when the beacon is refused', () => {
    Object.defineProperty(navigator, 'sendBeacon', { value: () => false, configurable: true })
    const fetchSpy = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })))
    vi.stubGlobal('fetch', fetchSpy)
    sendEvent(event)
    expect(fetchSpy).toHaveBeenCalledWith('/api/event', expect.objectContaining({
      method: 'POST', body: JSON.stringify(event), keepalive: true, credentials: 'omit',
    }))
  })

  it('swallows a failed send', async () => {
    Object.defineProperty(navigator, 'sendBeacon', { value: undefined, configurable: true })
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('offline'))))
    expect(() => sendEvent(event)).not.toThrow()
    await Promise.resolve()
  })
})

describe('the events the app sends', () => {
  it('are all ones the Worker accepts', () => {
    const sent = [
      { name: 'sponsor_click', sponsorship: 'acme-2026-11', page: 'util/jwt_decode' },
      { name: 'sponsor_click', sponsorship: 'acme-2026-11', page: 'presets/decode-saml-request' },
      { name: 'sponsor_click', sponsorship: 'acme-2026-11', page: 'blog/md5-insecure-but-useful' },
      ...(['header', 'promo', 'promo_inline', 'promo_rail', 'promo_strip', 'promo_tool', 'preset'] as const)
        .map(source => ({ name: 'integration_click', integration: 'chrome', source })),
      { name: 'preset_open', preset: 'excel-column-to-sql-in-clause', source: 'page' },
      { name: 'preset_open', preset: 'excel-column-to-sql-in-clause', source: 'gallery' },
    ]
    for (const event of sent) expect(parseCountedEvent(event), JSON.stringify(event)).toEqual(event)
  })
})
