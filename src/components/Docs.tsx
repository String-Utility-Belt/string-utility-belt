import React, { useEffect } from 'react'
import { ArrowRight } from 'lucide-react'
import { DOCS_DESCRIPTION, DOCS_HEADING, DOCS_TITLE } from '@/app/pages/seo'
import { useDocumentMeta } from '@/app/pages/useDocumentMeta'
import PagePromo from '@/app/sponsors/PagePromo'
import { MAX_EACH_ITEMS } from '@/core/runner'
import { scrollToFragment } from '@/lib/router'

const SECTIONS = [
  { id: 'pipeline', title: 'Build a pipeline' },
  { id: 'steps', title: 'Work with steps' },
  { id: 'advanced', title: 'Branches, macros and conditions' },
  { id: 'each', title: 'Run steps on each line or value' },
  { id: 'previews', title: 'Previews and errors' },
  { id: 'types', title: 'Strings, bytes and JSON' },
  { id: 'output', title: 'Get the result out' },
  { id: 'saved', title: "What's saved" },
  { id: 'example', title: 'Example: title to URL slug' },
  { id: 'utilities', title: 'Utility reference' },
]

const STEP_CONTROLS: [string, string][] = [
  ['Checkbox', 'Turns the step on or off. A disabled step passes its input through unchanged.'],
  ['Drag handle, or ▲ / ▼', 'Moves the step. With the handle focused, Alt+Arrow keys move it too. Order matters.'],
  ['Bin icon', 'Removes the step.'],
  ['Step menu', 'Rename, duplicate, move, solo or delete the step.'],
  ['utility dropdown', 'Swaps the step to a different utility. The new utility starts at its defaults.'],
  ['Parameter fields', 'Settings for the utility, such as case mode, regex pattern or max length. Each field starts at a sensible default.'],
]

const SPLIT_MODES: [string, string][] = [
  ['line', 'Every line. Windows (CRLF) line endings are kept, and a final newline does not count as an extra empty line.'],
  ['piece between separators', 'The text between each occurrence of a separator you type, such as a comma.'],
  ['JSON array element', 'Every element of a top-level JSON array. The result is an array of the same length.'],
  ['JSON object value', 'Every value of a top-level JSON object. Keys stay as they are; nested objects are not split further.'],
]

const EXAMPLE: [string, string, string][] = [
  ['trim', 'defaults', 'Crème Brûlée: A Guide!'],
  ['remove diacritics', 'defaults', 'Creme Brulee: A Guide!'],
  ['slug', 'defaults', 'creme-brulee-a-guide'],
  ['truncate', 'max length 12, ellipsis cleared', 'creme-brulee'],
]

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id}>
      <h2 className="md-h2">{title}</h2>
      {children}
    </section>
  )
}

function Table({ head, rows, monoCols = [] }: { head: string[]; rows: React.ReactNode[][]; monoCols?: number[] }) {
  return (
    <div className="md-table-wrap">
      <table className="md-table">
        <thead>
          <tr>{head.map(h => <th key={h}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => <td key={j} className={monoCols.includes(j) ? 'font-mono text-[12.5px]' : undefined}>{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const Code = ({ children }: { children: React.ReactNode }) => <code className="md-code">{children}</code>

/**
 * How to use the tool: the `/docs/` page. `scripts/seo/build.ts` pre-renders it with
 * `renderToStaticMarkup`, so rendering must stay free of browser APIs (effects are fine).
 */
export default function Docs() {
  // restored on leaving, like the other route pages
  useDocumentMeta(DOCS_TITLE, DOCS_DESCRIPTION)

  // the pre-render already lands on /docs/#section; the app's lazy chunk renders after that jump
  useEffect(() => { scrollToFragment() }, [])

  return (
    <div className="grid gap-10 lg:grid-cols-[200px_minmax(0,760px)] items-start">
      {/* the section list sits beside the guide; on narrower screens the guide starts the page */}
      <div className="hidden lg:grid lg:sticky lg:top-[84px] gap-5">
        <nav aria-label="Docs sections" className="grid gap-px text-[13px]">
          <span className="px-2.5 pb-2 text-[11.5px] font-medium text-muted">On this page</span>
          {SECTIONS.map(s => (
            // a plain in-page link (works without scripts); with them, the click scrolls
            // smoothly in place, and the prevented click is left alone by the app's link handler
            <a key={s.id} href={`/docs/#${s.id}`}
              onClick={e => { e.preventDefault(); document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth' }) }}
              className="px-2.5 py-[5px] rounded-[5px] text-muted hover:bg-surface-2 hover:text-fg">{s.title}</a>
          ))}
        </nav>
        <PagePromo page={{ kind: 'index' }} slot="rail" />
      </div>

      <div className="grid gap-7 min-w-0">
        <header className="grid gap-2.5 pb-6 border-b">
          <h1 className="page-title">{DOCS_HEADING}</h1>
          <p className="m-0 text-base leading-[26px] text-muted text-pretty">
            String utility chaining passes each tool's output to the next step in a <strong className="font-semibold text-fg">pipeline</strong>.
            Combine decoding, formatting and cleanup tools, preview intermediate results, and save your sequence to use again.
          </p>
          <a className="cta justify-self-start mt-1.5 h-[34px] text-[13.5px]" href="/">
            Open the tool<ArrowRight size={13} aria-hidden="true" />
          </a>
        </header>

        <div className="md [&>section:first-child>h2]:mt-0">
          <Section id="pipeline" title="Build a pipeline">
            <ol className="md-ol">
              <li className="md-li">
                Type or paste text into the <strong>input</strong> box. You can also <strong>open file</strong> or{' '}
                <strong>fetch URL</strong> to load input from elsewhere.
              </li>
              <li className="md-li">
                Add steps. <strong>Add step</strong> opens a picker where you can filter by category or search by name.
                You can also use the <strong>quick add</strong> dropdown, start from a <strong>preset</strong>, or press{' '}
                <Code>Ctrl K</Code> to open the command palette.
              </li>
              <li className="md-li">New steps go to the end of the pipeline. The result updates as you type. You don't need to run anything.</li>
              <li className="md-li"><strong>Undo</strong> (<Code>Ctrl Z</Code>) and <strong>redo</strong> (<Code>Ctrl Shift Z</Code>) cover every change to the pipeline.</li>
            </ol>
          </Section>

          <Section id="steps" title="Work with steps">
            <p className="md-p">Each step card has these controls:</p>
            <Table head={['Control', 'What it does']} rows={STEP_CONTROLS} />
            <p className="md-p">
              Badges on each card show the step's category, the type of value it produced (<Code>string</Code>,{' '}
              <Code>bytes</Code> or <Code>json</Code>) and how long it took.
            </p>
          </Section>

          <Section id="advanced" title="Branches, macros and conditions">
            <ul className="md-ul">
              <li className="md-li"><strong>branch</strong> forks the pipeline into parallel lanes that each get the same input. Their outputs are merged with a separator you choose.</li>
              <li className="md-li">Select a run of neighbouring steps to group them into a <strong>macro</strong>: one reusable step you can save to your library.</li>
              <li className="md-li">In a step's advanced settings, a <strong>run condition</strong> skips the step unless the input is non-empty, matches a regex or is a given type.</li>
            </ul>
          </Section>

          <Section id="each" title="Run steps on each line or value">
            <p className="md-p">
              Most steps work on the whole input at once. A <strong>run on each</strong> step splits its input into items,
              runs the steps inside it on every item on its own, and puts the results back where the items came from. Use
              it to base64-decode every value of a Kubernetes Secret, decode one JWT per log line, or slugify a list of
              titles.
            </p>
            <p className="md-p">Add one with the <strong>each</strong> button, or select steps and choose <strong>Run on each line</strong>. Then pick how to split:</p>
            <Table head={['Split into each…', 'Items']} rows={SPLIT_MODES} />
            <ul className="md-ul">
              <li className="md-li"><strong>skip empty</strong> (on by default) leaves empty lines and empty values as they are.</li>
              <li className="md-li">
                A result that is JSON goes back into a line as one line of compact JSON. In JSON mode, a number, true, false
                or null stays one if its result still reads as one.
              </li>
              <li className="md-li">
                When the steps fail on an item, the step's <strong>If this step fails</strong> setting (under <strong>Advanced</strong>) decides what that item becomes:
                by default it keeps whatever its steps produced, <em>empty output</em> blanks it, and <em>stop</em> fails the
                whole step. The other items are never affected. The card counts the items that failed.
              </li>
              <li className="md-li">With previews on, the steps inside show one item: the first that failed, or else the first that ran.</li>
              <li className="md-li">
                One run can process up to {MAX_EACH_ITEMS.toLocaleString('en-US')} items, counting those of each steps nested
                in others (the HTTP API allows fewer).
              </li>
            </ul>
          </Section>

          <Section id="previews" title="Previews and errors">
            <ul className="md-ul">
              <li className="md-li">
                Tick <strong>Previews</strong> to see each step's output below its card. Turn on the diff view
                to see what a step changed. This helps you find where a chain goes wrong.
              </li>
              <li className="md-li">
                If a step fails, for example because of an invalid regex or bad hex, its card shows the error in red. By default
                the pipeline carries on with that step's input. Change this per step under <strong>Advanced</strong>, in <strong>If this step fails</strong>: stop the
                pipeline, or continue with empty output.
              </li>
            </ul>
          </Section>

          <Section id="types" title="Strings, bytes and JSON">
            <p className="md-p">
              Some utilities work on raw bytes instead of text (for example <strong>Get bytes</strong>, <strong>hex decode</strong> and{' '}
              <strong>md5 hash</strong>). The pipeline converts between types for you: text becomes UTF‑8 bytes when a step
              needs bytes, and the other way round.
            </p>
            <p className="md-p">When the result is bytes, it's shown as decimal values, hex and, where possible, decoded UTF‑8 text.</p>
          </Section>

          <Section id="output" title="Get the result out">
            <ul className="md-ul">
              <li className="md-li">Under the result panel, <strong>copy</strong> puts the output on your clipboard (pick a format) and <strong>download</strong> saves it as a file.</li>
              <li className="md-li"><strong>share</strong> makes a link that opens your pipeline in anyone's browser. Your input text is only included if you tick <strong>Include my input</strong>.</li>
              <li className="md-li"><strong>library</strong> keeps named pipelines and macros you want to reuse. You can export it as <Code>.json</Code> and import it again later.</li>
            </ul>
          </Section>

          <Section id="saved" title="What's saved">
            <p className="md-p">
              Your current pipeline, its name and the preview toggle are saved in this browser, so they're still there after you
              reload. The input text <strong>is not</strong> saved.
            </p>
          </Section>

          <Section id="example" title="Example: title to URL slug">
            <p className="md-p">Input: <code className="md-code whitespace-pre">{'  Crème Brûlée: A Guide!  '}</code></p>
            <Table head={['Step', 'Utility', 'Settings', 'Output']} monoCols={[3]}
              rows={EXAMPLE.map(([u, s, o], i) => [String(i + 1), u, s, o])} />
          </Section>

          <Section id="utilities" title="Utility reference">
            <p className="md-p">
              Every utility has its own page with its settings and worked examples. Browse them all on the{' '}
              <a className="md-link" href="/utilities/">utilities index</a>.
            </p>
          </Section>
        </div>
      </div>
    </div>
  )
}
