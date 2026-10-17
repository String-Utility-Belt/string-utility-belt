// @vitest-environment node
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { FEEDBACK_ADDRESS } from '../src/lib/feedback'

/** JSONC → JSON: drops comments and trailing commas outside strings ("/api/*" contains "/*"). */
function parseJsonc(text: string): any {
  let out = ''
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (c === '"') {
      let j = i + 1
      while (j < text.length && text[j] !== '"') j += text[j] === '\\' ? 2 : 1
      out += text.slice(i, j + 1)
      i = j
    } else if (c === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++
    } else if (c === '/' && text[i + 1] === '*') {
      i = text.indexOf('*/', i + 2) + 1
    } else {
      out += c
    }
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, '$1'))
}

const config = parseJsonc(readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8'))

describe('wrangler.jsonc', () => {
  it('runs this worker for the API and serves ./dist with a real 404 page otherwise', () => {
    expect(config.main).toBe('worker/index.ts')
    expect(config.assets).toMatchObject({
      directory: './dist',
      binding: 'ASSETS',
      not_found_handling: '404-page',
    })
  })

  it('sends every /api path to the worker before the SPA fallback', () => {
    // without these, /api/* would be answered with index.html by the asset layer
    expect(config.assets.run_worker_first).toEqual(expect.arrayContaining(['/api', '/api/*']))
  })

  it('binds the events dataset the worker writes to (worker/events.ts)', () => {
    expect(config.analytics_engine_datasets).toContainEqual({ binding: 'EVENTS', dataset: 'sub_events' })
  })

  it('binds the feedback email sender to our own address and no other (worker/feedback.ts)', () => {
    // pinned: even a bug in the route cannot make it email anyone else
    expect(config.send_email).toEqual([{ name: 'FEEDBACK', destination_address: FEEDBACK_ADDRESS }])
  })

  it('keeps the custom-domain route', () => {
    expect(config.routes).toContainEqual({ pattern: 'stringutilitybelt.com', custom_domain: true })
  })
})
