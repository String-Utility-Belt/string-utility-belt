import React, { useEffect, useId, useMemo, useRef, useState } from 'react'
import { ArrowRight, Info, ShieldAlert } from 'lucide-react'
import { registry, loadExamples, type UtilityMeta } from '@/app/registry'
import { runPipeline } from '@/core/runner'
import { defaultParams } from '@/core/params'
import { formatForDisplay, showControlChars } from '@/core/coerce'
import { stepId } from '@/core/steps'
import { loadState, saveState } from '@/lib/persist'
import { isPlainLeftClick, navigateToPath } from '@/lib/router'
import ParamsEditor from '@/components/ParamsEditor'
import type { ParamSpec, Params, UtilityEnv, UtilityExample } from '@/types/utility'
import UtilityGuide from './UtilityGuide'
import { useUtilityGuide } from './useUtilityGuide'
import { useDocumentMeta } from './useDocumentMeta'
import { useNoindex } from './useNoindex'
import { relatedUtilities, utilityPath } from './related'
import { PRESET_INDEX } from '@/presets/_generated/index'
import { presetsUsing } from './presets/presetHelpers'
import { presetPath } from '@/presets/types'
import { SITE_NAME, displayName, pageTitle } from './seo'
import PageSponsor from '@/app/sponsors/PageSponsor'
import PagePromo from '@/app/sponsors/PagePromo'
import RunElsewhere from '@/app/integrations/RunElsewhere'

const ENV_NOTES: Record<UtilityEnv, string> = {
  dom: 'Needs the DOM (DOMParser/document), so it runs on the browser main thread only.',
  wasm: 'Compiles WebAssembly at runtime, so the edge API cannot run it.',
  eval: 'Runs code you write. Only run code you have read, and never run this on a server.',
  main: 'Must run on the browser main thread.',
}

const PLAYGROUND_DEBOUNCE_MS = 300
const PLAYGROUND_STEP_ID = '__doc_playground__'
const COPIED_MS = 2000

function boundsOrOptions(spec: ParamSpec): string {
  switch (spec.kind) {
    case 'number':
    case 'range': {
      const parts: string[] = []
      if (spec.min !== undefined || spec.max !== undefined) {
        parts.push(`${spec.min ?? '−∞'}–${spec.max ?? '∞'}`)
      }
      if (spec.kind === 'number' && spec.step !== undefined) parts.push(`step ${spec.step}`)
      if (spec.kind === 'number' && spec.integer) parts.push('integer')
      return parts.join(', ')
    }
    case 'select':
    case 'multiselect':
      return spec.options.join(', ')
    case 'string':
    case 'textarea':
      return spec.maxLength ? `max ${spec.maxLength} chars` : ''
    default:
      return ''
  }
}

const defaultOf = (spec: ParamSpec): string => {
  const d = (spec as { default?: unknown }).default
  if (d === undefined) return 'none'
  return typeof d === 'string' ? d || '(empty)' : JSON.stringify(d)
}

/** A param's kind as the settings table names it. */
const kindOf = (spec: ParamSpec): string => spec.kind === 'boolean' ? 'on / off' : spec.kind

/** An example's params as `label: value` pairs, the way the settings strip names them. */
const describeExampleParams = (params: Params, spec: Record<string, ParamSpec>): string =>
  Object.entries(params)
    .map(([k, v]) => `${spec[k]?.label || k}: ${typeof v === 'string' ? (v === '' ? '(empty)' : v.replace(/\n/g, '\\n').replace(/\t/g, '\\t')) : JSON.stringify(v)}`)
    .join(' · ')

/** Example inputs stored hex/base64-encoded are bytes — the text playground cannot take them as-is. */
const playable = (ex: UtilityExample) => !ex.inputEncoding || ex.inputEncoding === 'text' || ex.inputEncoding === 'json'

/**
 * Opens the tool page. On a pre-rendered `/util/<id>/` page the path itself routes
 * here, so `#/` alone would land right back on this page: leave the path for the root.
 */
function openTool() {
  const root = import.meta.env.BASE_URL || '/'
  if (location.pathname === root) {
    location.hash = '#/'
    return
  }
  history.pushState(history.state, '', `${root}#/`)
  window.dispatchEvent(new HashChangeEvent('hashchange'))
}

/** Documentation for one utility: description, params, examples and a live playground. */
export default function UtilityDocPage({ id }: { id: string }) {
  const meta = registry.get(id)
  if (!meta) return <UnknownUtility id={id} />
  // keyed on id: switching utilities remounts the body, resetting its local state
  // (playground input/params/output, saved examples) without an extra effect for it
  return <UtilityDocPageBody key={id} id={id} meta={meta} />
}

function UnknownUtility({ id }: { id: string }) {
  useDocumentMeta(pageTitle('Unknown utility'), `There is no ${SITE_NAME} utility called "${id}".`)
  // the host answers any /util/<id>/ with a page: keep the made-up ones out of the index
  useNoindex()
  return (
    <div className="max-w-[560px] grid gap-3">
      <h1 className="text-[28px] leading-[34px] font-semibold tracking-[-0.02em] wrap-anywhere">No utility called “{id}”</h1>
      <p className="page-lead">It may have been renamed. The full list is searchable.</p>
      <a className="btn w-fit" href="/utilities/">Browse all utilities</a>
    </div>
  )
}

function UtilityDocPageBody({ id, meta }: { id: string; meta: UtilityMeta }) {
  const [examples, setExamples] = useState<UtilityExample[]>([])
  const [playInput, setPlayInput] = useState('')
  const [playParams, setPlayParams] = useState<Params>(() => defaultParams(meta))
  const [playOutput, setPlayOutput] = useState('')
  const [playError, setPlayError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [copied, setCopied] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const playgroundId = useId()
  const guide = useUtilityGuide(id)
  const seo = guide.status === 'ok' ? guide.guide : undefined

  // the guide's SEO title/description match the pre-rendered page's <head>
  useDocumentMeta(
    pageTitle(seo?.title ?? displayName(meta.name)),
    seo?.description || meta.description || `${displayName(meta.name)} — a ${SITE_NAME} utility.`,
  )

  useEffect(() => {
    let cancelled = false
    loadExamples()
      .then(all => { if (!cancelled) setExamples(all[id] ?? []) })
      .catch(() => { /* examples are optional extras: a failed chunk load just hides them */ })
    return () => { cancelled = true }
  }, [id])

  useEffect(() => {
    const ctrl = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const result = await runPipeline(
          playInput,
          [{ id: PLAYGROUND_STEP_ID, utilityId: id, params: playParams, enabled: true }],
          { load: registry.load, signal: ctrl.signal, env: 'browser-main' }
        )
        if (ctrl.signal.aborted) return
        if (result.err[PLAYGROUND_STEP_ID]) {
          setPlayError(result.err[PLAYGROUND_STEP_ID])
          setPlayOutput('')
        } else {
          setPlayError(null)
          setPlayOutput(formatForDisplay(result.out))
        }
      } catch (e) {
        if (!ctrl.signal.aborted) { setPlayError((e as Error)?.message || String(e)); setPlayOutput('') }
      }
    }, PLAYGROUND_DEBOUNCE_MS)
    return () => { ctrl.abort(); clearTimeout(timer) }
  }, [id, playInput, playParams])

  const related = useMemo(() => relatedUtilities(meta, registry.list()), [meta])
  const presets = useMemo(() => presetsUsing(id, PRESET_INDEX), [id])

  const tryExample = (ex: UtilityExample) => {
    setPlayInput(ex.input)
    setPlayParams({ ...defaultParams(meta), ...ex.params })
    inputRef.current?.focus()
  }

  const useInPipeline = () => {
    const current = loadState()
    const step = { id: stepId(), utilityId: id, enabled: true, params: { ...playParams } }
    saveState({ ...current, steps: [...current.steps, step] })
    setSaved(true)
    openTool()
  }

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), COPIED_MS)
    return () => clearTimeout(timer)
  }, [copied])

  const copyOutput = () => {
    navigator.clipboard?.writeText(playOutput).then(
      () => setCopied(true),
      () => { /* clipboard refused (permissions, insecure context): nothing was copied */ })
  }

  const paramEntries = Object.entries(meta.params)
  const anyDescription = paramEntries.some(([, spec]) => spec.description)
  const thClass = 'text-left font-medium text-muted px-3 py-2 bg-strip'
  const tdClass = 'px-3 py-2 border-t align-top'

  return (
    <article className="grid gap-8 min-w-0">
      <header className="grid gap-2.5 pb-6 border-b min-w-0">
        <nav aria-label="Breadcrumb" className="flex flex-wrap gap-1.5 text-[12.5px] text-muted">
          <a className="hover:text-fg" href="/utilities/">Utilities</a>
          <span aria-hidden="true">/</span>
          <span>{meta.category}</span>
        </nav>
        <h1 className="page-title wrap-anywhere">{displayName(meta.name)}</h1>
        <p className="page-lead max-w-[640px] text-pretty">{meta.description}</p>
        <div className="flex flex-wrap gap-2 items-center font-mono text-[11.5px] text-muted">
          <span className="px-[7px] py-0.5 border rounded-[4px]">{meta.category}</span>
          <span>
            accepts {[meta.accepts].flat().join(' | ')} → produces {[meta.produces].flat().join(' | ')}
          </span>
        </div>
        {meta.env.length > 0 && (
          <ul className="grid gap-1 text-[13px]" aria-label="environment notes">
            {meta.env.map(e => {
              const Icon = e === 'eval' ? ShieldAlert : Info
              return (
                <li key={e} className={`flex gap-2 items-start ${e === 'eval' ? 'text-warn' : 'text-muted'}`}>
                  <Icon aria-hidden size={14} className="shrink-0 mt-[3px]" />{ENV_NOTES[e] ?? e}
                </li>
              )
            })}
          </ul>
        )}
        {(meta.tags.length > 0 || meta.aliases.length > 0) && (
          <div className="flex flex-wrap gap-1">
            {meta.aliases.map(a => <span key={`a:${a}`} className="chip" title="alias">{a}</span>)}
            {meta.tags.map(t => <span key={`t:${t}`} className="chip" title="tag">{t}</span>)}
          </div>
        )}
        {/* in the header, never in the playground below it */}
        <PageSponsor page={{ kind: 'utility', id }} className="mt-2.5 max-w-[560px]" />
      </header>

      <div className="grid gap-10 lg:grid-cols-3 items-start min-w-0">
        <div className="grid gap-10 min-w-0 lg:col-span-2">
          {/* first after the header: most visitors arrive from a search for the tool itself */}
          <section className="border rounded-[10px] bg-surface min-w-0" aria-labelledby={`${playgroundId}-h`}>
            <div className="flex flex-wrap items-center gap-2 pl-4 pr-2 min-h-[46px] border-b">
              <h2 id={`${playgroundId}-h`} className="text-sm font-semibold flex-1">Try it</h2>
              {saved && <span role="status" className="text-[12.5px] text-muted">Added. Opening the tool…</span>}
              <button type="button" className="btn-ghost h-[30px] text-[12.5px]" onClick={copyOutput} disabled={!playOutput}>
                {copied ? 'Copied' : 'Copy output'}
              </button>
              <button type="button" className="cta h-[30px]" onClick={useInPipeline}>
                Use in pipeline<ArrowRight aria-hidden size={13} />
              </button>
            </div>
            {paramEntries.length > 0 && (
              <div className="px-4 py-3 border-b bg-strip min-w-0">
                <ParamsEditor
                  spec={meta.params}
                  params={playParams}
                  onChange={setPlayParams}
                  idPrefix={`doc-playground-${id}`}
                  sampleInput={playInput}
                />
              </div>
            )}
            <div className="grid sm:grid-cols-2">
              <label className="grid content-start min-w-0 border-b sm:border-b-0 sm:border-r">
                <span className="px-4 pt-2.5 text-[11.5px] text-muted">Input</span>
                <textarea
                  ref={inputRef}
                  className="min-h-[180px] resize-y border-0 outline-hidden px-4 pt-1.5 pb-3.5 bg-transparent font-mono text-[13px] leading-[21px]"
                  value={playInput}
                  onChange={e => setPlayInput(e.target.value)}
                  placeholder="Type or paste something"
                  spellCheck={false}
                  aria-label="playground input"
                />
              </label>
              <div className="grid content-start min-w-0 bg-strip rounded-b-[10px] sm:rounded-bl-none">
                <span className="px-4 pt-2.5 text-[11.5px] text-muted" aria-hidden>Output</span>
                {playError && (
                  // polite, not an alert: it fires while typing
                  <p role="status" aria-label="playground error" className="mx-4 mt-1.5 text-[13px] text-danger-ink wrap-anywhere">
                    {playError}
                  </p>
                )}
                {/* a named live region: aria-label alone is not allowed on a plain <pre> */}
                <pre
                  role="status"
                  aria-label="playground output"
                  className={`m-0 px-4 pt-1.5 pb-3.5 max-h-[360px] overflow-auto font-mono text-[13px] leading-[21px] whitespace-pre-wrap wrap-anywhere ${playError ? '' : 'min-h-[180px]'}`}
                >
                  {playOutput}
                </pre>
              </div>
            </div>
          </section>

          <RunElsewhere meta={meta} input={playInput} params={playParams} />

          <PagePromo page={{ kind: 'utility', id }} slot="inline" />

          <UtilityGuide name={meta.name} state={guide} />

          {examples.length > 0 && (
            <section className="grid gap-3.5 min-w-0" aria-labelledby={`${playgroundId}-ex`}>
              <h2 id={`${playgroundId}-ex`} className="section-title">Examples</h2>
              {examples.map((ex, i) => (
                <div key={i} className="grid gap-2 pt-3.5 border-t min-w-0">
                  <div className="flex items-center justify-between gap-2.5">
                    <h3 className="text-sm font-semibold">{ex.title || `Example ${i + 1}`}</h3>
                    {playable(ex) && (
                      <button
                        type="button"
                        className="h-[26px] px-2.5 border rounded-[5px] bg-surface text-[12.5px] font-medium shrink-0 hover:border-acc hover:text-acc"
                        aria-label={`Try example${ex.title ? `: ${ex.title}` : ` ${i + 1}`} in the playground`}
                        onClick={() => tryExample(ex)}
                      >
                        Try it
                      </button>
                    )}
                  </div>
                  {ex.params && Object.keys(ex.params).length > 0 && (
                    <span className="font-mono text-[11.5px] text-muted wrap-anywhere">{describeExampleParams(ex.params, meta.params)}</span>
                  )}
                  <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,220px),1fr))] gap-2">
                    <div className="grid gap-1 content-start min-w-0">
                      <span className="text-[11px] text-muted">
                        Input{ex.inputEncoding && ex.inputEncoding !== 'text' ? ` (${ex.inputEncoding})` : ''}
                      </span>
                      <pre className="m-0 px-2.5 py-2 rounded-md bg-surface-2 font-mono text-xs leading-[19px] whitespace-pre-wrap wrap-anywhere max-h-40 overflow-auto">{ex.input ? showControlChars(ex.input) : '(empty)'}</pre>
                    </div>
                    <div className="grid gap-1 content-start min-w-0">
                      <span className="text-[11px] text-muted">
                        Output{ex.output === undefined && ex.outputMatches ? ' (varies between runs, matches this pattern)' : ''}
                      </span>
                      <pre className="m-0 px-2.5 py-2 rounded-md bg-surface-2 font-mono text-xs leading-[19px] whitespace-pre-wrap wrap-anywhere max-h-40 overflow-auto">
                        {ex.output !== undefined ? showControlChars(ex.output) : ex.outputMatches ? `/${ex.outputMatches}/` : '(varies between runs)'}
                      </pre>
                    </div>
                  </div>
                </div>
              ))}
            </section>
          )}

          {paramEntries.length > 0 && (
            <section className="grid gap-3.5 min-w-0" aria-labelledby={`${playgroundId}-par`}>
              <h2 id={`${playgroundId}-par`} className="section-title">Settings</h2>
              <div className="overflow-x-auto border rounded-lg">
                <table className="w-full border-collapse text-[13px] leading-5">
                  <thead>
                    <tr>
                      <th scope="col" className={thClass}>Name</th>
                      <th scope="col" className={thClass}>Kind</th>
                      <th scope="col" className={thClass}>Default</th>
                      <th scope="col" className={thClass}>Options</th>
                      {anyDescription && <th scope="col" className={thClass}>Description</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {paramEntries.map(([name, spec]) => (
                      <tr key={name}>
                        <th scope="row" className={`${tdClass} text-left font-medium`}>
                          <span className="grid">
                            {spec.label && spec.label !== name && <span>{spec.label}</span>}
                            <span className={spec.label && spec.label !== name ? 'font-mono text-[11px] font-normal text-muted' : 'font-mono text-xs'}>{name}</span>
                          </span>
                        </th>
                        <td className={`${tdClass} text-muted`}>{kindOf(spec)}</td>
                        <td className={`${tdClass} font-mono text-xs whitespace-pre-wrap wrap-anywhere`}>{defaultOf(spec)}</td>
                        <td className={`${tdClass} text-muted`}>{boundsOrOptions(spec)}</td>
                        {anyDescription && <td className={`${tdClass} text-muted`}>{spec.description}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>

        <div className="grid gap-7 content-start min-w-0 lg:sticky lg:top-[84px]">
          <PagePromo page={{ kind: 'utility', id }} slot="rail" />
          {presets.length > 0 && (
            <section className="grid" aria-labelledby={`${playgroundId}-rec`}>
              <h2 id={`${playgroundId}-rec`} className="text-[13px] font-semibold mb-2.5">Presets that use it</h2>
              {presets.map(r => (
                <a key={r.slug} className="link-row hover:[&>:first-child]:text-acc" href={presetPath(r.slug)}>
                  <span>{r.name}</span>
                  <span>{r.category}</span>
                </a>
              ))}
            </section>
          )}
          {related.length > 0 && (
            <section className="grid" aria-labelledby={`${playgroundId}-rel`}>
              <h2 id={`${playgroundId}-rel`} className="text-[13px] font-semibold mb-2.5">Related utilities</h2>
              {related.map(m => (
                // a crawlable path href (search engines drop #/ fragments); clicks stay in the app
                <a
                  key={m.id}
                  className="link-row hover:[&>:first-child]:text-acc"
                  href={utilityPath(m.id)}
                  onClick={e => {
                    if (!isPlainLeftClick(e, e.currentTarget)) return
                    e.preventDefault()
                    navigateToPath(utilityPath(m.id))
                  }}
                >
                  <span>{displayName(m.name)}</span>
                  <span className="line-clamp-2">{m.description}</span>
                </a>
              ))}
              <a className="more-link pt-2.5 border-t" href="/utilities/">All utilities <span aria-hidden="true">→</span></a>
            </section>
          )}
        </div>
      </div>
    </article>
  )
}
