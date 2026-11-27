import React, { Suspense, lazy, useEffect, useRef, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { EVENT_OPEN_GENERATE } from '@/app/commands/commands'
import { useT } from '@/app/i18n/useT'
import Dialog from '@/app/library/Dialog'
import type { GenerateDialogProps } from './GenerateDialog'

/** What the dialog shows when its chunk cannot be fetched (offline, or a stale tab after a deploy). */
function GenerateUnavailable({ onClose, returnFocus }: GenerateDialogProps) {
  const { t } = useT()
  return (
    <Dialog title={t('generate.title')} onClose={onClose} returnFocus={returnFocus}>
      <p className="m-0 text-[13px] text-muted text-pretty">{t('generate.error.offline')}</p>
    </Dialog>
  )
}

// Lazy, so the dialog stays out of the editor's entry chunk until someone opens it.
const GenerateDialog = lazy(() =>
  import('./GenerateDialog').catch(() => ({ default: GenerateUnavailable })),
)

/**
 * Opens the describe dialog (REQ-027) from beside the step list. Also opens on the
 * `sub:open-generate` window event, which the command palette fires.
 */
export default function GenerateButton({ className = 'btn h-[30px] px-2.5' }: { className?: string }) {
  const { t } = useT()
  const [open, setOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const onOpen = () => setOpen(true)
    window.addEventListener(EVENT_OPEN_GENERATE, onOpen)
    return () => window.removeEventListener(EVENT_OPEN_GENERATE, onOpen)
  }, [])

  return (
    <>
      <button ref={buttonRef} type="button" className={className} aria-haspopup="dialog"
        title={t('generate.buttonTitle')} onClick={() => setOpen(true)}>
        <Sparkles size={14} aria-hidden="true" /> {t('generate.button')}
      </button>
      {open && (
        <Suspense fallback={null}>
          <GenerateDialog onClose={() => setOpen(false)} returnFocus={buttonRef} />
        </Suspense>
      )}
    </>
  )
}
