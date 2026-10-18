import React from 'react'
import { useTool } from '@/app/ToolContext'
import ToolCommandBridge from '@/app/commands/ToolCommandBridge'
import ShareButton from '@/app/share/ShareButton'
import LibraryButton from '@/app/library/LibraryButton'
import PresetsButton from '@/app/library/PresetsButton'
import SaveToExtensionButton from '@/app/extension/SaveToExtensionButton'
import IOSection from './IOSection'
import StepsSection from './steps/StepsSection'
import { HOME_HEADING } from '@/app/pages/seo'
import { useEditorRunCount, type RunSource } from '@/app/events/useEditorRunCount'

/** Longest pipeline name kept, as the library keeps it. */
const MAX_NAME = 120

/**
 * The pipeline editor. Must be rendered inside <ToolProvider>. `runSource` says whose
 * pipeline it opened with, for the `editor_run` count.
 */
export default function ToolPage({ banner, runSource = 'editor' }: { banner?: React.ReactNode; runSource?: RunSource }) {
  const { state, dispatch, input, run, runHeld } = useTool()
  useEditorRunCount(runSource, { steps: state.steps, input, out: run.result?.out, running: run.running, held: runHeld })

  const titleRow = (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="grid gap-1 min-w-[240px] flex-1">
        <h1 className="sr-only">{HOME_HEADING}</h1>
        <input
          className="w-full min-w-0 p-0 bg-transparent border-0 border-b border-transparent outline-hidden focus:border-line-2 text-2xl leading-[30px] font-semibold tracking-[-0.02em]"
          aria-label="Pipeline name"
          placeholder="Untitled pipeline"
          maxLength={MAX_NAME}
          autoComplete="off"
          spellCheck={false}
          value={state.name ?? ''}
          onChange={e => dispatch({ type: 'SET_META', name: e.target.value || undefined, libraryId: state.libraryId })}
        />
        <p className="m-0 text-[13px] text-muted text-pretty">
          Paste some text, add steps, and watch what each one does to it. It all runs in your browser, so nothing you
          paste gets uploaded.
        </p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <PresetsButton />
        <LibraryButton />
        <ShareButton />
        <SaveToExtensionButton />
      </div>
    </div>
  )

  return (
    <>
      <ToolCommandBridge />
      {banner}
      <IOSection header={titleRow}>
        <StepsSection />
      </IOSection>
    </>
  )
}
