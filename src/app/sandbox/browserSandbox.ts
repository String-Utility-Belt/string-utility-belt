/**
 * The web app's Sandbox: every run gets a fresh opaque-origin iframe that starts a
 * Worker to execute the code (see ./frame for why each layer is there). The app
 * bakes the run's code, input and a random token into the frame's srcdoc and then
 * only LISTENS: it never posts the code, input or token to the frame. It trusts a
 * reply only when it comes from that frame's window AND carries the run's token —
 * which only the original srcdoc document knows.
 */
import type { Sandbox, SandboxRequest } from '@/core/sandbox'
import { clampSandboxTimeout, getSandbox, setSandbox } from '@/core/sandbox'
import type { Value } from '@/types/utility'
import { MSG, SANDBOX_FLAGS, buildSrcdoc, encodeInput } from './frame'

export interface BrowserSandboxOptions {
  /** Where frames are created (default: `document`). */
  doc?: Document
  /** The window the frames post back to (default: `window`). */
  win?: Window
  /**
   * Budget for start-up (frame document parsed and its Worker up). Generous: a
   * background tab can take seconds to start a frame, and none of it is user code.
   */
  startupMs?: number
  /**
   * How long past the in-frame timeout the host waits before tearing the frame
   * down itself, in case the frame never reports back.
   */
  graceMs?: number
}

/** Longest error text accepted from the frame. */
const MAX_ERROR_LENGTH = 2000

function newToken(): string {
  const bytes = new Uint8Array(16)
  globalThis.crypto.getRandomValues(bytes)
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
}

function abortError(): Error {
  const message = 'The custom JavaScript run was cancelled.'
  if (typeof DOMException === 'function') return new DOMException(message, 'AbortError')
  return Object.assign(new Error(message), { name: 'AbortError' })
}

function createFrame(doc: Document, srcdoc: string): HTMLIFrameElement {
  const frame = doc.createElement('iframe')
  frame.setAttribute('sandbox', SANDBOX_FLAGS)
  frame.setAttribute('referrerpolicy', 'no-referrer')
  frame.setAttribute('aria-hidden', 'true')
  frame.setAttribute('tabindex', '-1')
  frame.title = 'custom JavaScript sandbox'
  // kept rendered (zero-size, invisible) rather than display:none, which browsers may deprioritise
  frame.style.cssText = 'position:absolute;width:0;height:0;border:0;visibility:hidden;pointer-events:none'
  frame.srcdoc = srcdoc
  return frame
}

const NOT_STARTED = 'the custom JavaScript sandbox did not start — this browser may be blocking it'

/**
 * What the Worker requests to check that the frame's CSP reached it (see ./frame): a
 * small file on this site, so the site's own CSP allows the request and only the
 * frame's policy can block it.
 */
export const PROBE_PATH = '/robots.txt'

/** PROBE_PATH on this page's site; '' without a usable location, which the Worker refuses. */
function probeUrl(win: Window): string {
  try {
    return new URL(PROBE_PATH, win.location.href).href
  } catch {
    return ''
  }
}

export function createBrowserSandbox(opts: BrowserSandboxOptions = {}): Sandbox {
  const startupMs = opts.startupMs ?? 10000
  const graceMs = opts.graceMs ?? 1000
  return {
    run(req: SandboxRequest): Promise<Value> {
      const doc = opts.doc ?? document
      const win = opts.win ?? window
      return new Promise<Value>((resolve, reject) => {
        const { signal } = req
        if (signal?.aborted) { reject(abortError()); return }
        const timeoutMs = clampSandboxTimeout(req.timeoutMs)
        const token = newToken()
        // The job — including the code and input — lives ONLY in the srcdoc, never in
        // a postMessage: an opaque-origin frame can only be posted to at '*', so a
        // page that framed the app and navigated this frame would otherwise read it.
        const frame = createFrame(doc, buildSrcdoc({
          token, code: req.code, input: encodeInput(req.input), timeoutMs, probe: probeUrl(win),
        }))
        // starting → (running) running → (result) settled
        let phase: 'starting' | 'running' = 'starting'
        let settled = false
        let timer: ReturnType<typeof setTimeout> | undefined

        const cleanup = () => {
          win.removeEventListener('message', onMessage)
          signal?.removeEventListener('abort', onAbort)
          clearTimeout(timer)
          frame.remove()
        }
        const settle = (fn: () => void) => {
          if (settled) return
          settled = true
          cleanup()
          fn()
        }
        const failAfter = (ms: number, message: string) => {
          clearTimeout(timer)
          timer = setTimeout(() => settle(() => reject(new Error(message))), ms)
        }
        function onMessage(e: MessageEvent) {
          const source = frame.contentWindow
          if (!source || e.source !== source) return
          const d = e.data
          if (!d || typeof d !== 'object') return
          // The token gates every message: only the original srcdoc document knows it,
          // so a document that replaced this frame cannot spoof `ready`, `running` or `result`.
          if (d.token !== token) return
          if (d[MSG] === 'ready') {
            // the document parsed; give the Worker its own start-up budget
            if (phase === 'starting') failAfter(startupMs, NOT_STARTED)
            return
          }
          if (d[MSG] === 'running') {
            if (phase !== 'starting') return
            phase = 'running'
            failAfter(timeoutMs + graceMs, `timed out after ${timeoutMs} ms`)
            return
          }
          if (d[MSG] !== 'result') return
          if (d.ok === true) settle(() => resolve(d.value as Value))
          else settle(() => reject(new Error(String(d.error ?? 'the code failed').slice(0, MAX_ERROR_LENGTH))))
        }
        function onAbort() { settle(() => reject(abortError())) }

        failAfter(startupMs, NOT_STARTED)
        win.addEventListener('message', onMessage)
        signal?.addEventListener('abort', onAbort, { once: true })
        try {
          (doc.body ?? doc.documentElement).appendChild(frame)
        } catch (e) {
          settle(() => reject(e))
        }
      })
    },
  }
}

let installed: Sandbox | undefined

/**
 * Register the iframe sandbox as this page's Sandbox. Call once at startup;
 * repeated calls are no-ops. Returns undefined outside a browser.
 */
export function installBrowserSandbox(): Sandbox | undefined {
  if (typeof window === 'undefined' || typeof document === 'undefined') return undefined
  installed ??= createBrowserSandbox()
  if (getSandbox() !== installed) setSandbox(installed)
  return installed
}
