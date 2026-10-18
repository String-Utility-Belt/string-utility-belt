/**
 * Executes tool-scoped commands dispatched by the command palette (and anything
 * else that fires `sub:tool-command`). Renders nothing; mount once inside
 * `<ToolProvider>` (e.g. in `ToolPage`), since it needs `useTool()`.
 */
import { useEffect, useLayoutEffect, useRef } from 'react'
import { defaultParams } from '@/core/params'
import { registry } from '@/app/registry'
import { useTool } from '@/app/ToolContext'
import { pushRecent } from '@/app/favorites'
import { countEvent } from '@/app/events/countEvent'
import { attachToolBridge, TOOL_COMMAND_EVENT, type ToolCommandDetail } from './commands'

export default function ToolCommandBridge(): null {
  const tool = useTool()
  // The listener is attached once and reads the latest tool API through refs.
  // The toggles also track their own pending value, so two toggles in one tick
  // (before React re-renders) cancel out instead of both reading the old state.
  const toolRef = useRef(tool)
  const liveRef = useRef(tool.liveRun)
  const previewsRef = useRef(tool.showPreviews)
  useLayoutEffect(() => {
    toolRef.current = tool
    liveRef.current = tool.liveRun
    previewsRef.current = tool.showPreviews
  })

  useEffect(() => {
    const onCommand = (e: Event) => {
      const detail = (e as CustomEvent<ToolCommandDetail | undefined>).detail
      if (!detail || typeof detail !== 'object') return
      const { dispatch, run, setLiveRun, setShowPreviews } = toolRef.current
      switch (detail.command) {
        case 'undo': dispatch({ type: 'UNDO' }); break
        case 'redo': dispatch({ type: 'REDO' }); break
        case 'clear': dispatch({ type: 'CLEAR' }); break
        case 'runNow': run.runNow(); break
        case 'toggleLive': {
          const next = !liveRef.current
          liveRef.current = next
          setLiveRun(next)
          break
        }
        case 'togglePreviews': {
          const next = !previewsRef.current
          previewsRef.current = next
          setShowPreviews(next)
          break
        }
        case 'enableAll': dispatch({ type: 'SET_ALL_ENABLED', enabled: true }); break
        case 'disableAll': dispatch({ type: 'SET_ALL_ENABLED', enabled: false }); break
        case 'addStep': {
          const meta = typeof detail.utilityId === 'string' ? registry.get(detail.utilityId) : undefined
          if (!meta) break
          dispatch({ type: 'ADD_STEP', utilityId: meta.id, params: defaultParams(meta) })
          pushRecent(meta.id)
          countEvent({ name: 'utility_add', utility: meta.id, source: 'palette' })
          break
        }
        default:
          break
      }
    }
    window.addEventListener(TOOL_COMMAND_EVENT, onCommand)
    // after the listener is live: flushes commands queued while no editor was mounted
    const detach = attachToolBridge()
    return () => {
      detach()
      window.removeEventListener(TOOL_COMMAND_EVENT, onCommand)
    }
  }, [])

  return null
}
