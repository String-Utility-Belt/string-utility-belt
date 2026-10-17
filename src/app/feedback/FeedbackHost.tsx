import React, { Suspense, lazy, useEffect, useState } from 'react'
import { EVENT_OPEN_FEEDBACK, type OpenFeedbackDetail } from './open'

// the form and its dialog are fetched on first open: nothing of them sits in the entry chunk
const FeedbackDialog = lazy(() => import('./FeedbackDialog'))

/** Answers `openFeedback()` with the feedback dialog. Mounted once, by `AppShell`. */
export default function FeedbackHost() {
  const [detail, setDetail] = useState<OpenFeedbackDetail | null>(null)

  useEffect(() => {
    // already open: keep the draft rather than start over
    const onOpen = (e: Event) => setDetail(open => open ?? ((e as CustomEvent<OpenFeedbackDetail | undefined>).detail ?? {}))
    window.addEventListener(EVENT_OPEN_FEEDBACK, onOpen)
    return () => window.removeEventListener(EVENT_OPEN_FEEDBACK, onOpen)
  }, [])

  if (!detail) return null
  return (
    <Suspense fallback={null}>
      <FeedbackDialog detail={detail} onClose={() => setDetail(null)} />
    </Suspense>
  )
}
