/**
 * The host side of the protocol, against jsdom. jsdom cannot run the real thing —
 * it ignores `srcdoc` (the frame stays about:blank), implements no sandboxing, CSP
 * or Workers — so each test plays the frame: it reads the token the host baked into
 * the frame's `srcdoc`, then answers from the frame's window by dispatching
 * MessageEvents on the app window. The host is supposed to post NOTHING back to the
 * frame, which a spy on the frame's postMessage asserts.
 */
import vm from 'node:vm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createBrowserSandbox, installBrowserSandbox } from './browserSandbox'
import { JOB_ELEMENT_ID, MSG, SANDBOX_BOOTSTRAP_SCRIPT, SANDBOX_CSP } from './frame'
import { getSandbox, setSandbox, type SandboxRequest } from '@/core/sandbox'
import util from '@/utilities/custom_js'

const frames = () => document.querySelectorAll('iframe')

/** Read the job the host baked into a frame's srcdoc. */
function jobOf(frame: HTMLIFrameElement) {
  const doc = new DOMParser().parseFromString(frame.srcdoc, 'text/html')
  return JSON.parse(doc.getElementById(JOB_ELEMENT_ID)!.textContent!)
}

function start(req: Partial<SandboxRequest> = {}, { graceMs = 500, startupMs = 5000 } = {}) {
  const sandbox = createBrowserSandbox({ graceMs, startupMs })
  const promise = sandbox.run({ code: 'return input', input: 'hi', timeoutMs: 1000, ...req })
  promise.catch(() => { /* asserted by the test */ })
  const all = frames()
  const frame = all[all.length - 1]
  const win = frame.contentWindow!
  const post = vi.spyOn(win, 'postMessage').mockImplementation(() => {})
  const job = () => jobOf(frame)
  const token = () => job().token
  const fromFrame = (data: unknown, source: MessageEventSource | null = win) =>
    window.dispatchEvent(new MessageEvent('message', { data, source, origin: 'null' }))
  const ready = () => fromFrame({ [MSG]: 'ready', token: token() })
  const running = () => fromFrame({ [MSG]: 'running', token: token() })
  const answer = (body: Record<string, unknown>) => fromFrame({ [MSG]: 'result', token: token(), ...body })
  return { promise, frame, win, post, job, token, fromFrame, ready, running, answer }
}

beforeEach(() => { document.body.innerHTML = '' })
afterEach(() => { vi.useRealTimers(); setSandbox(null) })

describe('the frame the host creates', () => {
  it('is sandboxed with allow-scripts only — never allow-same-origin', () => {
    const { frame } = start()
    expect(frame.getAttribute('sandbox')).toBe('allow-scripts')
    // (jsdom has no `frame.sandbox` token list, so read the attribute's tokens)
    expect(frame.getAttribute('sandbox')!.split(/\s+/)).toEqual(['allow-scripts'])
  })

  it('carries the CSP as the first element of its srcdoc', () => {
    const { frame } = start()
    expect(frame.srcdoc.startsWith(`<meta http-equiv="Content-Security-Policy" content="${SANDBOX_CSP}">`)).toBe(true)
    expect(SANDBOX_CSP).toBe("default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' blob:; worker-src blob:")
    expect(frame.hasAttribute('src')).toBe(false)
  })

  it('is hidden from people and assistive tech', () => {
    const { frame } = start()
    expect(frame.getAttribute('aria-hidden')).toBe('true')
    expect(frame.tabIndex).toBe(-1)
    expect(frame.style.width).toBe('0px')
    expect(frame.style.height).toBe('0px')
    expect(frame.getAttribute('referrerpolicy')).toBe('no-referrer')
  })

  it('is a fresh frame per run', () => {
    const a = start()
    const b = start()
    expect(a.frame).not.toBe(b.frame)
    expect(frames()).toHaveLength(2)
  })
})

describe('the host protocol', () => {
  it('bakes the run into the frame with a random 128-bit token, and posts nothing to the frame', async () => {
    const { job, post, running, answer, promise } = start({ code: 'return 1', input: { a: [1] }, timeoutMs: 1500 })
    expect(job()).toEqual({
      token: expect.stringMatching(/^[0-9a-f]{32}$/),
      code: 'return 1',
      input: { k: 'j', v: '{"a":[1]}' },
      timeoutMs: 1500,
      probe: `${window.location.origin}/robots.txt`,
    })
    running()
    answer({ ok: true, value: 'done' })
    await expect(promise).resolves.toBe('done')
    // the code and input never leave the app as a message — only the srcdoc carries them
    expect(post).not.toHaveBeenCalled()
  })

  it('encodes a string input as a string and bytes as base64', () => {
    expect(start({ input: 'plain' }).job().input).toEqual({ k: 's', v: 'plain' })
    expect(start({ input: new Uint8Array([1, 2, 3]) }).job().input).toEqual({ k: 'b', v: btoa('\x01\x02\x03') })
  })

  it('uses a different token for every run', () => {
    expect(start().token()).not.toBe(start().token())
  })

  it('resolves with the value and removes the frame', async () => {
    const { running, answer, promise, frame } = start()
    running()
    answer({ ok: true, value: 'HI' })
    await expect(promise).resolves.toBe('HI')
    expect(frame.isConnected).toBe(false)
    expect(frames()).toHaveLength(0)
  })

  it('rejects with the error text from the frame, capped in length, and removes the frame', async () => {
    const { running, answer, promise } = start()
    running()
    answer({ ok: false, error: 'ReferenceError: x is not defined' + 'x'.repeat(5000) })
    const err = await promise.then(() => null, e => e as Error)
    expect(err!.message.startsWith('ReferenceError: x is not defined')).toBe(true)
    expect(err!.message.length).toBe(2000)
    expect(frames()).toHaveLength(0)
  })

  it("points the Worker's request probe at a file on this page's own site", () => {
    // a request the site's CSP allows, so only the frame's policy can block it (see ./frame)
    const probe = new URL(start().job().probe)
    expect(probe.origin).toBe(window.location.origin)
    expect(probe.pathname).toBe('/robots.txt')
    expect(probe.search + probe.hash).toBe('')
  })

  it('bakes in an empty probe, which the Worker refuses, when the page has no usable location', () => {
    const win = { location: { href: 'about:blank' }, addEventListener: vi.fn(), removeEventListener: vi.fn() }
    createBrowserSandbox({ win: win as unknown as Window }).run({ code: 'return input', input: 'hi', timeoutMs: 1000 }).catch(() => {})
    expect(jobOf(frames()[0]).probe).toBe('')
  })

  it('clamps the time budget it bakes into the frame', () => {
    expect(start({ timeoutMs: 5 }).job().timeoutMs).toBe(100)
    expect(start({ timeoutMs: 1e9 }).job().timeoutMs).toBe(30000)
  })

  it('accepts a result that arrives without a prior running message', async () => {
    const { answer, promise } = start()
    answer({ ok: true, value: 'early' })
    await expect(promise).resolves.toBe('early')
  })
})

describe('spoofing', () => {
  it('ignores messages from any window but its frame — even with the right token', async () => {
    const { token, fromFrame, answer, promise } = start()
    const t = token()
    fromFrame({ [MSG]: 'result', token: t, ok: true, value: 'forged' }, window)
    fromFrame({ [MSG]: 'result', token: t, ok: true, value: 'forged' }, null)
    const other = document.createElement('iframe')
    document.body.appendChild(other)
    fromFrame({ [MSG]: 'result', token: t, ok: true, value: 'forged' }, other.contentWindow)
    answer({ ok: true, value: 'real' })
    await expect(promise).resolves.toBe('real')
  })

  it('ignores replies from its own frame that lack the right token', async () => {
    const { fromFrame, answer, promise } = start()
    fromFrame({ [MSG]: 'result', ok: true, value: 'no token' })
    fromFrame({ [MSG]: 'result', token: 'f'.repeat(32), ok: true, value: 'wrong token' })
    fromFrame({ [MSG]: 'result', token: 42, ok: true, value: 'odd token' })
    fromFrame('not an object')
    fromFrame(null)
    answer({ ok: true, value: 'right token' })
    await expect(promise).resolves.toBe('right token')
  })

  it('does not accept one run\'s reply in another run', async () => {
    const a = start()
    const b = start()
    // b's frame replays a's token: wrong frame for a, wrong token for b
    b.fromFrame({ [MSG]: 'result', token: a.token(), ok: true, value: 'crossed' })
    a.answer({ ok: true, value: 'A' })
    b.answer({ ok: true, value: 'B' })
    await expect(a.promise).resolves.toBe('A')
    await expect(b.promise).resolves.toBe('B')
  })

  it('stops listening once settled', async () => {
    const remove = vi.spyOn(window, 'removeEventListener')
    const { answer, promise } = start()
    answer({ ok: true, value: 'first' })
    await expect(promise).resolves.toBe('first')
    expect(remove).toHaveBeenCalledWith('message', expect.any(Function))
    remove.mockRestore()
  })
})

describe('time limits', () => {
  it('tears the frame down itself when the running code never answers', async () => {
    vi.useFakeTimers()
    const { running, promise } = start({ timeoutMs: 200 }, { graceMs: 1000 })
    running()
    vi.advanceTimersByTime(1199)
    expect(frames()).toHaveLength(1)
    vi.advanceTimersByTime(1)
    await expect(promise).rejects.toThrow('timed out after 200 ms')
    expect(frames()).toHaveLength(0)
  })

  it('budgets frame start-up and Worker start-up separately, and neither is charged to the code', async () => {
    vi.useFakeTimers()
    const { ready, running, answer, promise } = start({ timeoutMs: 100 }, { graceMs: 100, startupMs: 5000 })
    // a slow frame parse (up to the whole startup budget) then a slow Worker start
    vi.advanceTimersByTime(4000)
    ready()
    vi.advanceTimersByTime(4000)
    running()
    vi.advanceTimersByTime(150)
    answer({ ok: true, value: 'made it' })
    await expect(promise).resolves.toBe('made it')
  })

  it('says so when the frame never parses', async () => {
    vi.useFakeTimers()
    const { promise } = start({ timeoutMs: 100 }, { startupMs: 3000 })
    vi.advanceTimersByTime(2999)
    expect(frames()).toHaveLength(1)
    vi.advanceTimersByTime(1)
    await expect(promise).rejects.toThrow(/sandbox did not start/)
    expect(frames()).toHaveLength(0)
  })

  it('says so when the Worker never comes up after the frame is ready', async () => {
    vi.useFakeTimers()
    const { ready, promise } = start({ timeoutMs: 100 }, { startupMs: 3000 })
    ready()
    vi.advanceTimersByTime(3000)
    await expect(promise).rejects.toThrow(/sandbox did not start/)
    expect(frames()).toHaveLength(0)
  })

  it('only starts the code budget on a genuine running message', async () => {
    vi.useFakeTimers()
    const { fromFrame, promise, token } = start({ timeoutMs: 100 }, { graceMs: 100, startupMs: 3000 })
    fromFrame({ [MSG]: 'running', token: 'f'.repeat(32) })
    fromFrame({ [MSG]: 'running', token: token() }, window)
    // had either counted, the run would fail at 200 ms with "timed out"
    vi.advanceTimersByTime(3000)
    await expect(promise).rejects.toThrow(/sandbox did not start/)
  })

  it("passes on the frame's own timeout report", async () => {
    const { running, answer, promise } = start({ timeoutMs: 100 })
    running()
    answer({ ok: false, error: 'timed out after 100 ms' })
    await expect(promise).rejects.toThrow('timed out after 100 ms')
    expect(frames()).toHaveLength(0)
  })

  it('accepts a failure reported before the Worker is up', async () => {
    const { answer, promise } = start()
    answer({ ok: false, error: 'this browser cannot start a sandboxed worker (SecurityError)' })
    await expect(promise).rejects.toThrow(/cannot start a sandboxed worker/)
  })
})

describe('cancellation', () => {
  it('rejects with an AbortError and removes the frame when aborted mid-run', async () => {
    const ac = new AbortController()
    const { running, promise, answer } = start({ signal: ac.signal })
    running()
    ac.abort()
    const err = await promise.then(() => null, e => e as Error)
    expect(err!.name).toBe('AbortError')
    expect(frames()).toHaveLength(0)
    // a result that arrives afterwards is ignored
    answer({ ok: true, value: 'late' })
  })

  it('does not even create a frame for an already-aborted signal', async () => {
    const ac = new AbortController()
    ac.abort()
    const sandbox = createBrowserSandbox()
    const err = await sandbox.run({ code: 'return 1', input: '', timeoutMs: 1000, signal: ac.signal }).catch(e => e)
    expect(err.name).toBe('AbortError')
    expect(frames()).toHaveLength(0)
  })

  it('unhooks from the signal once settled', async () => {
    const ac = new AbortController()
    const remove = vi.spyOn(ac.signal, 'removeEventListener')
    const { answer, promise } = start({ signal: ac.signal })
    answer({ ok: true, value: 'done' })
    await promise
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function))
  })
})

/**
 * Both halves together: the script the host actually baked into the srcdoc (parsed
 * out as a browser would) drives a stand-in Worker that runs the real WORKER_SOURCE as
 * a classic script in its own realm, and the frame's messages reach the real host.
 * Catches any drift between what the frame sends and what the host accepts.
 */
describe('end to end, host + bootstrap + worker source', () => {
  class VmWorker {
    static sources = new Map<string, string>()
    static last: VmWorker | undefined
    /** Whether a request from the Worker goes through: only when the frame's CSP did not reach it. */
    static requestsAllowed = false
    onmessage: ((e: { data: unknown }) => void) | null = null
    onerror: ((e: unknown) => void) | null = null
    onmessageerror: (() => void) | null = null
    terminated = false
    private ctx: any
    constructor(url: string) {
      VmWorker.last = this
      this.ctx = vm.createContext({
        postMessage: (m: unknown) => {
          const data = structuredClone(m)
          setTimeout(() => { if (!this.terminated) this.onmessage?.({ data }) })
        },
        URL,
        // the frame's CSP at work: a data: script and a request to the site are both refused
        importScripts: () => { throw new DOMException('Refused to load the script', 'NetworkError') },
        fetch: () => VmWorker.requestsAllowed ? Promise.resolve({ type: 'opaque' }) : Promise.reject(new TypeError('Failed to fetch')),
      })
      vm.runInContext('var self = globalThis;', this.ctx)
      vm.runInContext(VmWorker.sources.get(url)!, this.ctx)
    }
    postMessage(m: unknown) {
      const data = structuredClone(m)
      setTimeout(() => { if (!this.terminated) this.ctx.onmessage?.({ data }) })
    }
    terminate() { this.terminated = true }
  }

  /** Start a run and boot its frame the way a browser would parse and run the srcdoc. */
  function boot(req: Partial<SandboxRequest>) {
    const promise = createBrowserSandbox().run({ code: 'return input', input: '', timeoutMs: 1000, ...req })
    const frame = frames()[frames().length - 1]
    const parsed = new DOMParser().parseFromString(frame.srcdoc, 'text/html')
    const scripts = parsed.querySelectorAll('script:not([type])')
    expect(scripts).toHaveLength(1)
    expect(scripts[0].textContent).toBe(SANDBOX_BOOTSTRAP_SCRIPT)
    let n = 0
    const URLStub = {
      createObjectURL: (b: { src: string }) => { const u = `blob:null/${++n}`; VmWorker.sources.set(u, b.src); return u },
      revokeObjectURL: vi.fn(),
    }
    class BlobStub { src: string; constructor(parts: string[]) { this.src = parts.join('') } }
    const parentStub = {
      postMessage: (data: unknown) => {
        const cloned = structuredClone(data)
        setTimeout(() => window.dispatchEvent(new MessageEvent('message', { data: cloned, source: frame.contentWindow, origin: 'null' })))
      },
    }
    new Function('document', 'parent', 'Worker', 'URL', 'Blob', scripts[0].textContent!)(parsed, parentStub, VmWorker, URLStub, BlobStub)
    return { promise, URLStub }
  }

  it('runs code on a string, JSON and bytes and cleans up', async () => {
    await expect(boot({ code: 'return input.toUpperCase()', input: 'abc' }).promise).resolves.toBe('ABC')
    await expect(boot({ code: 'return { n: input.items.length }', input: { items: [1, 2, 3] } }).promise)
      .resolves.toEqual({ n: 3 })
    const bytes = await boot({ code: 'return input.map(b => b * 2)', input: new Uint8Array([1, 2, 255]) }).promise
    expect(Array.from(bytes as Uint8Array)).toEqual([2, 4, 254])
    expect(frames()).toHaveLength(0)
    expect(VmWorker.last!.terminated).toBe(true)
  })

  it('carries HTML-looking code and input through the srcdoc intact', async () => {
    // an unclosed `<!--` followed by `<script` is what used to swallow the closing tag
    const html = '<p>hi</p></SCRIPT><!--<script>alert(1)</script> x'
    await expect(boot({ code: `return input + ${JSON.stringify(html)}`, input: html }).promise).resolves.toBe(html + html)
  })

  it('reports errors from the code', async () => {
    await expect(boot({ code: 'throw new RangeError("nope")' }).promise).rejects.toThrow('RangeError: nope')
  })

  it("refuses to run the code when the frame's CSP does not stop the Worker's request probe", async () => {
    VmWorker.requestsAllowed = true
    try {
      await expect(boot({ code: 'return "ran"' }).promise).rejects.toThrow(/does not block network access/)
      expect(frames()).toHaveLength(0)
    } finally {
      VmWorker.requestsAllowed = false
    }
  })

  it("times out a run that never settles, via the frame's own timer", async () => {
    const { promise, URLStub } = boot({ code: 'return new Promise(() => {})', timeoutMs: 100 })
    await expect(promise).rejects.toThrow('timed out after 100 ms')
    expect(VmWorker.last!.terminated).toBe(true)
    expect(URLStub.revokeObjectURL).toHaveBeenCalled()
    expect(frames()).toHaveLength(0)
  })
})

describe('installBrowserSandbox', () => {
  it('registers one sandbox, idempotently', () => {
    const a = installBrowserSandbox()
    expect(a).toBeDefined()
    expect(getSandbox()).toBe(a)
    expect(installBrowserSandbox()).toBe(a)
    setSandbox(null)
    expect(installBrowserSandbox()).toBe(a)
    expect(getSandbox()).toBe(a)
  })

  it('makes the custom_js utility run through the frame protocol', async () => {
    installBrowserSandbox()
    const p = util.apply('abc', { code: 'return input.toUpperCase()', timeoutMs: 500 })
    const frame = frames()[0]
    const job = jobOf(frame)
    expect(job).toMatchObject({ code: 'return input.toUpperCase()', input: { k: 's', v: 'abc' }, timeoutMs: 500 })
    const send = (data: unknown) => window.dispatchEvent(new MessageEvent('message', { data, source: frame.contentWindow }))
    send({ [MSG]: 'result', token: job.token, ok: true, value: 'ABC' })
    await expect(p).resolves.toBe('ABC')
    expect(frames()).toHaveLength(0)
  })

  it('still validates what comes back through the frame', async () => {
    installBrowserSandbox()
    const p = util.apply('abc', { code: 'return 1' })
    const frame = frames()[0]
    const job = jobOf(frame)
    const send = (data: unknown) => window.dispatchEvent(new MessageEvent('message', { data, source: frame.contentWindow }))
    send({ [MSG]: 'result', token: job.token, ok: true, value: 1 })
    await expect(p).rejects.toThrow(/returned a number/)
  })
})
