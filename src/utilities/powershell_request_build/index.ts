import type { Utility } from '@/types/utility'
import { headerPairs, requestRecord } from '../curl_build'

/**
 * JSON describing an HTTP request (the shape curl_parse produces) -> a runnable
 * PowerShell `Invoke-RestMethod` / `Invoke-WebRequest` command.
 *
 * Written for PowerShell 7. Every curl flag either maps to a parameter, is what
 * PowerShell does anyway (`--compressed`, `-L`, `-f`), or is named in a leading
 * `#` comment — by name only, since flag values can be credentials.
 */

type Cmdlet = 'Invoke-RestMethod' | 'Invoke-WebRequest'

/** -Method takes these names; any other method needs -CustomMethod. */
const METHODS: Record<string, string> = {
  GET: 'Get', HEAD: 'Head', POST: 'Post', PUT: 'Put', DELETE: 'Delete',
  OPTIONS: 'Options', PATCH: 'Patch', TRACE: 'Trace', MERGE: 'Merge'
}

/** curl flags that need no parameter: PowerShell behaves that way already, or another field covers them. */
const IMPLICIT_FLAGS = new Set([
  'compressed', 'location', 'get', 'head', 'upload-file', 'basic', 'digest', 'ntlm', 'negotiate', 'anyauth',
  'silent', 'show-error', 'no-progress-meter', 'progress-bar', 'fail', 'fail-with-body', 'globoff',
  'no-buffer', 'tcp-nodelay'
])

/** Switches with a direct PowerShell counterpart. */
const SWITCH_FLAGS: Record<string, string> = {
  insecure: 'SkipCertificateCheck',
  'location-trusted': 'PreserveAuthorizationOnRedirect',
  'no-keepalive': 'DisableKeepAlive',
  verbose: 'Verbose'
}

const HTTP_VERSIONS: Record<string, string> = {
  'http1.0': '1.0', 'http1.1': '1.1', http2: '2.0', http3: '3.0'
}

/** Challenge-based schemes: -Credential answers them; a preemptive Basic header would be wrong. */
const CHALLENGE_AUTH = ['digest', 'ntlm', 'negotiate', 'anyauth']

/* ------------------------------------------------------------- quoting */

/** PowerShell reads the typographic single quotes as quote characters too. */
const SINGLE_QUOTES = /['‘’‚‛]/g
/** Characters a single-quoted string cannot hold as typed: C0 controls but tab and LF, CR included, and DEL. */
// eslint-disable-next-line no-control-regex -- control characters are what this matches
const CONTROL = /[\x00-\x08\x0B-\x1F\x7F]/
const ESCAPES: Record<string, string> = {
  '\0': '`0', '\x07': '`a', '\b': '`b', '\f': '`f', '\n': '`n', '\r': '`r', '\t': '`t', '\v': '`v'
}

const singleQuoted = (s: string) => `'${s.replace(SINGLE_QUOTES, (q) => q + q)}'`

/** Backtick escapes that Windows PowerShell 5.1 reads too (no `e or `u{…}). */
function doubleQuoted(s: string): string {
  let out = '"'
  for (const ch of s) {
    if (ESCAPES[ch]) out += ESCAPES[ch]
    else if (/[`"$“”„]/.test(ch)) out += '`' + ch
    else if (CONTROL.test(ch)) out += `$([char]0x${ch.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')})`
    else out += ch
  }
  return out + '"'
}

/** A string literal: single-quoted (nothing expands) unless it needs escapes, or must stay on one line. */
const literal = (s: string, oneLine = true) =>
  CONTROL.test(s) || (oneLine && s.includes('\n')) ? doubleQuoted(s) : singleQuoted(s)

/** A single-quoted here-string holds any multi-line text without control characters, except a line that would close it. */
const fitsHereString = (s: string) =>
  s.includes('\n') && !CONTROL.test(s) && !/^['‘’‚‛]@/m.test(s)

/* ------------------------------------------------------------- request */

/** A command parameter: a switch, a hashtable, or one expression (with a bare-word spelling for the inline command). */
type Arg =
  | { name: string; kind: 'switch' }
  | { name: string; kind: 'table'; entries: Array<[string, string]> }
  | { name: string; kind: 'value'; value: string; bare?: string }

function authPair(auth: unknown): { user: string; password: string } | null {
  if (typeof auth === 'string') {
    if (!auth.trim()) return null
    const colon = auth.indexOf(':')
    return colon >= 0 ? { user: auth.slice(0, colon), password: auth.slice(colon + 1) } : { user: auth, password: '' }
  }
  if (!auth || typeof auth !== 'object' || Array.isArray(auth)) return null
  const rec = auth as Record<string, unknown>
  const user = String(rec.user ?? rec.username ?? rec.name ?? '')
  const password = String(rec.password ?? rec.pass ?? '')
  return user || password ? { user, password } : null
}

/** curl assumes http:// for a URL (or proxy) without a scheme; PowerShell needs it spelled out. */
const withScheme = (url: string) => (/^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(url) ? url : `http://${url}`)

const FORM_OPTION = /;(type|filename|headers|encoder)=/i

/** One -F field as a -Form value: text, a file to upload (@path) or a file's contents (<path). */
function formField(entry: unknown, skipped: Set<string>): [string, string] {
  let name: string
  let value: string
  let type: unknown
  if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
    const rec = entry as Record<string, unknown>
    name = String(rec.name ?? '')
    value = String(rec.value ?? '')
    type = rec.type
  } else if (Array.isArray(entry)) {
    name = String(entry[0] ?? '')
    value = String(entry[1] ?? '')
  } else {
    const text = String(entry ?? '')
    const eq = text.indexOf('=')
    name = eq >= 0 ? text.slice(0, eq) : text
    value = eq >= 0 ? text.slice(eq + 1) : ''
  }
  if (!name) throw new Error('a form field needs a name')
  if (type === 'text' || !/^[@<]/.test(value)) return [name, literal(value)]

  // curl's ;type= / ;filename= options: -Form takes a file's own name and sends it as application/octet-stream
  const option = FORM_OPTION.exec(value)
  if (option) skipped.add(`-F ;${option[1].toLowerCase()}=`)
  const path = (option ? value.slice(0, option.index) : value).slice(1)
  if (!path) throw new Error(`form field "${name}" names no file`)
  return [name, value.startsWith('@')
    ? `(Get-Item -LiteralPath ${literal(path)})`
    : `(Get-Content -Raw -LiteralPath ${literal(path)})`]
}

/** Case-insensitively merged entries: a PowerShell hashtable literal refuses duplicate keys. */
function mergeEntries(pairs: Array<[string, string]>, join: (name: string, values: string[]) => string): Array<[string, string]> {
  const order: string[] = []
  const byKey = new Map<string, { name: string; values: string[] }>()
  for (const [name, value] of pairs) {
    const key = name.toLowerCase()
    const bucket = byKey.get(key)
    if (bucket) bucket.values.push(value)
    else { byKey.set(key, { name, values: [value] }); order.push(key) }
  }
  return order.map((key) => {
    const { name, values } = byKey.get(key)!
    return [name, values.length === 1 ? values[0] : join(name, values)]
  })
}

function prettyJson(body: string): string {
  const trimmed = body.trim()
  if (!/^[[{]/.test(trimmed)) return body
  try {
    return JSON.stringify(JSON.parse(trimmed), null, 2)
  } catch {
    return body
  }
}

/* ------------------------------------------------------------- output */

const inlineTable = (entries: Array<[string, string]>) =>
  `@{ ${entries.map(([k, v]) => `${k} = ${v}`).join('; ')} }`

const splatTable = (entries: Array<[string, string]>) =>
  `@{\n${entries.map(([k, v]) => `    ${k} = ${v}`).join('\n')}\n  }`

function inlineCommand(cmdlet: Cmdlet, args: Arg[]): string {
  const parts = args.map((a) =>
    a.kind === 'switch' ? `-${a.name}`
      : a.kind === 'table' ? `-${a.name} ${inlineTable(a.entries)}`
        : `-${a.name} ${a.bare ?? a.value}`)
  return [cmdlet, ...parts].join(' ')
}

function splatCommand(cmdlet: Cmdlet, args: Arg[]): string {
  const lines = args.map((a) =>
    a.kind === 'switch' ? `  ${a.name} = $true`
      : a.kind === 'table' ? `  ${a.name} = ${splatTable(a.entries)}`
        : `  ${a.name} = ${a.value}`)
  return `$params = @{\n${lines.join('\n')}\n}\n${cmdlet} @params`
}

const util: Utility = {
  id: 'powershell_request_build',
  name: 'json to powershell request',
  category: 'Web & Dev',
  description:
    'Turn JSON describing an HTTP request (method, url, headers, body, auth, form fields, curl flags) into a runnable PowerShell Invoke-RestMethod or Invoke-WebRequest command.',
  accepts: 'json',
  produces: 'string',
  tags: ['powershell', 'invoke-restmethod', 'invoke-webrequest', 'curl', 'http request', 'windows', 'rest api'],
  examples: [
    {
      title: 'POST with a bearer token and a JSON body',
      input: JSON.stringify({
        method: 'POST',
        url: 'https://api.example.com/v1/users',
        headers: { Authorization: 'Bearer test_token_123', 'Content-Type': 'application/json' },
        body: '{"name":"Ada"}'
      }),
      output:
        "$params = @{\n  Uri = 'https://api.example.com/v1/users'\n  Method = 'Post'\n  Headers = @{\n    'Authorization' = 'Bearer test_token_123'\n  }\n  ContentType = 'application/json'\n  Body = '{\"name\":\"Ada\"}'\n}\nInvoke-RestMethod @params"
    }
  ],
  params: {
    cmdlet: {
      kind: 'select',
      label: 'cmdlet',
      options: ['Invoke-RestMethod', 'Invoke-WebRequest'],
      default: 'Invoke-RestMethod',
      description: 'Invoke-RestMethod returns the parsed JSON or XML; Invoke-WebRequest returns the response with its status code and headers.'
    },
    multiline: {
      kind: 'boolean',
      label: 'splat across lines',
      default: true,
      description: 'Put a request with more than two parameters in a $params hashtable (splatting), and a multi-line body in a here-string. Off: one command line.'
    },
    pretty: { kind: 'boolean', label: 'pretty-print a json body', default: false }
  },
  apply: (input: any, params: any) => {
    const cmdlet: Cmdlet = params?.cmdlet === 'Invoke-WebRequest' ? 'Invoke-WebRequest' : 'Invoke-RestMethod'
    const multiline = params?.multiline !== false
    const pretty = params?.pretty === true

    const req = requestRecord(input)
    if (!req || Object.keys(req).length === 0) return ''

    const rawUrl = req.url === undefined || req.url === null ? '' : String(req.url).trim()
    if (!rawUrl) throw new Error('a PowerShell request needs a "url"')
    let url = withScheme(rawUrl)

    const flags = (req.flags && typeof req.flags === 'object' && !Array.isArray(req.flags)
      ? req.flags : {}) as Record<string, unknown>
    const skipped = new Set<string>()

    // ---- payload ---------------------------------------------------------
    let body = req.body === undefined || req.body === null ? '' : String(req.body)
    const formIn = Array.isArray(req.form) ? req.form : []
    const upload = typeof flags['upload-file'] === 'string' ? flags['upload-file'] : ''
    if (body && formIn.length > 0) throw new Error('a request cannot have both a body and form fields (curl refuses -d with -F too)')
    if (body && upload) throw new Error('a request cannot have both a body and an upload file (-d with -T)')

    // curl sends form-encoded data unless told otherwise; -G moves the data into the query string
    const sendsData = body !== '' && flags.get !== true
    if (body && flags.get === true) {
      const hash = url.indexOf('#')
      const base = hash >= 0 ? url.slice(0, hash) : url
      url = `${base}${base.includes('?') ? '&' : '?'}${body}`
      body = ''
    }
    let inFile = upload
    const fromFile = /^@([^\r\n&]+)$/.exec(body)
    if (fromFile) {
      if (fromFile[1] === '-') skipped.add('-d @- (stdin)')
      else inFile = fromFile[1]
      body = ''
    }
    if (body && pretty) body = prettyJson(body)

    // ---- method ----------------------------------------------------------
    let method = req.method === undefined || req.method === null ? '' : String(req.method).trim().toUpperCase()
    if (!method) {
      method = flags.head === true ? 'HEAD'
        : upload ? 'PUT'
          : sendsData || formIn.length > 0 ? 'POST'
            : 'GET'
    }

    // ---- headers ---------------------------------------------------------
    const pairs = headerPairs(req.headers)
    for (const [name, value] of pairs) {
      if (!name) throw new Error('empty header name')
      if (/[\r\n]/.test(value)) throw new Error(`header "${name}" value must not contain line breaks`)
    }
    if (typeof flags.range === 'string' && !pairs.some(([n]) => n.toLowerCase() === 'range')) {
      pairs.push(['Range', `bytes=${flags.range}`])
    }
    const merged = mergeEntries(pairs, (name, values) => values.join(name.toLowerCase() === 'cookie' ? '; ' : ', '))
    const take = (lower: string): string | undefined => {
      const i = merged.findIndex(([n]) => n.toLowerCase() === lower)
      return i < 0 ? undefined : merged.splice(i, 1)[0][1]
    }
    let contentType = take('content-type')
    const userAgent = take('user-agent')
    take('content-length') // PowerShell measures the body itself
    // -Form writes its own multipart boundary; a pasted one would not match it
    if (formIn.length > 0 && contentType && /^multipart\/form-data\b/i.test(contentType)) contentType = undefined
    if (contentType === undefined && sendsData) contentType = 'application/x-www-form-urlencoded'

    const headerEntries: Array<[string, string]> = []
    const credentials = authPair(req.auth)
    const challenge = CHALLENGE_AUTH.some((f) => flags[f] === true)
    const hasAuthorization = merged.some(([n]) => n.toLowerCase() === 'authorization')
    if (credentials && !challenge && !hasAuthorization) {
      // curl -u sends Basic credentials up front; -Credential would wait for a 401 challenge
      const pair = literal(`${credentials.user}:${credentials.password}`)
      headerEntries.push(["'Authorization'", `'Basic ' + [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes(${pair}))`])
    }
    for (const [name, value] of merged) headerEntries.push([singleQuoted(name), literal(value)])

    // ---- arguments -------------------------------------------------------
    const switches: Arg[] = []
    const args: Arg[] = [{ name: 'Uri', kind: 'value', value: literal(url) }]
    if (method !== 'GET') {
      args.push(METHODS[method]
        ? { name: 'Method', kind: 'value', value: `'${METHODS[method]}'`, bare: METHODS[method] }
        : { name: 'CustomMethod', kind: 'value', value: literal(method) })
    }
    if (headerEntries.length > 0) args.push({ name: 'Headers', kind: 'table', entries: headerEntries })
    if (userAgent !== undefined) args.push({ name: 'UserAgent', kind: 'value', value: literal(userAgent) })
    if (credentials && challenge) {
      const secret = credentials.password
        ? `(ConvertTo-SecureString ${literal(credentials.password)} -AsPlainText -Force)`
        : '[securestring]::new()'
      args.push({ name: 'Credential', kind: 'value', value: `([pscredential]::new(${literal(credentials.user)}, ${secret}))` })
      // curl sends credentials over plain http; PowerShell refuses unless told to
      if (/^http:/i.test(url)) switches.push({ name: 'AllowUnencryptedAuthentication', kind: 'switch' })
    }
    if (contentType !== undefined) args.push({ name: 'ContentType', kind: 'value', value: literal(contentType) })

    let preamble = ''
    if (body) {
      let text: string
      if (multiline && fitsHereString(body)) {
        preamble = `$body = @'\n${body}\n'@\n`
        text = '$body'
      } else {
        text = literal(body, !multiline)
      }
      // a string body goes out as ISO-8859-1 before PowerShell 7.4 (and in Windows PowerShell): send UTF-8 bytes, as curl does
      const value = /[\u0080-\uFFFF]/.test(body) ? `([Text.Encoding]::UTF8.GetBytes(${text}))` : text
      args.push({ name: 'Body', kind: 'value', value })
    }
    if (inFile) args.push({ name: 'InFile', kind: 'value', value: literal(inFile) })
    if (formIn.length > 0) {
      const fields = formIn.map((entry) => formField(entry, skipped))
      const entries = mergeEntries(fields.map(([n, v]) => [n, v]), (_name, values) => values.join(', '))
      args.push({ name: 'Form', kind: 'table', entries: entries.map(([n, v]) => [literal(n), v]) })
    }

    // ---- flags -----------------------------------------------------------
    const valueOf = (key: string): string | null => {
      const v = flags[key]
      return typeof v === 'string' || typeof v === 'number' ? String(v).trim() : null
    }
    const count = (key: string, name: string, round: (n: number) => number) => {
      const raw = valueOf(key)
      const n = raw === null || raw === '' ? NaN : Number(raw)
      if (Number.isFinite(n) && n >= 0) args.push({ name, kind: 'value', value: String(round(n)) })
      else skipped.add(`--${key}`)
    }
    for (const [key, value] of Object.entries(flags)) {
      if (value === false || value === null || value === undefined || IMPLICIT_FLAGS.has(key)) continue
      if (SWITCH_FLAGS[key]) { if (value === true) switches.push({ name: SWITCH_FLAGS[key], kind: 'switch' }); continue }
      if (HTTP_VERSIONS[key] && value === true) {
        args.push({ name: 'HttpVersion', kind: 'value', value: `'${HTTP_VERSIONS[key]}'`, bare: HTTP_VERSIONS[key] })
        continue
      }
      switch (key) {
        case 'range':
          break
        case 'output': {
          const path = valueOf(key)
          if (path === '-') break // stdout is where the cmdlet writes anyway
          if (path) args.push({ name: 'OutFile', kind: 'value', value: literal(path) })
          else skipped.add('--output')
          break
        }
        case 'max-time':
          count(key, 'TimeoutSec', Math.ceil)
          break
        case 'max-redirs':
          count(key, 'MaximumRedirection', Math.floor)
          break
        case 'retry':
          count(key, 'MaximumRetryCount', Math.floor)
          break
        case 'proxy': {
          const proxy = valueOf(key)
          if (proxy) args.push({ name: 'Proxy', kind: 'value', value: literal(withScheme(proxy)) })
          else skipped.add('--proxy')
          break
        }
        case 'cookie-file':
          skipped.add('-b <file>')
          break
        default:
          skipped.add(`--${key}`)
      }
    }
    args.push(...switches)
    if (cmdlet === 'Invoke-WebRequest') args.push({ name: 'UseBasicParsing', kind: 'switch' })

    const note = skipped.size > 0 ? `# Not converted (no ${cmdlet} equivalent): ${[...skipped].join(', ')}\n` : ''
    const splat = multiline && args.length > 2
    return note + preamble + (splat ? splatCommand(cmdlet, args) : inlineCommand(cmdlet, args))
  }
}

export default util
