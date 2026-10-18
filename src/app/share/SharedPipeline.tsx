import React, { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { Share2 } from 'lucide-react'
import { decodeShare } from '@/core/serialize'
import type { PipelineDoc } from '@/types/utility'
import { ToolProvider, useTool, handOffInput } from '@/app/ToolContext'
import ToolPage from '@/app/tool/ToolPage'
import { autosavePreviousPipeline } from '@/app/library/autosave'
import { loadState, saveState } from '@/lib/persist'
import { replaceHash } from '@/lib/router'
import { quarantineUntrusted } from './trust'

type Autosave = { payload: string; status: 'saved' | 'failed' }

/**
 * What the arrival autosave did, kept outside React state: the effect that writes
 * the library records its outcome here and the banner subscribes. One store per
 * mount — StrictMode's simulated remount keeps it (so the deduped second effect run
 * cannot erase the first run's notice), while a real remount starts empty.
 */
function createAutosaveStore() {
  let value: Autosave | null = null
  const subscribers = new Set<() => void>()
  return {
    get: () => value,
    set(next: Autosave) { value = next; subscribers.forEach(fn => fn()) },
    subscribe(fn: () => void) { subscribers.add(fn); return () => { subscribers.delete(fn) } },
  }
}

/** Makes whatever is in the editor now — the shared pipeline plus any edits — the working pipeline. */
function OpenInEditorButton() {
  const { state, showPreviews, input } = useTool()
  const open = () => {
    // libraryId is only set if a library entry was loaded over the shared pipeline
    saveState({ steps: state.steps, showPreviews, name: state.name, libraryId: state.libraryId })
    // the home editor remounts from saved state; carry the text input across too
    if (typeof input === 'string' && input) handOffInput(input)
    replaceHash('#/')
  }
  return <button type="button" className="btn-inv h-7 px-2.5 text-[12.5px]" onClick={open}>Open in editor</button>
}

/** A pipeline opened from a share link (`#/p/<payload>`). */
export default function SharedPipeline({ payload }: { payload: string }) {
  const decoded = useMemo<{ doc?: PipelineDoc; quarantined?: string[]; error?: string }>(() => {
    try {
      const doc = decodeShare(payload)
      const { steps, quarantined } = quarantineUntrusted(doc.steps)
      return { doc: { ...doc, steps }, quarantined }
    } catch (e: any) {
      return { error: e?.message || String(e) }
    }
  }, [payload])

  // The working pipeline gets one chance to be kept before the shared one can replace it.
  // An effect is early enough: ToolProvider treats its first render as a baseline and
  // only persists real edits. It only ever records success/failure (never "nothing
  // saved"), so StrictMode's second effect run — which dedupes to a no-op — cannot
  // hide the notice from the first.
  const [store] = useState(createAutosaveStore)
  const autosave = useSyncExternalStore(store.subscribe, store.get)
  const incoming = decoded.doc?.steps
  useEffect(() => {
    if (!incoming) return
    try {
      if (autosavePreviousPipeline(loadState().steps, incoming)) store.set({ payload, status: 'saved' })
    } catch {
      store.set({ payload, status: 'failed' })
    }
  }, [payload, incoming, store])
  const autosaveStatus = autosave?.payload === payload ? autosave.status : null

  if (decoded.error) {
    return (
      <ToolProvider>
        <ToolPage banner={<div role="alert" className="px-3.5 py-2.5 border border-danger-line rounded-lg bg-danger-bg text-[13px] text-danger-ink">{decoded.error}</div>} />
      </ToolProvider>
    )
  }
  const doc = decoded.doc!
  return (
    <ToolProvider key={payload} untrusted initialSteps={doc.steps} initialName={doc.name} initialInput={doc.input ?? ''}>
      <ToolPage runSource="share" banner={
        <div className="grid gap-1.5 px-3.5 py-2.5 border rounded-lg bg-surface text-[13px]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0"><Share2 size={14} className="inline -mt-0.5 mr-1.5 text-acc" aria-hidden />Opened a shared pipeline{doc.name ? `: ${doc.name}` : ''}.</div>
            <OpenInEditorButton />
          </div>
          <div role="status" aria-live="polite" className="text-[12.5px] text-muted">
            {autosaveStatus === 'saved' && 'Your previous pipeline was saved to your library.'}
          </div>
          {autosaveStatus === 'failed' && (
            <div role="alert" className="text-[12.5px] text-warn">
              Could not save your previous pipeline to your library (browser storage is full or disabled). It stays
              your working pipeline until you edit this one or open it in the editor.
            </div>
          )}
          {!!decoded.quarantined?.length && (
            <div role="alert" className="text-[12.5px] text-warn">
              This pipeline contains custom code. Those steps are off until you review the code and turn them on.
            </div>
          )}
        </div>
      } />
    </ToolProvider>
  )
}
