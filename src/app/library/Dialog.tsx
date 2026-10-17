import React, { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

export interface DialogProps {
  title: string
  onClose: () => void
  children: React.ReactNode
  /** Max width of the panel, as a Tailwind class (default `max-w-[520px]`). */
  widthClass?: string
  /** Rendered after the title, before the close button (tabs, a subtitle, …). */
  headerExtra?: React.ReactNode
  /**
   * Where focus goes on close when whatever had focus on open is gone (or was
   * <body>): e.g. the dialog was opened by a window event from a palette that has
   * since closed. Normally the button that owns the dialog.
   */
  returnFocus?: React.RefObject<HTMLElement | null>
  /** What takes focus on open, instead of the first control (e.g. the box a form is about). */
  initialFocus?: React.RefObject<HTMLElement | null>
}

const FOCUSABLE = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Accessible modal shell shared by every dialog this workstream owns (share,
 * library, presets): role="dialog", a labelled title, a Tab-cycle focus trap,
 * Escape to close, and focus returned to whatever opened it. Rendered into
 * <body> so a transformed / backdrop-filtered ancestor (a sticky blurred header,
 * an animated card) cannot turn the fixed overlay into a clipped box.
 */
export default function Dialog({ title, onClose, children, widthClass = 'max-w-[520px]', headerExtra, returnFocus, initialFocus }: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  // Callers pass inline `onClose` arrows; reading it through a ref keeps the effect
  // below mount-only, so a parent re-render never re-runs it (which would yank focus
  // back to the first control and "return" it to the opener mid-dialog).
  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose })
  const returnFocusRef = useRef(returnFocus)
  useEffect(() => { returnFocusRef.current = returnFocus })
  const initialFocusRef = useRef(initialFocus)

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    const panel = panelRef.current
    // only what Tab can actually reach: a tabindex="-1" control (a roving-tab sibling,
    // a hidden file input) at either end would otherwise let focus leak out
    const focusables = () => (panel
      ? Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(el => el.tabIndex >= 0)
      : [])
    ;(initialFocusRef.current?.current ?? focusables()[0] ?? panel)?.focus()

    const onKeyDown = (e: KeyboardEvent) => {
      // a control inside that consumed Escape (cancel an inline rename, close a menu) wins
      if (e.key === 'Escape') { if (!e.defaultPrevented) { e.preventDefault(); onCloseRef.current() } return }
      if (e.key !== 'Tab') return
      const els = focusables()
      if (!els.length) return
      const idx = els.indexOf(document.activeElement as HTMLElement)
      if (e.shiftKey) {
        if (idx <= 0) { e.preventDefault(); els[els.length - 1].focus() }
      } else if (idx === els.length - 1 || idx === -1) {
        e.preventDefault(); els[0].focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      const target = opener && opener !== document.body && opener.isConnected ? opener : returnFocusRef.current?.current
      target?.focus?.()
    }
  }, [])

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center px-4 pt-[9vh] pb-4 bg-black/35"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`w-full ${widthClass} max-h-[calc(91vh-16px)] flex flex-col bg-surface border rounded-[10px] shadow-dialog outline-hidden`}
      >
        <div className="flex items-center gap-2.5 pl-[18px] pr-3 pt-3.5 pb-3 border-b shrink-0">
          <h2 id={titleId} className="m-0 flex-1 min-w-0 text-[15px] font-semibold">{title}</h2>
          {headerExtra}
          <button
            type="button"
            className="grid place-items-center size-7 rounded-[5px] text-muted hover:bg-surface-2 hover:text-fg"
            aria-label="close dialog"
            onClick={onClose}
          >
            <X size={16} aria-hidden />
          </button>
        </div>
        {/* the body scrolls, so the title and close button stay in view on a short screen */}
        <div className="overflow-auto px-[18px] pt-3.5 pb-[18px] grid gap-3 content-start">
          {children}
        </div>
      </div>
    </div>,
    document.body
  )
}
