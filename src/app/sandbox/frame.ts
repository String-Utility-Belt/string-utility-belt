/**
 * The documents that run custom code, as strings: the iframe's srcdoc (a CSP, the
 * per-run job as a JSON data block, and a bootstrap script) and the Worker source the
 * bootstrap starts from a Blob URL.
 *
 * Why each layer exists:
 * - `sandbox="allow-scripts"` WITHOUT `allow-same-origin` gives the frame an opaque
 *   origin: no cookies, localStorage, IndexedDB or DOM of the app, and no way to
 *   reach `parent`'s objects — only postMessage.
 * - The CSP (`default-src 'none'`) blocks fetch, XHR, WebSocket, EventSource,
 *   `import()` and `importScripts()` of any URL, so input cannot be exfiltrated. A
 *   Blob-URL Worker inherits the frame's CSP, so the same rules bind the user code. The
 *   Worker checks that before running anything: a request to the app's own site, which
 *   the site's CSP allows and only the frame's blocks, must fail, or the run is refused.
 * - The user code runs in a Worker, not in the frame's document: a busy loop never
 *   blocks the app's (possibly shared) main thread, it cannot navigate or touch any
 *   document, and the frame can still `terminate()` it when the time budget runs out.
 * - The frame is created per run and removed afterwards, so no state survives
 *   between runs.
 * - The site's own CSP (public/_headers) binds this frame too: a srcdoc document, and a
 *   Blob-URL Worker it starts, inherit the CSP of the page that created them on top of
 *   their own. That policy allows inline scripts only by hash, so the bootstrap is the
 *   same text on every run (`SANDBOX_BOOTSTRAP_SCRIPT`, whose hash the site's CSP lists)
 *   and the per-run job travels beside it in a non-executable JSON data block. It also
 *   has to allow 'unsafe-eval', which is how the Worker compiles the user's code.
 * - The job (code, input, token) is embedded IN the srcdoc, not posted to the frame.
 *   A message posted to an opaque-origin frame must target `'*'`, so anything sent
 *   that way is readable by whatever document currently occupies the frame — and a
 *   cross-origin page that frames the app is allowed to navigate this (descendant)
 *   frame to a document of its own. Baking the job into the original document keeps
 *   the viewer's input out of every postMessage: it lives only in the opaque-origin
 *   document the app created, which an attacker can neither read nor recover once it
 *   has navigated the frame away. The parent only ever RECEIVES messages, tagged
 *   with the run's token, and never sends the code or input anywhere.
 */

import type { Value } from '@/types/utility'

export const SANDBOX_FLAGS = 'allow-scripts'

export const SANDBOX_CSP = "default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' blob:; worker-src blob:"

/** Marker on every message of this protocol. */
export const MSG = '__subelt'

/** The id of the srcdoc's JSON data block that carries the run's job. */
export const JOB_ELEMENT_ID = 'subelt-job'

/** A run's input, encoded so it survives being embedded in the srcdoc as JSON. */
export type EncodedInput =
  | { k: 's'; v: string }
  | { k: 'b'; v: string }
  | { k: 'j'; v: string }

/** The per-run job baked into the frame document. `token` authenticates the frame's replies. */
export interface SandboxJob {
  token: string
  code: string
  input: EncodedInput
  timeoutMs: number
  /**
   * An absolute URL on the app's own site, which the site's CSP allows a request to. The
   * Worker requests it before running any code and refuses the run if the request is
   * not blocked (see WORKER_SOURCE). It carries nothing of the job.
   */
  probe: string
}

/** Base64 of the bytes, in chunks so a large array never overflows the argument list. */
function bytesToBase64(bytes: Uint8Array): string {
  let bin = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(bin)
}

/**
 * Encode a pipeline value (string, bytes, or plain JSON) for embedding in the job.
 * The bootstrap's `decodeInput` is the inverse.
 */
export function encodeInput(input: Value): EncodedInput {
  if (typeof input === 'string') return { k: 's', v: input }
  if (input instanceof Uint8Array) return { k: 'b', v: bytesToBase64(input) }
  return { k: 'j', v: JSON.stringify(input ?? null) }
}

/**
 * Runs inside the Worker. Grabs `postMessage` before any user code can replace it, so
 * overwriting it cannot stop the reply (the code can still post a message of its own,
 * which gives it no more than returning a value), and announces itself (`{alive: true}`)
 * before any user code runs, so the time budget measures the code rather than thread
 * start-up. Compiles the body with the AsyncFunction constructor (so `await` and
 * returned promises work) and posts back `{ok, value}` or `{ok: false, error}`. Wrapped
 * in a function: top-level `var`s of a classic Worker script are globals, which the user
 * code could read and reassign.
 *
 * The frame's CSP is the only thing keeping the Worker off the network, and it gets there
 * only by inheritance, on top of the site's own policy. So before compiling anything the
 * Worker tries two things the frame's policy forbids, and refuses the run if either works:
 * - a `data:` script, which no policy here allows: it catches a Worker under no policy;
 * - a HEAD request to the job's probe URL on the site itself, which the site's policy
 *   allows: only the frame's `default-src 'none'` stops it, so it catches a Worker that
 *   inherited the site's policy without the frame's, which the `data:` script misses (the
 *   site's script-src refuses `data:` too). It is `no-cors` because the Worker's origin
 *   is opaque: the request then resolves whenever it is allowed, CORS headers or not.
 * A CSP block rejects the request before anything is sent. A request that fails for
 * another reason (offline) also reads as blocked; offline, the code has nowhere to send
 * anything either. A missing or non-http(s) probe URL refuses the run: the check fails
 * closed.
 */
export const WORKER_SOURCE = `(function () {
'use strict';
var post = self.postMessage.bind(self);
var AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
function describe(err) {
  try {
    if (err && typeof err === 'object' && 'message' in err) {
      return (err.name ? String(err.name) + ': ' : '') + String(err.message);
    }
    return String(err);
  } catch (e) {
    return 'the code threw a value that cannot be printed';
  }
}
var REFUSED = 'custom code is refused: this browser does not block network access inside the sandbox';
// The frame's CSP is the only thing keeping this Worker off the network, and it gets
// here only by inheritance. Unless a data: script and a request to the site (which the
// site's own CSP allows) are both refused, it is not being applied: refuse to run.
function scriptsBlocked() {
  try { importScripts('data:text/javascript,'); } catch (e) { return true; }
  return false;
}
function requestsBlocked(probe) {
  try {
    var url = new URL(probe);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return Promise.resolve(false);
    return fetch(url.href, { method: 'HEAD', mode: 'no-cors', credentials: 'omit' })
      .then(function () { return false; }, function () { return true; });
  } catch (e) {
    return Promise.resolve(false);
  }
}
self.onmessage = function (e) {
  self.onmessage = null;
  var d = e.data;
  if (!scriptsBlocked()) {
    post({ ok: false, error: REFUSED });
    return;
  }
  requestsBlocked(d.probe).then(function (blocked) {
    if (blocked) run(d); else post({ ok: false, error: REFUSED });
  });
};
function run(d) {
  Promise.resolve().then(function () {
    var fn = new AsyncFunction('input', '"use strict";\\n' + d.code);
    return fn.call(undefined, d.input);
  }).then(function (value) {
    try {
      post({ ok: true, value: value });
    } catch (err) {
      post({ ok: false, error: 'the result cannot be passed back (' + describe(err) + '); return a string, a Uint8Array or plain JSON' });
    }
  }, function (err) {
    post({ ok: false, error: describe(err) });
  });
}
post({ alive: true });
})();
`

/**
 * Runs in the sandboxed frame. Reads the job the app baked into this document (the
 * JSON data block `#subelt-job`: token, code, encoded input, time budget, probe URL),
 * starts a Worker to run the code, tells the parent when the Worker is up (`running`,
 * the moment the budget starts) and relays the outcome (`result`). Every message to the
 * parent carries the job's token, which only THIS document knows — the app never posts
 * the token (or the code or input) to the frame, so a document that replaced this one
 * cannot forge a reply. Messages go to the parent at `'*'` (an opaque-origin frame
 * cannot name the parent's origin), but they only ever travel frame→parent and carry
 * no secret.
 */
export const BOOTSTRAP_SOURCE = `(function () {
'use strict';
var MSG = ${JSON.stringify(MSG)};
var WORKER_SOURCE = ${JSON.stringify(WORKER_SOURCE)};
function text(err) {
  try { return String(err && err.message || err); } catch (e) { return 'unknown error'; }
}
function decodeInput(enc) {
  if (!enc) return '';
  if (enc.k === 's') return enc.v;
  if (enc.k === 'b') {
    var bin = atob(enc.v);
    var u = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return u;
  }
  return JSON.parse(enc.v);
}
var job;
try {
  job = JSON.parse(document.getElementById(${JSON.stringify(JOB_ELEMENT_ID)}).textContent);
} catch (err) {
  // Without the job there is no token, so no reply could be told apart from a forgery:
  // stay silent and let the host's start-up budget report that the sandbox did not start.
  return;
}
var token = job.token;
var ms = Number(job.timeoutMs);
if (!(ms > 0)) ms = 2000;
var done = false;
var running = false;
var worker = null;
var url = '';
var timer = 0;
function send(msg) {
  msg.token = token;
  parent.postMessage(msg, '*');
}
function finish(result) {
  if (done) return;
  done = true;
  clearTimeout(timer);
  if (worker) worker.terminate();
  if (url) URL.revokeObjectURL(url);
  var msg = { ok: result.ok === true };
  msg[MSG] = 'result';
  if (msg.ok) msg.value = result.value; else msg.error = String(result.error);
  try {
    send(msg);
  } catch (err) {
    var fail = { ok: false, error: 'the result cannot be passed back (' + text(err) + ')' };
    fail[MSG] = 'result';
    send(fail);
  }
}
var input;
try {
  input = decodeInput(job.input);
} catch (err) {
  finish({ ok: false, error: 'the input could not be read (' + text(err) + ')' });
  return;
}
// Tell the parent the document parsed and is about to start the Worker, so it can
// budget frame start-up separately from Worker start-up. Carries the token, which only
// this document knows, so a document that replaced this frame cannot forge it.
var rdy = {};
rdy[MSG] = 'ready';
send(rdy);
try {
  url = URL.createObjectURL(new Blob([WORKER_SOURCE], { type: 'text/javascript' }));
  worker = new Worker(url);
} catch (err) {
  finish({ ok: false, error: 'this browser cannot start a sandboxed worker (' + text(err) + ')' });
  return;
}
worker.onmessage = function (ev) {
  var r = ev.data;
  if (!running) {
    // the first message is the worker's own start-up ping: no user code has run yet
    running = true;
    var up = {};
    up[MSG] = 'running';
    send(up);
    timer = setTimeout(function () {
      finish({ ok: false, error: 'timed out after ' + ms + ' ms' });
    }, ms);
    return;
  }
  finish(r && r.ok === true ? { ok: true, value: r.value } : { ok: false, error: r && r.error });
};
worker.onerror = function (ev) {
  if (ev && ev.preventDefault) ev.preventDefault();
  finish({ ok: false, error: (ev && ev.message) || 'the code failed to start' });
};
worker.onmessageerror = function () {
  finish({ ok: false, error: 'the result could not be read' });
};
worker.postMessage({ code: job.code, input: input, probe: job.probe });
})();`

/**
 * The bootstrap exactly as it appears between `<script>` and `</script>` in every
 * srcdoc: `</script` escaped so no string inside it can close the element early. The
 * same text on every run, so the site's CSP can allow it by hash (scripts/csp.test.ts
 * fails, naming the new hash, when this changes).
 */
export const SANDBOX_BOOTSTRAP_SCRIPT = BOOTSTRAP_SOURCE.replace(/<\/(script)/gi, '<\\/$1')

/**
 * The job as JSON that is inert inside a <script> data block. `<` only occurs inside
 * JSON strings, where its unicode escape means the same thing, so neither `</script` nor
 * `<!--` (which, followed by `<script`, stops the closing tag from ending the
 * element) can reach the HTML tokenizer.
 */
const jobJson = (job: SandboxJob) => JSON.stringify(job).replace(/</g, '\\u003c')

/**
 * The frame document. The CSP meta is the first element so it governs everything
 * after it; the job comes before the bootstrap, which reads it when it runs.
 */
export function buildSrcdoc(job: SandboxJob): string {
  return `<meta http-equiv="Content-Security-Policy" content="${SANDBOX_CSP}">` +
    `<script type="application/json" id="${JOB_ELEMENT_ID}">${jobJson(job)}</script>` +
    `<script>${SANDBOX_BOOTSTRAP_SCRIPT}</script>`
}
