/**
 * The frame's bootstrap and the Worker source are plain strings, so these tests run
 * them against hand-made stand-ins for `parent`, `Worker`, `Blob` and `URL`: jsdom
 * implements neither srcdoc documents nor Workers, and has no sandboxing or CSP.
 */
import vm from 'node:vm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  BOOTSTRAP_SOURCE, JOB_ELEMENT_ID, MSG, SANDBOX_BOOTSTRAP_SCRIPT, SANDBOX_CSP, SANDBOX_FLAGS, WORKER_SOURCE,
  buildSrcdoc, encodeInput, type SandboxJob,
} from './frame'

const PROBE = 'https://app.example/robots.txt'

const job = (over: Partial<SandboxJob> = {}): SandboxJob =>
  ({ token: 'tok123', code: 'return input', input: { k: 's', v: 'hi' }, timeoutMs: 100, probe: PROBE, ...over })

/** The srcdoc's scripts as a browser parses them: [job data block, bootstrap]. */
function parts(html: string) {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const scripts = [...doc.querySelectorAll('script')]
  return { doc, scripts, data: scripts.find(s => s.type === 'application/json'), code: scripts.filter(s => !s.type) }
}

describe('frame document', () => {
  it('uses exactly the sandbox flag that keeps the origin opaque', () => {
    expect(SANDBOX_FLAGS).toBe('allow-scripts')
    expect(SANDBOX_FLAGS).not.toMatch(/same-origin/)
  })

  it('locks the frame down with a CSP that allows no network at all', () => {
    expect(SANDBOX_CSP).toBe("default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' blob:; worker-src blob:")
  })

  it('puts the CSP meta first, then the job data block, then the one bootstrap script', () => {
    const html = buildSrcdoc(job())
    expect(html.startsWith(`<meta http-equiv="Content-Security-Policy" content="${SANDBOX_CSP}">`)).toBe(true)
    const { doc, scripts, data, code } = parts(html)
    const first = doc.head.firstElementChild!
    expect(first.tagName).toBe('META')
    expect(first.getAttribute('http-equiv')).toBe('Content-Security-Policy')
    expect(first.getAttribute('content')).toBe(SANDBOX_CSP)
    expect(scripts).toHaveLength(2)
    expect(scripts[0]).toBe(data)
    expect(data!.id).toBe(JOB_ELEMENT_ID)
    expect(code).toEqual([scripts[1]])
    expect(html.match(/<\/script/gi)).toHaveLength(2)
  })

  it('bakes the job into the document so it is never posted anywhere', () => {
    const html = buildSrcdoc(job({ token: 'abc', code: 'return input', input: { k: 's', v: 'secret' } }))
    const embedded = JSON.parse(parts(html).data!.textContent!)
    expect(embedded).toEqual({ token: 'abc', code: 'return input', input: { k: 's', v: 'secret' }, timeoutMs: 100, probe: PROBE })
  })

  it('runs the same bootstrap on every run, so the site CSP can allow it by hash', () => {
    const a = parts(buildSrcdoc(job({ token: 'f00d', code: 'return 1', input: { k: 's', v: 'x' } })))
    const b = parts(buildSrcdoc(job({ token: 'beef', code: 'return "</script>"', input: { k: 'j', v: '[1]' } })))
    expect(a.code[0].textContent).toBe(SANDBOX_BOOTSTRAP_SCRIPT)
    expect(b.code[0].textContent).toBe(SANDBOX_BOOTSTRAP_SCRIPT)
    expect(SANDBOX_BOOTSTRAP_SCRIPT).not.toMatch(/f00d|beef/)
  })

  it('escapes a payload that tries to close the script element early', () => {
    const html = buildSrcdoc(job({ code: 'return "</script><script>alert(1)</script>"' }))
    // still exactly the two real <script>s: the payload's tags are neutralised
    expect(html.match(/<\/script/gi)).toHaveLength(2)
    expect(parts(html).scripts).toHaveLength(2)
  })

  it('keeps both scripts intact whatever HTML-like text the code or input carries', () => {
    // `<!--` then `<script` puts the HTML tokenizer in its "double escaped" state, where the
    // closing `</script>` no longer ends the element: the bootstrap would never run.
    const payloads = ['<!--<script>', '<!-- <script>x</script> -->', '<!--<SCRIPT >', '<script>', '-->', '<!--']
    for (const payload of payloads) {
      const html = buildSrcdoc(job({ code: `return ${JSON.stringify(payload)}`, input: { k: 's', v: payload } }))
      const { scripts, data, code } = parts(html)
      expect(scripts, payload).toHaveLength(2)
      // the bootstrap is untouched and still compiles, and the job round-trips exactly
      expect(code[0].textContent, payload).toBe(SANDBOX_BOOTSTRAP_SCRIPT)
      expect(() => new Function(code[0].textContent!), payload).not.toThrow()
      const embedded = JSON.parse(data!.textContent!)
      expect(embedded.input.v).toBe(payload)
      expect(embedded.code).toBe(`return ${JSON.stringify(payload)}`)
    }
  })

  it('requests nothing but its two CSP probes, and names no URL but the job\'s probe', () => {
    const html = buildSrcdoc(job())
    expect(html).not.toMatch(/\bsrc=|XMLHttpRequest|WebSocket|EventSource|sendBeacon|\bimport\(/)
    expect(html.match(/importScripts\([^)]*\)/g)).toEqual(["importScripts('data:text/javascript,')"])
    expect(html.match(/fetch\([^,]*/g)).toEqual(['fetch(url.href'])
    expect(html.match(/[a-z][a-z0-9+.-]*:\/\/[^"'\s]*/gi)).toEqual([PROBE])
  })
})

describe('encodeInput', () => {
  it('tags a string', () => {
    expect(encodeInput('héllo 日本')).toEqual({ k: 's', v: 'héllo 日本' })
  })

  it('base64-encodes bytes, including a large array', () => {
    expect(encodeInput(new Uint8Array([0, 1, 255]))).toEqual({ k: 'b', v: btoa('\x00\x01\xff') })
    const big = new Uint8Array(200_000).fill(65)
    expect(atob(encodeInput(big).v)).toHaveLength(200_000)
  })

  it('JSON-stringifies objects and arrays', () => {
    expect(encodeInput({ a: [1, 'two'] })).toEqual({ k: 'j', v: '{"a":[1,"two"]}' })
    expect(encodeInput([1, 2])).toEqual({ k: 'j', v: '[1,2]' })
  })
})

// ---------------------------------------------------------------------------
// bootstrap (runs inside the frame)
// ---------------------------------------------------------------------------

class FakeWorker {
  static instances: FakeWorker[] = []
  static failNext: Error | null = null
  url: string
  sent: any[] = []
  terminated = false
  onmessage: ((e: { data: unknown }) => void) | null = null
  onerror: ((e: { message?: string; preventDefault?: () => void }) => void) | null = null
  onmessageerror: (() => void) | null = null
  constructor(url: string) {
    if (FakeWorker.failNext) { const e = FakeWorker.failNext; FakeWorker.failNext = null; throw e }
    this.url = url
    FakeWorker.instances.push(this)
  }
  postMessage(m: unknown) { this.sent.push(m) }
  terminate() { this.terminated = true }
}

/** Runs BOOTSTRAP_SOURCE with a job baked in, against fake host globals. */
function bootFrame(over: Partial<SandboxJob> = {}) {
  const parent = { postMessage: vi.fn() }
  const blobs: Array<{ parts: string[]; type: string }> = []
  const URLStub = {
    createObjectURL: vi.fn((b: { parts: string[]; type: string }) => { blobs.push(b); return 'blob:null/1' }),
    revokeObjectURL: vi.fn(),
  }
  class BlobStub { constructor(public parts: string[], public opts: { type: string }) {} get type() { return this.opts.type } }
  const documentStub = {
    getElementById: (id: string) => (id === JOB_ELEMENT_ID ? { textContent: JSON.stringify(job(over)) } : null),
  }
  new Function('document', 'parent', 'URL', 'Blob', 'Worker', 'setTimeout', 'clearTimeout', 'atob', BOOTSTRAP_SOURCE)(
    documentStub, parent, URLStub, BlobStub, FakeWorker, setTimeout, clearTimeout, atob,
  )
  /** The Worker's start-up ping: the moment user code begins to run. */
  const alive = (w = FakeWorker.instances[0]) => w.onmessage!({ data: { alive: true } })
  const replies = () => parent.postMessage.mock.calls.filter(c => c[0][MSG] === 'result')
  const runnings = () => parent.postMessage.mock.calls.filter(c => c[0][MSG] === 'running')
  const readies = () => parent.postMessage.mock.calls.filter(c => c[0][MSG] === 'ready')
  return { parent, alive, replies, runnings, readies, URLStub, blobs }
}

describe('frame bootstrap', () => {
  beforeEach(() => { FakeWorker.instances = []; FakeWorker.failNext = null; vi.useFakeTimers() })
  afterEach(() => vi.useRealTimers())

  it('stays silent, starting nothing, when the job cannot be read', () => {
    const parent = { postMessage: vi.fn() }
    for (const el of [null, { textContent: 'not json' }]) {
      new Function('document', 'parent', 'Worker', BOOTSTRAP_SOURCE)({ getElementById: () => el }, parent, FakeWorker)
    }
    expect(parent.postMessage).not.toHaveBeenCalled()
    expect(FakeWorker.instances).toHaveLength(0)
  })

  it('starts the Worker from a Blob of the worker source and hands it decoded code, input and probe — never the token', () => {
    const { blobs } = bootFrame({ input: { k: 'j', v: '{"a":1}' } })
    expect(blobs).toHaveLength(1)
    expect((blobs[0] as any).parts).toEqual([WORKER_SOURCE])
    expect(blobs[0].type).toBe('text/javascript')
    const w = FakeWorker.instances[0]
    expect(w.url).toBe('blob:null/1')
    expect(w.sent).toEqual([{ code: 'return input', input: { a: 1 }, probe: PROBE }])
    expect(JSON.stringify(w.sent)).not.toContain('tok123')
  })

  it('decodes bytes input to a Uint8Array before handing it to the Worker', () => {
    bootFrame({ input: encodeInput(new Uint8Array([9, 8, 7])) })
    const sent = FakeWorker.instances[0].sent[0] as { input: Uint8Array }
    expect(sent.input).toBeInstanceOf(Uint8Array)
    expect(Array.from(sent.input)).toEqual([9, 8, 7])
  })

  it('reports input that cannot be decoded, and never starts a Worker', () => {
    const { replies } = bootFrame({ input: { k: 'j', v: '{not json' } })
    expect(FakeWorker.instances).toHaveLength(0)
    expect(replies()[0][0]).toMatchObject({ ok: false, token: 'tok123', error: expect.stringMatching(/input could not be read/) })
  })

  it('announces itself with the token before anything else it sends the parent', () => {
    const { parent, readies } = bootFrame()
    expect(readies()).toEqual([[{ [MSG]: 'ready', token: 'tok123' }, '*']])
    // it is the very first thing posted to the parent, before running/result
    expect(parent.postMessage.mock.calls[0][0]).toEqual({ [MSG]: 'ready', token: 'tok123' })
  })

  it('tells the parent when the Worker is up, with the token', () => {
    const { alive, runnings } = bootFrame()
    expect(runnings()).toHaveLength(0)
    alive()
    expect(runnings()[0]).toEqual([{ [MSG]: 'running', token: 'tok123' }, '*'])
  })

  it('relays the result with the token, then kills the Worker', () => {
    const { alive, replies, URLStub } = bootFrame()
    const w = FakeWorker.instances[0]
    alive()
    w.onmessage!({ data: { ok: true, value: 'HI' } })
    expect(replies()).toEqual([[{ [MSG]: 'result', token: 'tok123', ok: true, value: 'HI' }, '*']])
    expect(w.terminated).toBe(true)
    expect(URLStub.revokeObjectURL).toHaveBeenCalledWith('blob:null/1')
  })

  it('relays errors as text', () => {
    const { alive, replies } = bootFrame()
    alive()
    FakeWorker.instances[0].onmessage!({ data: { ok: false, error: 'TypeError: x is not a function' } })
    expect(replies()[0][0]).toEqual({ [MSG]: 'result', token: 'tok123', ok: false, error: 'TypeError: x is not a function' })
  })

  it('treats anything but {ok: true} from the Worker as a failure', () => {
    const { alive, replies } = bootFrame()
    alive()
    FakeWorker.instances[0].onmessage!({ data: 'HI' })
    expect(replies()[0][0].ok).toBe(false)
  })

  it('terminates a Worker that overruns its budget, counted from when it is up', () => {
    const { alive, replies } = bootFrame({ timeoutMs: 250 })
    const w = FakeWorker.instances[0]
    // a slow thread start-up is not charged to the code
    vi.advanceTimersByTime(5000)
    expect(replies()).toHaveLength(0)
    alive()
    vi.advanceTimersByTime(249)
    expect(replies()).toHaveLength(0)
    vi.advanceTimersByTime(1)
    expect(w.terminated).toBe(true)
    expect(replies()[0][0]).toEqual({ [MSG]: 'result', token: 'tok123', ok: false, error: 'timed out after 250 ms' })
    // a late answer from the dead worker changes nothing
    w.onmessage!({ data: { ok: true, value: 'late' } })
    expect(replies()).toHaveLength(1)
  })

  it('reports a Worker that cannot be created', () => {
    FakeWorker.failNext = new Error('SecurityError')
    const { replies } = bootFrame()
    expect(replies()[0][0]).toMatchObject({ ok: false, error: expect.stringMatching(/cannot start a sandboxed worker \(SecurityError\)/) })
  })

  it('reports a Worker that crashes', () => {
    const { alive, replies } = bootFrame()
    alive()
    const preventDefault = vi.fn()
    FakeWorker.instances[0].onerror!({ message: 'Uncaught InternalError: too much recursion', preventDefault })
    expect(preventDefault).toHaveBeenCalled()
    expect(replies()[0][0]).toMatchObject({ ok: false, error: 'Uncaught InternalError: too much recursion' })
  })

  it('falls back to an error reply when the result cannot be posted', () => {
    const { alive, parent, replies } = bootFrame()
    alive()
    parent.postMessage.mockImplementationOnce(() => { throw new Error('could not be cloned') })
    FakeWorker.instances[0].onmessage!({ data: { ok: true, value: 'x' } })
    const all = replies()
    expect(all[all.length - 1][0]).toMatchObject({ ok: false, token: 'tok123', error: expect.stringMatching(/could not be cloned/) })
  })
})

// ---------------------------------------------------------------------------
// worker (runs the user code)
// ---------------------------------------------------------------------------

/**
 * The Worker's two probes failing the way the frame's CSP makes them fail: the data:
 * script throws, and the request rejects before anything is sent.
 */
function cspBlocks() {
  return {
    importScripts: vi.fn(() => {
      throw new DOMException("Refused to load the script because it violates the document's Content Security Policy", 'NetworkError')
    }),
    fetch: vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))),
  }
}

const PROBE_INIT = { method: 'HEAD', mode: 'no-cors', credentials: 'omit' }

const REFUSED = { ok: false, error: expect.stringMatching(/does not block network access/) }

/** Run WORKER_SOURCE against a fake `self` whose postMessage structured-clones like the real one. */
async function runWorker(code: string, input: unknown = 'hi') {
  const sent: any[] = []
  const self: any = { postMessage: (m: unknown) => { sent.push(structuredClone(m)) } }
  const { importScripts, fetch } = cspBlocks()
  new Function('self', 'importScripts', 'fetch', WORKER_SOURCE)(self, importScripts, fetch)
  self.onmessage({ data: { code, input, probe: PROBE } })
  await vi.waitFor(() => expect(sent.length).toBeGreaterThan(1))
  expect(sent[0]).toEqual({ alive: true })
  return { reply: sent[1], sent, self }
}

/**
 * Run WORKER_SOURCE as a real Worker does, as a classic script in its own realm whose
 * global object plays `self`, with the frame's CSP blocking both probes unless
 * `globals` says otherwise. `send` hands it one request, as the frame does.
 */
function workerRealm(globals: Record<string, unknown> = {}) {
  const sent: any[] = []
  const env = { ...cspBlocks(), ...globals }
  const ctx: any = vm.createContext({ postMessage: (m: unknown) => sent.push(JSON.parse(JSON.stringify(m))), URL, ...env })
  vm.runInContext('var self = globalThis;', ctx)
  vm.runInContext(WORKER_SOURCE, ctx)
  const send = (code: string, extra: Record<string, unknown> = {}) =>
    ctx.onmessage({ data: { code, input: 'hi', probe: PROBE, ...extra } })
  return { ctx, sent, send, ...env }
}

describe('worker source', () => {
  it('announces itself before it has any code to run', () => {
    const sent: any[] = []
    new Function('self', WORKER_SOURCE)({ postMessage: (m: unknown) => sent.push(m) })
    expect(sent).toEqual([{ alive: true }])
  })

  it('runs a function body with `input` in scope', async () => {
    expect((await runWorker('return input.toUpperCase()')).reply).toEqual({ ok: true, value: 'HI' })
  })

  it('supports await and returned promises', async () => {
    expect((await runWorker('await null; return input + "!"')).reply).toEqual({ ok: true, value: 'hi!' })
    expect((await runWorker('return Promise.resolve(7).then(n => [n])')).reply).toEqual({ ok: true, value: [7] })
  })

  it('passes bytes and JSON in and out', async () => {
    const bytes = await runWorker('return input.map(b => b + 1)', new Uint8Array([1, 2]))
    // structuredClone hands back a Node-realm Uint8Array, so compare contents
    expect(ArrayBuffer.isView(bytes.reply.value)).toBe(true)
    expect(Array.from(bytes.reply.value)).toEqual([2, 3])
    expect((await runWorker('return { n: input.items.length }', { items: [1, 2, 3] })).reply.value).toEqual({ n: 3 })
  })

  it('runs in strict mode with no access to the harness closure', async () => {
    expect((await runWorker('return String(this)')).reply.value).toBe('undefined')
    expect((await runWorker('return typeof d + typeof e + typeof post')).reply.value).toBe('undefinedundefinedundefined')
    expect((await runWorker('undeclared = 1; return "no"')).reply).toMatchObject({ ok: false, error: expect.stringMatching(/^ReferenceError/) })
  })

  it('reports thrown errors and syntax errors with their names', async () => {
    expect((await runWorker('throw new TypeError("bad")')).reply).toEqual({ ok: false, error: 'TypeError: bad' })
    expect((await runWorker('throw "plain"')).reply).toEqual({ ok: false, error: 'plain' })
    expect((await runWorker('return (')).reply).toMatchObject({ ok: false, error: expect.stringMatching(/^SyntaxError/) })
    expect((await runWorker('throw { get message() { throw 1 } }')).reply)
      .toEqual({ ok: false, error: 'the code threw a value that cannot be printed' })
  })

  it('reports a result that cannot cross structured clone', async () => {
    const { reply } = await runWorker('return { f() {} }')
    expect(reply).toMatchObject({ ok: false, error: expect.stringMatching(/cannot be passed back/) })
  })

  it('still answers when the code replaces postMessage', async () => {
    // user code compiles in global scope, where the real Worker's `self` lives; here
    // the fake is exposed under another name so the test cannot clobber jsdom's window
    const g = globalThis as any
    const sent: any[] = []
    const fakeSelf: any = { postMessage: (m: unknown) => sent.push(m) }
    g.__workerSelf = fakeSelf
    try {
      const { importScripts, fetch } = cspBlocks()
      new Function('self', 'importScripts', 'fetch', WORKER_SOURCE)(fakeSelf, importScripts, fetch)
      fakeSelf.onmessage({ data: { code: '__workerSelf.postMessage = () => {}; return "ok"', input: '', probe: PROBE } })
      await vi.waitFor(() => expect(sent).toEqual([{ alive: true }, { ok: true, value: 'ok' }]))
    } finally {
      delete g.__workerSelf
    }
  })

  it('keeps its helpers out of the global scope the code runs in, as a real classic Worker script', async () => {
    // A Worker runs WORKER_SOURCE as a classic script, where a top-level `var` becomes a
    // global the user code can read and reassign. `new Function` (above) hides that, so
    // run it as a script in its own realm whose global object plays `self`.
    const { sent, send } = workerRealm()
    expect(sent).toEqual([{ alive: true }])
    send('return [typeof post, typeof describe, typeof AsyncFunction, typeof run, typeof REFUSED].join()')
    await vi.waitFor(() => expect(sent).toHaveLength(2))
    expect(sent[1]).toEqual({ ok: true, value: 'undefined,undefined,undefined,undefined,undefined' })
  })

  it('runs code only once the CSP has blocked both probes', async () => {
    const { sent, send, importScripts, fetch } = workerRealm()
    send('return "ran"')
    await vi.waitFor(() => expect(sent).toEqual([{ alive: true }, { ok: true, value: 'ran' }]))
    expect(importScripts).toHaveBeenCalledExactlyOnceWith('data:text/javascript,')
    expect(fetch).toHaveBeenCalledExactlyOnceWith(PROBE, PROBE_INIT)
  })

  it("refuses to run code where no CSP reaches the Worker, and requests nothing (fails closed)", async () => {
    // a data: script is outside every script-src here: if it loads, no policy binds the Worker
    const loaded: string[] = []
    const { ctx, sent, send, fetch } = workerRealm({ importScripts: (url: string) => { loaded.push(url) } })
    send('globalThis.ran = true; return "should not run"')
    await vi.waitFor(() => expect(sent).toHaveLength(2))
    expect(sent[1]).toEqual(REFUSED)
    expect(ctx.ran).toBeUndefined()
    expect(loaded).toEqual(['data:text/javascript,'])
    expect(fetch).not.toHaveBeenCalled()
  })

  it("refuses to run code where the Worker inherited the site's CSP but not the frame's", async () => {
    // the site's policy refuses a data: script too, but allows a request to the site itself
    const fetch = vi.fn(() => Promise.resolve({ type: 'opaque', status: 0 }))
    const { ctx, sent, send } = workerRealm({ fetch })
    send('globalThis.ran = true; return "should not run"')
    await vi.waitFor(() => expect(sent).toHaveLength(2))
    expect(sent[1]).toEqual(REFUSED)
    expect(ctx.ran).toBeUndefined()
    expect(fetch).toHaveBeenCalledExactlyOnceWith(PROBE, PROBE_INIT)
  })

  it('compiles nothing until the request probe has failed', async () => {
    let fail!: (e: Error) => void
    const fetch = vi.fn(() => new Promise((_resolve, reject) => { fail = reject }))
    const { ctx, sent, send } = workerRealm({ fetch })
    send('globalThis.ran = true; return "ran"')
    await new Promise(r => setTimeout(r, 20))
    expect(ctx.ran).toBeUndefined()
    expect(sent).toEqual([{ alive: true }])
    fail(new TypeError('Failed to fetch'))
    await vi.waitFor(() => expect(sent).toEqual([{ alive: true }, { ok: true, value: 'ran' }]))
  })

  it('refuses to run code without an http(s) probe URL, and requests nothing', async () => {
    for (const probe of [undefined, '', 'robots.txt', 'not a url', 'data:text/plain,x', 'blob:null/1', 'javascript:void 0', 'ftp://app.example/']) {
      const { ctx, sent, send, fetch } = workerRealm()
      send('globalThis.ran = true; return "should not run"', { probe })
      await vi.waitFor(() => expect(sent, String(probe)).toHaveLength(2))
      expect(sent[1], String(probe)).toEqual(REFUSED)
      expect(ctx.ran, String(probe)).toBeUndefined()
      expect(fetch, String(probe)).not.toHaveBeenCalled()
    }
  })

  it('refuses to run code where it cannot make the request probe', async () => {
    for (const globals of [{ fetch: undefined }, { fetch: () => { throw new TypeError('blocked') } }, { URL: undefined }]) {
      const { ctx, sent, send } = workerRealm(globals)
      send('globalThis.ran = true; return "should not run"')
      await vi.waitFor(() => expect(sent).toHaveLength(2))
      expect(sent[1]).toEqual(REFUSED)
      expect(ctx.ran).toBeUndefined()
    }
  })

  it('still answers when the code clobbers what it can reach in a real Worker global', async () => {
    const { sent, send } = workerRealm()
    send('try { post = () => {} } catch (e) {} self.postMessage = () => {}; return "ok"')
    await vi.waitFor(() => expect(sent).toEqual([{ alive: true }, { ok: true, value: 'ok' }]))
  })

  it('handles only one request', async () => {
    const { self, sent } = await runWorker('return 1')
    expect(self.onmessage).toBeNull()
    expect(sent).toHaveLength(2)
  })
})
