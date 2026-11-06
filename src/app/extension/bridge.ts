/**
 * The app's side of the browser-extension bridge (protocol: `@/core/extensionBridge`).
 * The extension lists the site's origins in `externally_connectable`, which is
 * what gives pages here `chrome.runtime.sendMessage(extensionId, …)`. The app
 * pings the store extension's id (then any `VITE_EXTENSION_IDS`, for unpacked
 * builds) and offers "save to extension" once one answers. An answer is also counted
 * (`extension_detected`, version and kind of page only), once per page load.
 */
import { useSyncExternalStore } from 'react'
import {
  APP_SOURCE, BRIDGE_PROTOCOL, STORE_EXTENSION_ID, helloStepTypes, isBridgeResult, isExtensionHello,
  type AppMessage, type AppRequest, type BridgeResult,
} from '@/core/extensionBridge'
import { countExtensionDetected } from '@/app/events/extensionDetected'

export interface ExtensionInfo {
  id: string
  version: string
  /** Step types it can save and run (older builds don't say: `LEGACY_STEP_TYPES`). */
  stepTypes: readonly string[]
}

/** The slice of `chrome.runtime` Chrome exposes to a page an extension is externally connectable from. */
interface PageRuntime {
  sendMessage(extensionId: string, message: unknown, callback: (response: unknown) => void): void
  lastError?: { message?: string }
}

/** How long a ping may take: an installed extension answers in milliseconds. */
export const PING_TIMEOUT_MS = 2_000
/** How long a request may take before the app gives up on the extension answering. */
export const REQUEST_TIMEOUT_MS = 10_000

const pageRuntime = (): PageRuntime | undefined => {
  const runtime = (globalThis as { chrome?: { runtime?: Partial<PageRuntime> } }).chrome?.runtime
  return typeof runtime?.sendMessage === 'function' ? (runtime as PageRuntime) : undefined
}

/** The store extension first, then unpacked builds named at build time. */
export function extensionIds(extra: string | undefined = import.meta.env.VITE_EXTENSION_IDS): string[] {
  const ids = [STORE_EXTENSION_ID, ...(extra ?? '').split(',').map(id => id.trim()).filter(Boolean)]
  return [...new Set(ids)]
}

const NO_ANSWER = Symbol('no answer')

/** Sends `message` to one extension; `NO_ANSWER` when it isn't installed, refuses the page, or times out. */
function call(extensionId: string, message: AppMessage, timeoutMs: number): Promise<unknown> {
  const runtime = pageRuntime()
  if (!runtime) return Promise.resolve(NO_ANSWER)
  return new Promise(resolve => {
    const timer = setTimeout(() => resolve(NO_ANSWER), timeoutMs)
    try {
      runtime.sendMessage(extensionId, message, response => {
        clearTimeout(timer)
        // reading lastError also keeps Chrome from logging "Unchecked runtime.lastError"
        resolve(runtime.lastError ? NO_ANSWER : response)
      })
    } catch {
      clearTimeout(timer)
      resolve(NO_ANSWER)
    }
  })
}

/**
 * Where detection stands: `'checking'` while a ping is out, `'absent'` once no extension
 * answered (at once when the page has no `chrome.runtime`, as in browsers without one),
 * else the extension that answered.
 */
export type ExtensionStatus = 'checking' | 'absent' | ExtensionInfo

let extension: ExtensionInfo | null = null
let detection: Promise<void> | null = null
let detected = false
const subscribers = new Set<() => void>()

/** Pings each known id in turn, once per page load; the first to answer is the extension. */
function detect(): Promise<void> {
  detection ??= (async () => {
    if (pageRuntime()) {
      for (const id of extensionIds()) {
        const hello = await call(id, { source: APP_SOURCE, protocol: BRIDGE_PROTOCOL, type: 'ping' }, PING_TIMEOUT_MS)
        if (!isExtensionHello(hello)) continue
        extension = { id, version: hello.version, stepTypes: helloStepTypes(hello) }
        countExtensionDetected(hello.version)
        break
      }
    }
    detected = true
    subscribers.forEach(notify => notify())
  })()
  return detection
}

/** `useSyncExternalStore`-shaped: `notify` runs once detection settles. */
export function subscribeExtension(notify: () => void): () => void {
  subscribers.add(notify)
  void detect()
  return () => { subscribers.delete(notify) }
}

export const getExtension = (): ExtensionInfo | null => extension

export const getExtensionStatus = (): ExtensionStatus =>
  extension ?? (detected || !pageRuntime() ? 'absent' : 'checking')

/** The installed extension, or null until (unless) it answers. */
export function useExtension(): ExtensionInfo | null {
  return useSyncExternalStore(subscribeExtension, getExtension, () => null)
}

/** Like `useExtension`, but tells "not installed" apart from "still asking". */
export function useExtensionStatus(): ExtensionStatus {
  return useSyncExternalStore(subscribeExtension, getExtensionStatus, () => 'checking')
}

/** Sends `request` to the extension found by `detect`. Never rejects: no extension or no answer is an error result. */
export async function sendToExtension(request: AppRequest, timeoutMs: number = REQUEST_TIMEOUT_MS): Promise<BridgeResult> {
  await detect()
  if (!extension) return { ok: false, error: 'The String Utility Belt extension is not installed in this browser.' }
  const answer = await call(extension.id, { source: APP_SOURCE, protocol: BRIDGE_PROTOCOL, type: 'request', request }, timeoutMs)
  if (isBridgeResult(answer)) return answer
  return { ok: false, error: 'The extension did not answer. Reload the page and try again.' }
}

export function __resetExtensionBridgeForTests(): void {
  extension = null
  detection = null
  detected = false
  subscribers.clear()
}
