import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  commands, commandById, listShortcuts, TOOL_COMMAND_EVENT, EVENT_MAGIC, EVENT_OPEN_SHARE,
  EVENT_OPEN_LIBRARY, EVENT_OPEN_PRESETS, EVENT_OPEN_GENERATE, EVENT_TOGGLE_THEME, EVENT_OPEN_SHORTCUTS,
  attachToolBridge, hasToolBridge, queueToolCommand, type ToolCommandDetail,
} from './commands'

const run = (id: string, ctx = {}) => commandById.get(id)!.run(ctx)

describe('commands', () => {
  beforeEach(() => { location.hash = '' })
  afterEach(() => { location.hash = '' })

  it('dispatches a tool-command event with the right detail for tool-scoped commands', () => {
    const cases: Array<[string, ToolCommandDetail['command']]> = [
      ['undo', 'undo'], ['redo', 'redo'], ['clear', 'clear'], ['run-now', 'runNow'],
      ['toggle-live', 'toggleLive'], ['toggle-previews', 'togglePreviews'],
      ['enable-all', 'enableAll'], ['disable-all', 'disableAll'],
    ]
    for (const [id, expected] of cases) {
      const handler = vi.fn()
      window.addEventListener(TOOL_COMMAND_EVENT, handler)
      run(id)
      expect(handler).toHaveBeenCalledTimes(1)
      expect((handler.mock.calls[0][0] as CustomEvent<ToolCommandDetail>).detail.command).toBe(expected)
      // hidden from the palette unless a pipeline editor is mounted
      expect(commandById.get(id)!.requiresTool).toBe(true)
      window.removeEventListener(TOOL_COMMAND_EVENT, handler)
    }
  })

  it('only the pipeline-editor commands require an editor', () => {
    const needsTool = commands.filter(c => c.requiresTool).map(c => c.id).sort()
    expect(needsTool).toEqual(['clear', 'disable-all', 'enable-all', 'redo', 'run-now', 'toggle-live', 'toggle-previews', 'undo'])
  })

  it('"Add utility…" switches the palette mode instead of dispatching a tool command', () => {
    const handler = vi.fn()
    window.addEventListener(TOOL_COMMAND_EVENT, handler)
    const setMode = vi.fn()
    run('add-utility', { setMode })
    expect(setMode).toHaveBeenCalledWith('utility')
    expect(handler).not.toHaveBeenCalled()
    expect(commandById.get('add-utility')!.keepOpen).toBe(true)
    window.removeEventListener(TOOL_COMMAND_EVENT, handler)
  })

  it.each([
    ['toggle-theme', EVENT_TOGGLE_THEME],
    ['shortcuts', EVENT_OPEN_SHORTCUTS],
  ])('%s fires the %s window event on any route', (id, eventName) => {
    location.hash = '#/blog'
    const handler = vi.fn()
    window.addEventListener(eventName, handler)
    run(id)
    expect(handler).toHaveBeenCalledTimes(1)
    expect(location.hash).toBe('#/blog')
    window.removeEventListener(eventName, handler)
  })

  const TOOL_DIALOGS: Array<[string, string]> = [
    ['magic-decode', EVENT_MAGIC],
    ['share', EVENT_OPEN_SHARE],
    ['library', EVENT_OPEN_LIBRARY],
    ['presets', EVENT_OPEN_PRESETS],
    ['generate', EVENT_OPEN_GENERATE],
  ]

  it.each(TOOL_DIALOGS)('%s fires the %s window event straight away while an editor is on screen', (id, eventName) => {
    const detach = attachToolBridge()
    const handler = vi.fn()
    window.addEventListener(eventName, handler)
    run(id)
    expect(handler).toHaveBeenCalledTimes(1)
    detach()
    window.removeEventListener(eventName, handler)
  })

  it.each(TOOL_DIALOGS)('%s from another route goes to the tool and fires %s once the editor mounts', async (id, eventName) => {
    // these dialogs live in the tool's toolbar (they need useTool): off the tool nothing listens
    location.hash = '#/blog'
    const handler = vi.fn()
    run(id)
    expect(location.hash).toBe('#/')
    const detach = attachToolBridge()
    // the toolbar's dialogs start listening in effects that may run after the bridge's own
    window.addEventListener(eventName, handler)
    await Promise.resolve()
    expect(handler).toHaveBeenCalledTimes(1)
    detach()
    window.removeEventListener(eventName, handler)
  })

  it.each([
    ['goto-tool', '#/'],
    ['goto-utilities', '#/utilities'],
    ['goto-blog', '#/blog'],
    ['goto-changelog', '#/changelog'],
  ])('%s navigates to %s', (id, hash) => {
    run(id)
    expect(location.hash).toBe(hash)
  })

  it('"Go to Tool" and tool actions leave a pre-rendered page\'s path (where "#/" alone routes back to it)', async () => {
    history.replaceState(null, '', '/util/trim/')
    try {
      const routed = vi.fn()
      window.addEventListener('hashchange', routed)
      run('goto-tool')
      expect(location.pathname).toBe('/')
      expect(location.hash).toBe('#/')
      expect(routed).toHaveBeenCalled()

      history.replaceState(null, '', '/blog/')
      const opened = vi.fn()
      window.addEventListener(EVENT_OPEN_LIBRARY, opened)
      run('library')
      expect(location.pathname).toBe('/')
      const detach = attachToolBridge()
      await Promise.resolve()
      expect(opened).toHaveBeenCalledTimes(1)
      detach()
      window.removeEventListener(EVENT_OPEN_LIBRARY, opened)
      window.removeEventListener('hashchange', routed)
    } finally {
      history.replaceState(null, '', '/')
    }
  })

  it('every command has a unique id', () => {
    const ids = commands.map(c => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('queueToolCommand / attachToolBridge', () => {
  afterEach(() => { vi.useRealTimers(); attachToolBridge()() })

  it('holds commands until a bridge attaches, then delivers them in order', async () => {
    const handler = vi.fn()
    window.addEventListener(TOOL_COMMAND_EVENT, handler)
    queueToolCommand({ command: 'addStep', utilityId: 'a' })
    queueToolCommand({ command: 'runNow' })
    expect(handler).not.toHaveBeenCalled()
    expect(hasToolBridge()).toBe(false)
    const detach = attachToolBridge()
    expect(hasToolBridge()).toBe(true)
    await Promise.resolve()
    expect(handler.mock.calls.map(c => (c[0] as CustomEvent<ToolCommandDetail>).detail))
      .toEqual([{ command: 'addStep', utilityId: 'a' }, { command: 'runNow' }])
    detach()
    detach() // idempotent
    expect(hasToolBridge()).toBe(false)
    window.removeEventListener(TOOL_COMMAND_EVENT, handler)
  })

  it('drops held commands that are too old to still be what the user meant', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    const handler = vi.fn()
    window.addEventListener(TOOL_COMMAND_EVENT, handler)
    queueToolCommand({ command: 'addStep', utilityId: 'stale' })
    vi.setSystemTime(new Date('2026-01-01T00:01:00Z'))
    const detach = attachToolBridge()
    expect(handler).not.toHaveBeenCalled()
    detach()
    window.removeEventListener(TOOL_COMMAND_EVENT, handler)
  })
})

describe('listShortcuts', () => {
  it('includes the global shortcuts and every command with a declared shortcut', () => {
    const list = listShortcuts()
    expect(list.some(s => s.keys.includes('Ctrl/Cmd+K'))).toBe(true)
    expect(list.some(s => s.keys === 'Ctrl/Cmd+Z' && s.description === 'Undo')).toBe(true)
    expect(list.some(s => s.keys === 'Ctrl/Cmd+Enter' && s.description === 'Run now')).toBe(true)
    expect(list.some(s => s.keys.includes('Ctrl+Y') && s.description === 'Redo')).toBe(true)
  })
})
