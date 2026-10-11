/**
 * The preset page's markup, shared by the app (`PresetPage`) and the pre-render
 * (`scripts/seo/content.ts`, via `renderToStaticMarkup`), so the static HTML a
 * search engine indexes is the page a visitor gets. Keep it pure: no browser
 * APIs, no registry import (utility metadata comes in through `utility`), no
 * effects. Interactivity arrives through props: the live widget is a slot, and
 * every handler is optional (the pre-render passes none).
 */
import React from 'react'
import { ArrowRight } from 'lucide-react'
import type { BranchStep, Condition, EachStep, PipelineStep, ValueType } from '@/types/utility'
import { isBranchStep, isEachStep, isMacroStep, isUtilityStep, utilityIds, walkSteps } from '@/core/steps'
import { itemNoun } from '@/core/split'
import { PRESET_CATEGORIES, PRESETS_PATH, presetPath, type Preset, type PresetMeta, type PresetSample } from '@/presets/types'
import type { Preview, SkipTrace, StepTrace } from '@/presets/trace'
import { utilityPath } from '../related'
import { PRESETS_HEADING } from '../seo'
import { changedParams, describeString, nameOf, revealInvisible, stepCountText, stepTitle, stringPairs, type UtilityLookup } from './presetHelpers'


/** An inline param value. */
const CODE = 'font-mono px-[5px] py-px rounded bg-surface-2 whitespace-pre-wrap wrap-anywhere'

/** One param value, as the preset runs it: strings raw (never JSON-escaped), rule tables as rows. */
function ParamValue({ value }: { value: unknown }) {
  const pairs = stringPairs(value)
  if (pairs) {
    return (
      <table className="font-mono text-xs border-separate border-spacing-x-2 -mx-2">
        <tbody>
          {pairs.map(([find, replace], i) => (
            <tr key={i}>
              <td className="wrap-anywhere"><code className={CODE}>{describeString(find)}</code></td>
              <td aria-label="becomes" className="text-muted">→</td>
              <td className="wrap-anywhere"><code className={CODE}>{describeString(replace)}</code></td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  }
  const shown = typeof value === 'string' ? describeString(value) : JSON.stringify(value)
  return shown.includes('\n') || shown.length > 60
    ? <pre className="m-0 font-mono whitespace-pre-wrap wrap-anywhere bg-surface-2 rounded-md px-2 py-1.5">{shown}</pre>
    : <code className={CODE}>{shown}</code>
}

function ParamList({ params }: { params: Array<{ key: string; label: string; value: unknown }> }) {
  if (params.length === 0) return null
  return (
    <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
      {params.map(({ key, label, value }) => (
        <div key={key} className="contents">
          <dt className="text-muted">{label}</dt>
          <dd className="m-0 min-w-0 overflow-auto"><ParamValue value={value} /></dd>
        </div>
      ))}
    </dl>
  )
}

/** A step's output (`full`, in the timeline) or a skipped step's result (`compact`, in its card). */
function PreviewBlock({ preview, label, compact }: { preview: Preview; label: string; compact?: boolean }) {
  const note = preview.kind === 'bytes'
    ? `${preview.size} bytes${preview.truncated ? ', first shown as hex' : ', as hex'}`
    : preview.truncated ? `first part of ${preview.size.toLocaleString('en-US')} characters` : null
  const shown = preview.kind === 'bytes' ? { text: preview.text, legend: [] } : revealInvisible(preview.text)
  const size = compact ? 'px-2.5 py-2 text-[11.5px] leading-[18px] max-h-[150px]' : 'px-[11px] py-[9px] text-xs leading-[19px] max-h-[220px]'
  return (
    <figure className="m-0 grid gap-1 content-start min-w-0">
      <figcaption className="text-[11px] text-muted">{label}{note ? ` (${note})` : ''}</figcaption>
      <pre className={`m-0 rounded-md bg-surface-2 font-mono whitespace-pre-wrap wrap-anywhere overflow-auto ${size}`}>
        {shown.text}{preview.truncated ? '\n…' : ''}
      </pre>
      {shown.legend.length > 0 && <p className="m-0 text-[11px] text-muted">Shown as symbols: {shown.legend.join(', ')}.</p>}
    </figure>
  )
}

const UTILITY_LINK = 'text-[12.5px] text-muted underline decoration-line-2 underline-offset-[3px]'

const VALUE_TYPE_NAMES: Record<ValueType, string> = { string: 'text', bytes: 'bytes', json: 'JSON' }

/** A regex condition's flags in words: `i` is the one presets use. */
function flagNote(flags = ''): string {
  const other = flags.replace('i', '')
  const notes = [flags.includes('i') ? 'ignoring case' : '', other ? `flags ${other}` : ''].filter(Boolean)
  return notes.length ? ` (${notes.join(', ')})` : ''
}

/** What a step's condition does, worded the same for a top-level step and a nested one. */
function ConditionNote({ condition }: { condition?: Condition }) {
  if (!condition || condition.kind === 'always') return null
  const what = condition.kind === 'regex'
    ? <>matches <code className="font-mono">{condition.pattern}</code>{flagNote(condition.flags)}</>
    : condition.kind === 'nonEmpty' ? 'is not empty' : `is ${VALUE_TYPE_NAMES[condition.type]}`
  return (
    <p className="m-0 text-xs text-muted">
      {condition.negate
        ? <>Skipped (its input passes through) when the input {what}.</>
        : <>Runs only when its input {what}; otherwise the input passes through.</>}
    </p>
  )
}

/** A failure policy other than the default (a failed step hands its input on). */
function ErrorNote({ step }: { step: PipelineStep }) {
  if (!step.onError || step.onError === 'passthrough') return null
  const noun = isEachStep(step) ? itemNoun(step.split.mode, 1) : ''
  const text = isEachStep(step)
    ? step.onError === 'empty' ? `A ${noun} whose steps fail comes out empty.` : `One ${noun} that fails fails the whole step.`
    : step.onError === 'empty' ? 'If it fails, the next step gets empty input.' : 'If it fails, the steps after it do not run.'
  return <p className="m-0 text-xs text-muted">{text}</p>
}

/** How a "run on each" step cuts its input, as the line above its steps. */
function eachIntro(step: EachStep): React.ReactNode {
  const empty = step.skipEmpty === false ? ', empty ones included,' : ''
  switch (step.split.mode) {
    case 'lines': return <>Each line{empty} goes through:</>
    case 'delimiter': return <>Each item between <code className="font-mono">{describeString(step.split.separator)}</code>{empty} goes through:</>
    case 'json-array': return <>Each element of the JSON array{empty} goes through:</>
    case 'json-values': return <>Each value of the JSON object{empty} goes through:</>
  }
}

/** How a branch puts its lanes back together, as the line above its lanes. */
function branchIntro(step: BranchStep): React.ReactNode {
  const merge = step.merge ?? { mode: 'concat' }
  const sep = (separator = '\n') => <code className="font-mono">{describeString(separator)}</code>
  switch (merge.mode) {
    case 'concat': return <>Every lane gets the same input, and their outputs are joined with {sep(merge.separator)}:</>
    case 'zip': return <>Every lane gets the same input, and their outputs are interleaved line by line, joined with {sep(merge.separator)}:</>
    case 'json': return <>Every lane gets the same input, and their outputs are collected into a JSON array:</>
    case 'pick': return <>Every lane gets the same input, and only lane {merge.index + 1}’s output is kept:</>
  }
}

/** A nested step's name: a link to its utility's page, after the step's own label when it has one. */
function NestedTitle({ step, utility }: { step: PipelineStep; utility: UtilityLookup }) {
  if (!isUtilityStep(step)) return <span className="text-[13px] font-medium">{stepTitle(step, utility)}</span>
  const link = <a className={UTILITY_LINK} href={utilityPath(step.utilityId)}>{nameOf(step.utilityId, utility)}</a>
  return step.label
    ? <span className="text-[13px] font-medium">{step.label} <span className="text-muted">(</span>{link}<span className="text-muted">)</span></span>
    : <span className="text-[13px]">{link}</span>
}

/** Steps inside a container, in order, each with everything it is set to. */
function StepSequence({ steps, utility }: { steps: PipelineStep[]; utility: UtilityLookup }) {
  return (
    <ol className="m-0 p-0 list-none grid gap-2 border-l border-line-2 pl-3 min-w-0">
      {steps.map(s => (
        <li key={s.id} className="grid gap-1 min-w-0">
          <NestedTitle step={s} utility={utility} />
          <StepSettings step={s} utility={utility} />
        </li>
      ))}
    </ol>
  )
}

/** What runs inside a branch, macro or "run on each" step, containers within containers included. */
function ContainerBody({ step, utility }: { step: PipelineStep; utility: UtilityLookup }) {
  if (isEachStep(step)) {
    return (
      <div className="grid gap-1 min-w-0">
        <p className="text-xs text-muted">{eachIntro(step)}</p>
        <StepSequence steps={step.steps} utility={utility} />
      </div>
    )
  }
  if (isBranchStep(step)) {
    return (
      <div className="grid gap-1 min-w-0">
        <p className="text-xs text-muted">{branchIntro(step)}</p>
        <ol className="grid gap-2 min-w-0">
          {step.branches.map((lane, i) => (
            <li key={i} className="grid gap-1 min-w-0">
              <span className="text-xs text-muted">Lane {i + 1}{lane.length === 0 ? ': its input, unchanged' : ':'}</span>
              {lane.length > 0 && <StepSequence steps={lane} utility={utility} />}
            </li>
          ))}
        </ol>
      </div>
    )
  }
  if (isMacroStep(step)) return <StepSequence steps={step.steps} utility={utility} />
  return null
}

/**
 * Everything a step is set to: its condition, failure policy and changed params, then
 * (for a container) the steps it runs, each shown the same way. The pre-rendered page
 * is all a crawler or a visitor without JavaScript gets, so nothing here may hide.
 */
function StepSettings({ step, utility }: { step: PipelineStep; utility: UtilityLookup }) {
  return (
    <>
      <ConditionNote condition={step.condition} />
      <ErrorNote step={step} />
      <ParamList params={changedParams(step, utility)} />
      <ContainerBody step={step} utility={utility} />
    </>
  )
}

export interface PresetWidgetProps {
  samples: PresetSample[]
  sampleId: string
  input: string
  output: string
  /** The first failing step of the current run, already worded for people. */
  error?: string
  running?: boolean
  stepCount: number
  /** `#/p/<payload>` link to the tool with these steps: works without JavaScript and on middle-click. */
  openHref: string
  onSample?: (id: string) => void
  onInput?: (value: string) => void
  onOpen?: (e: React.MouseEvent<HTMLAnchorElement>) => void
  onCopy?: () => void
  copied?: boolean
  /** Why the output is not (or only partly) for the current input, and the button that fixes it. */
  notice?: { text: string; action: string; onAction?: () => void }
  /** The browser-extension strip (app only: the pre-render has no extension to ask). */
  extension?: React.ReactNode
}

const PANE = 'h-40 md:h-60 m-0 px-4 pt-1.5 pb-3.5 font-mono text-[12.5px] leading-5'

/**
 * The worked example, live: pick a sample or paste your own input, see the output,
 * then open the pipeline in the editor. Fixed-height panes, so the static render
 * and the live one occupy the same space; shorter when stacked on a narrow screen,
 * so "Open in the editor" stays near the top.
 */
export function PresetWidget(props: PresetWidgetProps) {
  const { samples, sampleId, input, output, error, running, stepCount, openHref, onSample, onInput, onOpen, onCopy, copied, notice, extension } = props
  return (
    <section className="border rounded-[10px] bg-surface min-w-0" aria-labelledby="preset-try-h">
      <div className="flex flex-wrap items-center gap-2.5 py-2.5 pr-3 pl-4 border-b">
        <h2 id="preset-try-h" className="m-0 flex-1 min-w-[180px] text-sm font-semibold">Try it with your own data</h2>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Examples">
          {samples.map(s => (
            <button key={s.id} type="button" className="pill" aria-pressed={s.id === sampleId} onClick={onSample && (() => onSample(s.id))}>
              {s.title}
            </button>
          ))}
        </div>
      </div>
      <div className="grid md:grid-cols-2 min-w-0">
        <label className="grid content-start min-w-0 border-b md:border-b-0 md:border-r">
          <span className="px-4 pt-2.5 text-[11.5px] text-muted">Input. Paste your own.</span>
          <textarea
            className={`${PANE} block w-full resize-y border-0 bg-transparent outline-hidden focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-acc`}
            value={input}
            readOnly={!onInput}
            onChange={onInput && (e => onInput(e.target.value))}
            spellCheck={false}
            aria-label="preset input"
          />
        </label>
        <div className="grid content-start min-w-0 bg-strip">
          <span className="px-4 pt-2.5 text-[11.5px] text-muted"><span id="preset-output-label">Output</span>{running ? ' · running…' : ''}</span>
          <pre
            role="status"
            aria-labelledby="preset-output-label"
            aria-busy={running || undefined}
            className={`${PANE} whitespace-pre-wrap wrap-anywhere overflow-auto transition-opacity aria-busy:opacity-60`}
          >{output}</pre>
        </div>
      </div>
      {/* always mounted: text injected together with a brand-new live region is not reliably announced */}
      <div role="status" className={notice ? 'flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 border-t text-[13px]' : 'sr-only'}>
        {notice && (
          <>
            <span>{notice.text}</span>
            <button type="button" className="btn h-[30px] text-[12.5px]" onClick={notice.onAction}>{notice.action}</button>
          </>
        )}
      </div>
      {error && <p role="alert" className="m-0 px-4 py-[9px] border-t border-danger-line bg-danger-bg text-[13px] text-danger-ink">{error}</p>}
      <div className="flex flex-wrap items-center gap-2.5 px-4 py-3 border-t">
        <a className="cta" href={openHref} rel="nofollow" onClick={onOpen}>Open in the editor<ArrowRight size={13} aria-hidden /></a>
        <button type="button" className="btn" onClick={onCopy}>{copied ? 'Copied' : 'Copy output'}</button>
        <span className="text-[12.5px] text-muted">
          {stepCountText(stepCount)}, all editable. It runs in your browser, so nothing you paste is uploaded.
        </span>
      </div>
      {extension}
    </section>
  )
}

export interface PresetArticleProps {
  preset: Preset
  utility: UtilityLookup
  /** The guide body as trusted HTML (`renderMarkdownDocument`, which escapes everything). */
  guideHtml: string
  /** Each top-level step's output on the current input (the build's trace, or the live run). */
  steps: StepTrace[]
  /** What leaving out each step does to the first sample; null while it is being worked out, empty when it could not be. */
  skip: SkipTrace[] | null
  /** The live widget (`PresetWidget`). */
  live: React.ReactNode
  related: PresetMeta[]
  /** The page's sponsor block, at the end of the header, before the live widget. */
  sponsor?: React.ReactNode
  /** The page's inline house promo, after "Step by step" (`PagePromo` in the app, `ExtraPromo` in the pre-render). */
  promo?: React.ReactNode
  /** A run is in progress: the step outputs shown are about to change. */
  running?: boolean
}

export function PresetArticle({ preset, utility, guideHtml, steps, skip, live, related, sponsor, promo, running }: PresetArticleProps) {
  const traceOf = new Map(steps.map(s => [s.id, s]))
  const skipOf = new Map((skip ?? []).map(s => [s.id, s]))
  // every step id, nested ones included, to the number of the top-level step it is in
  const index = new Map<string, number>()
  preset.steps.forEach((top, i) => walkSteps([top], s => { index.set(s.id, i + 1) }))
  const firstSample = preset.samples[0]
  const utilitiesUsed = utilityIds(preset.steps)

  return (
    <article className="w-full grid gap-10 min-w-0">
      <header className="grid gap-2.5 pb-6 border-b min-w-0">
        <nav aria-label="Breadcrumb" className="flex flex-wrap gap-1.5 text-[12.5px] text-muted">
          <a className="text-muted hover:text-acc" href={PRESETS_PATH}>Presets</a>
          <span aria-hidden>/</span>
          <span>{preset.category}</span>
        </nav>
        <h1 className="page-title max-w-[820px]">{preset.name}</h1>
        <p className="page-lead max-w-[680px]">{preset.summary}</p>
        <ol className="mt-1 p-0 list-none flex flex-wrap items-center gap-1.5" aria-label="Steps">
          {preset.steps.map((s, i) => (
            <li key={s.id} className="flex items-center gap-1.5 min-w-0">
              {i > 0 && <ArrowRight size={12} aria-hidden className="text-muted shrink-0" />}
              <span className="min-h-6 px-[9px] flex items-center gap-1.5 border rounded-xl bg-surface text-[12.5px]">
                <span className="font-mono text-[10.5px] text-acc">{i + 1}</span>{stepTitle(s, utility)}
              </span>
            </li>
          ))}
        </ol>
        {sponsor && <div className="mt-2.5 max-w-[560px]">{sponsor}</div>}
      </header>

      {live}

      <section className="grid gap-[18px] min-w-0" aria-labelledby="preset-steps-h">
        <h2 id="preset-steps-h" className="section-title">Step by step</h2>
        <ol className="m-0 p-0 list-none grid transition-opacity aria-busy:opacity-60" aria-busy={running || undefined}>
          {preset.steps.map((s, i) => {
            const trace = traceOf.get(s.id)
            return (
              <li key={s.id} className="group grid grid-cols-[36px_minmax(0,1fr)] gap-x-3.5 min-w-0">
                <div aria-hidden className="flex flex-col items-center">
                  <span className="size-7 grid place-items-center border border-line-2 rounded-md bg-surface font-mono text-[11.5px] font-medium">{i + 1}</span>
                  <span className="flex-1 w-px min-h-4 bg-line-2 group-last:hidden" />
                </div>
                <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,260px),1fr))] gap-x-7 gap-y-3 pt-[3px] pb-7 min-w-0">
                  <div className="grid gap-2 content-start min-w-0">
                    <h3 className="m-0 text-[15px] leading-[22px] font-semibold"><span className="sr-only">{i + 1}. </span>{stepTitle(s, utility)}</h3>
                    <p className="m-0 text-sm leading-[22px] text-pretty">{s.why}</p>
                    {isUtilityStep(s) && (
                      <a className={`justify-self-start ${UTILITY_LINK}`} href={utilityPath(s.utilityId)}>{nameOf(s.utilityId, utility)}</a>
                    )}
                    <StepSettings step={s} utility={utility} />
                  </div>
                  <div className="grid gap-2 content-start min-w-0">
                    {trace?.error && <p className="m-0 text-[13px] text-danger-ink">This step failed: {trace.error}</p>}
                    {trace?.skipped && <p className="m-0 text-xs text-muted">Its condition did not match this input, so the input passed through unchanged.</p>}
                    {trace?.output && <PreviewBlock preview={trace.output} label="Output after this step" />}
                  </div>
                </div>
              </li>
            )
          })}
        </ol>
      </section>

      {promo}

      {/* an empty list means it could not be worked out in this browser: leave the section out */}
      {(skip === null || skip.length > 0) && <section className="grid gap-3.5 min-w-0" aria-labelledby="preset-skip-h">
        <div className="grid gap-1">
          <h2 id="preset-skip-h" className="section-title">What if you skip a step?</h2>
          <p className="m-0 text-sm leading-[22px] text-muted">
            Each step is there for a reason. This is what the example “{firstSample.title}” turns into with one step left out.
          </p>
        </div>
        {skip === null
          ? <p className="m-0 text-sm text-muted" role="status">Working it out…</p>
          : (
            <ul className="m-0 p-0 list-none grid grid-cols-[repeat(auto-fill,minmax(min(100%,320px),1fr))] gap-3">
              {preset.steps.map((s, i) => {
                const result = skipOf.get(s.id)
                if (!result) return null
                const at = result.error && index.get(result.error.stepId)
                const where = at ? `step ${at} (${stepTitle(preset.steps[at - 1], utility)})` : 'a later step'
                return (
                  <li key={s.id} className="grid gap-2 content-start px-3.5 pt-3 pb-3.5 border rounded-lg bg-surface min-w-0">
                    <h3 className="m-0 text-[13.5px] font-semibold">Without step {i + 1}, {stepTitle(s, utility)}</h3>
                    {result.error && <p className="m-0 text-[13px]">The pipeline breaks: {where} fails with “{result.error.message}”.</p>}
                    {!result.error && result.unchanged && (
                      <p className="m-0 text-[13px] text-muted">No difference for this example. The step is there for inputs like the other examples.</p>
                    )}
                    {!result.error && !result.unchanged && result.output && <PreviewBlock preview={result.output} label="The result instead" compact />}
                  </li>
                )
              })}
            </ul>
          )}
      </section>}

      {/* trusted: renderMarkdownDocument escapes every character of the guide source */}
      <section className="md max-w-[720px] pt-2 min-w-0 [&>div>:first-child]:mt-0" aria-label="guide">
        <div dangerouslySetInnerHTML={{ __html: guideHtml }} />
      </section>

      <section className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] gap-x-10 gap-y-7 pt-7 border-t min-w-0" aria-label="Related">
        <div className="grid gap-1 content-start min-w-0">
          <h2 className="m-0 mb-1.5 text-[13px] font-semibold">Utilities in this preset</h2>
          <ul className="m-0 p-0 list-none grid">
            {utilitiesUsed.map(id => (
              <li key={id} className="grid">
                <a className="link-row" href={utilityPath(id)}>
                  <span>{nameOf(id, utility)}</span>
                  {utility(id)?.description && <span>{utility(id)!.description}</span>}
                </a>
              </li>
            ))}
          </ul>
        </div>
        <div className="grid gap-1 content-start min-w-0">
          <h2 className="m-0 mb-1.5 text-[13px] font-semibold">More presets</h2>
          {related.length > 0 && (
            <ul className="m-0 p-0 list-none grid">
              {related.map(r => (
                <li key={r.slug} className="grid">
                  <a className="link-row" href={presetPath(r.slug)}><span>{r.name}</span><span>{r.category}</span></a>
                </li>
              ))}
            </ul>
          )}
          <a className="more-link pt-2.5 border-t" href={PRESETS_PATH}>All presets <span aria-hidden>→</span></a>
        </div>
      </section>
    </article>
  )
}

/** Preset cards linking to their pages: the hub, related presets, the home page and utility pages. */
export function PresetCards({ presets, className = 'grid grid-cols-[repeat(auto-fill,minmax(min(100%,280px),1fr))] gap-3' }: { presets: PresetMeta[]; className?: string }) {
  return (
    <ul className={`m-0 p-0 list-none ${className}`}>
      {presets.map(r => (
        <li key={r.slug} className="grid">
          <a className="grid gap-1.5 content-start px-4 pt-3.5 pb-4 border rounded-lg bg-surface hover:border-acc hover:text-fg transition-colors" href={presetPath(r.slug)}>
            <span className="text-[14.5px] leading-5 font-semibold">{r.name}</span>
            <span className="text-[13px] leading-[19px] text-muted text-pretty line-clamp-2">{r.summary}</span>
            {r.chain.length > 0 && <span className="pt-1 font-mono text-[11px] leading-[17px] text-muted">{r.chain.join(' → ')}</span>}
          </a>
        </li>
      ))}
    </ul>
  )
}

/** The preset index's body: every preset, by category, with the page's inline promo after the first category. */
export function PresetsIndex({ presets, promo }: { presets: PresetMeta[]; promo?: React.ReactNode }) {
  const groups = PRESET_CATEGORIES
    .map(category => ({ category, items: presets.filter(r => r.category === category) }))
    .filter(g => g.items.length > 0)
  return (
    <div className="w-full grid gap-10 min-w-0">
      <header className="grid gap-2 max-w-[640px]">
        <h1 className="page-title">{PRESETS_HEADING}</h1>
        <p className="page-lead">
          Ready-made pipelines for jobs one tool can’t do alone: layered formats, messy pasted text, data in the wrong
          shape. Every step shows its real output, and you can open the whole thing in the editor to change it.
        </p>
      </header>
      {groups.map((g, i) => {
        const id = `presets-${g.category.replace(/\W+/g, '-').toLowerCase()}`
        return (
          <React.Fragment key={g.category}>
            <section className="grid gap-3 lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-x-8 min-w-0" aria-labelledby={id}>
              <h2 id={id} className="m-0 pt-1 text-[17px] leading-6 font-semibold tracking-[-0.01em]">{g.category}</h2>
              <PresetCards presets={g.items} />
            </section>
            {i === 0 && promo}
          </React.Fragment>
        )
      })}
      <p className="m-0 text-sm text-muted">
        Need a single conversion instead? <a className="underline decoration-acc underline-offset-[3px]" href="/utilities/">Browse all utilities</a>.
      </p>
    </div>
  )
}
