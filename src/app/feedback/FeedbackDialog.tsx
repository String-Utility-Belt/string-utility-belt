import React, { useRef } from 'react'
import Dialog from '@/app/library/Dialog'
import FeedbackForm from './FeedbackForm'
import type { OpenFeedbackDetail } from './open'

/** The feedback form in a dialog, opened by `openFeedback()` from the footer or a search that found nothing. */
export default function FeedbackDialog({ detail, onClose }: { detail: OpenFeedbackDetail; onClose: () => void }) {
  const messageRef = useRef<HTMLTextAreaElement>(null)
  return (
    <Dialog title="Feedback and suggestions" widthClass="max-w-[560px]" onClose={onClose} initialFocus={messageRef}>
      <FeedbackForm initialKind={detail.kind} initialMessage={detail.message} messageRef={messageRef} onDone={onClose} />
    </Dialog>
  )
}
