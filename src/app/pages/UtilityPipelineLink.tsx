import React from 'react'
import { DOCS_HEADING } from './seo'

/** A crawlable route from an individual utility to the pipeline guide. */
export default function UtilityPipelineLink() {
  return (
    <p className="m-0 text-[13px] leading-5 text-muted">
      Use this utility as a step in a reusable pipeline.
      {' '}<a className="underline underline-offset-[3px]" href="/docs/">{DOCS_HEADING}</a>.
    </p>
  )
}
