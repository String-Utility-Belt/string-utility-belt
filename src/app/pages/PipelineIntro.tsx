import React from 'react'
import { DOCS_HEADING, HOME_HEADING } from './seo'

/** The same short introduction above the editor and in the crawlable homepage. */
export default function PipelineIntro({ count }: { count: number }) {
  return (
    <header className="grid gap-2 max-w-[880px]">
      <h1 className="m-0 text-xl leading-7 font-semibold tracking-[-0.02em]">{HOME_HEADING}</h1>
      <p className="m-0 text-sm leading-[22px] text-muted text-pretty">
        String Utility Belt lets you chain {count} free text and data tools into a pipeline, preview every step,
        and save or share the result. Transformations run client-side in your browser.
      </p>
      <p className="m-0 text-sm leading-[22px] text-muted text-pretty">
        Use the same tools through <a className="underline underline-offset-[3px]" href="/integrations/">Chrome and VS Code add-ons,
        the CLI, or an MCP server for AI assistants</a>.
        {' '}<a className="underline underline-offset-[3px]" href="/docs/">{DOCS_HEADING}</a>.
      </p>
    </header>
  )
}
