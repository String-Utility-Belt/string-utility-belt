import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseCountedEvent } from '@/lib/countedEvents'
import { countEvent } from './countEvent'
import { countExtensionDetected, pageKind } from './extensionDetected'

vi.mock('./countEvent', () => ({ countEvent: vi.fn() }))

afterEach(() => {
  vi.mocked(countEvent).mockClear()
  history.replaceState(null, '', '/')
})

describe('pageKind', () => {
  it('groups the routes into the page kinds the Worker accepts', () => {
    expect(pageKind('home')).toBe('editor')
    expect(pageKind('pipeline')).toBe('editor')
    expect(pageKind('utility')).toBe('utility')
    expect(pageKind('utilities')).toBe('utility')
    expect(pageKind('preset')).toBe('preset')
    expect(pageKind('presets')).toBe('preset')
    expect(pageKind('blogPost')).toBe('other')
    expect(pageKind('embed')).toBe('other')
    expect(pageKind('notFound')).toBe('other')
  })
})

describe('countExtensionDetected', () => {
  it('counts the version and the kind of the current page, nothing else', () => {
    history.replaceState(null, '', '/util/base64_encode/')
    countExtensionDetected('1.5.0')
    expect(vi.mocked(countEvent).mock.calls).toEqual([[{ name: 'extension_detected', version: '1.5.0', page: 'utility' }]])
    // what the page sends is what the Worker accepts
    expect(parseCountedEvent(vi.mocked(countEvent).mock.calls[0][0])).toEqual({ name: 'extension_detected', version: '1.5.0', page: 'utility' })
  })

  it('calls a shared pipeline the editor', () => {
    history.replaceState(null, '', '/#/p/abc')
    countExtensionDetected('1.5.0')
    expect(countEvent).toHaveBeenCalledWith({ name: 'extension_detected', version: '1.5.0', page: 'editor' })
  })
})
