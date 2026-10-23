import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { countEvent } from './countEvent'
import { resetEditorOpenCount, useEditorOpenCount } from './useEditorOpenCount'

vi.mock('./countEvent', () => ({ countEvent: vi.fn() }))

afterEach(() => {
  vi.mocked(countEvent).mockClear()
  resetEditorOpenCount()
})

describe('useEditorOpenCount', () => {
  it('counts the editor as the page that loaded, once however often it remounts', () => {
    resetEditorOpenCount()
    renderHook(() => useEditorOpenCount('editor')).unmount()
    renderHook(() => useEditorOpenCount('share'))
    expect(vi.mocked(countEvent).mock.calls).toEqual([[{ name: 'editor_open', source: 'editor', arrival: 'load' }]])
  })

  it('says a link led there when the page navigated before the editor showed', () => {
    resetEditorOpenCount(true)
    renderHook(() => useEditorOpenCount('share'))
    expect(countEvent).toHaveBeenCalledWith({ name: 'editor_open', source: 'share', arrival: 'link' })
  })
})
