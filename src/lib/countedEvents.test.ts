import { describe, expect, it } from 'vitest'
import { STEP_BUCKETS, eventFields, parseCountedEvent, stepBucket } from './countedEvents'

describe('extension_detected', () => {
  it('accepts a Chrome version and a page kind, stored in that order', () => {
    const event = parseCountedEvent({ name: 'extension_detected', version: '1.5.0', page: 'preset' })
    expect(event).toEqual({ name: 'extension_detected', version: '1.5.0', page: 'preset' })
    expect(eventFields(event!)).toEqual(['1.5.0', 'preset'])
    expect(parseCountedEvent({ name: 'extension_detected', version: '7', page: 'other' })).not.toBeNull()
  })

  it('refuses anything else in either field', () => {
    for (const version of ['', 'v1.5.0', '1.5.0-beta', '1..5', '1.2.3.4.5', '123456.0', 150]) {
      expect(parseCountedEvent({ name: 'extension_detected', version, page: 'editor' })).toBeNull()
    }
    expect(parseCountedEvent({ name: 'extension_detected', version: '1.5.0', page: 'blog' })).toBeNull()
    expect(parseCountedEvent({ name: 'extension_detected', version: '1.5.0' })).toBeNull()
  })
})

describe('stepBucket', () => {
  it('puts a pipeline size in one of the buckets the Worker accepts', () => {
    expect([1, 2, 3, 4, 7, 8, 40].map(stepBucket)).toEqual(['1', '2-3', '2-3', '4-7', '4-7', '8+', '8+'])
    for (let n = 1; n < 20; n++) expect(STEP_BUCKETS).toContain(stepBucket(n))
  })
})
