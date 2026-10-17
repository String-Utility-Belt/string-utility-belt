import type { Utility } from '@/types/utility'

/**
 * Inverse of curl_parse: JSON -> a runnable `curl` command.
 *
 * Input shape (every key optional except `url`):
 *   { method, url, headers, body, auth: {user, password} | "user:pass",
 *     form: [{name, value}], flags: { compressed, insecure, location, get, ... } }
 */

const CORE_FLAGS: Record<string, string> = {
  compressed: '--compressed',
  insecure: '-k',
  location: '-L',
  get: '-G'
}

/** POSIX: single-quote and escape embedded single quotes as '\'' . */
const quotePosix = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`

/** PowerShell: double-quote, backtick-escaping " ` and $ . */
const quotePowerShell = (s: string) => `"${s.replace(/[`"$]/g, (m) => '`' + m)}"`

/** The request object from JSON text or an already-parsed value (shared with powershell_request_build). */
export function requestRecord(input: unknown): Record<string, unknown> | null {
  if (input === null || input === undefined) return null
  if (typeof input === 'string') {
    const trimmed = input.trim()
    if (!trimmed) return null
    let parsed: unknown
    try {
      parsed = JSON.parse(trimmed)
    } catch {
      throw new Error('expected JSON describing a request, e.g. {"url":"https://example.com"}')
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('expected a JSON object describing a request')
    }
    return parsed as Record<string, unknown>
  }
  if (typeof input === 'object' && !Array.isArray(input)) return input as Record<string, unknown>
  throw new Error('expected a JSON object describing a request')
}

/** Header [name, value] pairs from an object, a list of pairs/entries or "Name: value" lines; arrays repeat the header. */
export function headerPairs(source: unknown): Array<[string, string]> {
  const pairs: Array<[string, string]> = []
  if (!source || typeof source !== 'object') return pairs

  const push = (name: string, value: unknown) => {
    if (value === null || value === undefined) return
    if (Array.isArray(value)) { for (const v of value) push(name, v); return }
    if (typeof value === 'object') throw new Error(`header "${name}" has a non-scalar value`)
    pairs.push([name.trim(), String(value).trim()])
  }

  if (Array.isArray(source)) {
    for (const entry of source) {
      if (Array.isArray(entry)) push(String(entry[0] ?? ''), entry[1])
      else if (entry && typeof entry === 'object') {
        const rec = entry as Record<string, unknown>
        push(String(rec.name ?? rec.key ?? ''), rec.value ?? '')
      } else if (typeof entry === 'string') {
        const colon = entry.indexOf(':')
        if (colon < 0) throw new Error(`malformed header entry: ${entry}`)
        push(entry.slice(0, colon), entry.slice(colon + 1))
      }
    }
    return pairs
  }

  for (const [name, value] of Object.entries(source as Record<string, unknown>)) push(name, value)
  return pairs
}

function prettyJson(body: string): string {
  const trimmed = body.trim()
  if (!trimmed || !/^[[{]/.test(trimmed)) return body
  try {
    return JSON.stringify(JSON.parse(trimmed), null, 2)
  } catch {
    return body
  }
}

const util: Utility = {
  id: 'curl_build',
  name: 'json to curl command',
  category: 'Web & Dev',
  description:
    'Turn JSON describing a request (method, url, headers, body, auth, flags) into a runnable curl command, posix or powershell flavored, optionally multi-line with a pretty-printed JSON body.',
  accepts: 'json',
  produces: 'string',
  tags: ['curl', 'http request', 'api testing', 'command line', 'postman export', 'json to curl', 'rest'],
  examples: [
    {
      title: 'POST with a JSON body',
      input: JSON.stringify({
        method: 'POST',
        url: 'https://api.example.com/users',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Ada' })
      }),
      params: { multiline: true, flavor: 'posix', pretty: true },
      output:
        "curl -X POST 'https://api.example.com/users' \\\n  -H 'Content-Type: application/json' \\\n  --data-raw '{\n  \"name\": \"Ada\"\n}'"
    }
  ],
  params: {
    multiline: { kind: 'boolean', label: 'break across lines', default: true },
    flavor: { kind: 'select', label: 'shell flavor', options: ['posix', 'powershell'], default: 'posix' },
    pretty: { kind: 'boolean', label: 'pretty-print a json body', default: true }
  },
  apply: (input: any, params: any) => {
    const multiline = params?.multiline !== false
    const pretty = params?.pretty !== false
    const powershell = params?.flavor === 'powershell'
    const q = powershell ? quotePowerShell : quotePosix

    const req = requestRecord(input)
    if (!req || Object.keys(req).length === 0) return ''

    const url = req.url === undefined || req.url === null ? '' : String(req.url).trim()
    if (!url) throw new Error('curl build needs a "url"')

    const flagsIn = (req.flags && typeof req.flags === 'object' ? req.flags : {}) as Record<string, unknown>
    const getFlag = flagsIn.get === true

    // ---- body / form -----------------------------------------------------
    let body = req.body === undefined || req.body === null ? '' : String(req.body)
    if (pretty) body = prettyJson(body)

    const formIn = Array.isArray(req.form) ? req.form : []
    // `-F name=@file` uploads a file; a *text* field whose value happens to start
    // with @ or < must go out as --form-string or curl would read a file instead.
    const formArgs: Array<[string, string]> = []
    const formFlagFor = (value: string, type: unknown) =>
      type === 'text' && /^[@<]/.test(value) ? '--form-string' : '-F'
    for (const entry of formIn) {
      if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
        const rec = entry as Record<string, unknown>
        const value = String(rec.value ?? '')
        formArgs.push([formFlagFor(value, rec.type), `${String(rec.name ?? '')}=${value}`])
      } else if (Array.isArray(entry)) {
        formArgs.push(['-F', `${String(entry[0] ?? '')}=${String(entry[1] ?? '')}`])
      } else {
        formArgs.push(['-F', String(entry)])
      }
    }

    // ---- method ----------------------------------------------------------
    const method = req.method === undefined || req.method === null ? '' : String(req.method).trim().toUpperCase()
    const inferred = (body || formArgs.length > 0) && !getFlag ? 'POST' : 'GET'
    // `-X HEAD` makes curl wait for a response body that never comes; -I is the
    // flag that actually performs a HEAD request.
    const isHead = method === 'HEAD'
    const needsMethod = method !== '' && !isHead && (method !== 'GET' || inferred !== 'GET')

    const chunks: string[] = []
    const exe = powershell ? 'curl.exe' : 'curl'
    chunks.push(`${exe}${isHead ? ' -I' : needsMethod ? ` -X ${method}` : ''} ${q(url)}`)

    // ---- headers ---------------------------------------------------------
    for (const [name, value] of headerPairs(req.headers)) {
      if (!name) throw new Error('empty header name')
      if (/[\r\n]/.test(value)) throw new Error(`header "${name}" value must not contain line breaks`)
      chunks.push(`-H ${q(`${name}: ${value}`)}`)
    }

    // ---- auth ------------------------------------------------------------
    const auth = req.auth
    if (typeof auth === 'string' && auth.trim()) {
      chunks.push(`-u ${q(auth)}`)
    } else if (auth && typeof auth === 'object') {
      const rec = auth as Record<string, unknown>
      const user = String(rec.user ?? rec.username ?? rec.name ?? '')
      const password = String(rec.password ?? rec.pass ?? '')
      if (user || password) chunks.push(`-u ${q(`${user}:${password}`)}`)
    }

    // ---- flags -----------------------------------------------------------
    for (const [key, flag] of Object.entries(CORE_FLAGS)) {
      if (flagsIn[key] === true) chunks.push(flag)
    }
    for (const [key, value] of Object.entries(flagsIn)) {
      if (Object.prototype.hasOwnProperty.call(CORE_FLAGS, key)) continue
      // `head` is already expressed by -I above; `cookie-file` is curl_parse's
      // name for `-b <file>` and is not a curl flag of its own.
      if (key === 'head' && isHead) continue
      if (value === true) chunks.push(key === 'head' ? '-I' : `--${key}`)
      else if (value !== false && value !== null && value !== undefined) {
        chunks.push(key === 'cookie-file' ? `-b ${q(String(value))}` : `--${key} ${q(String(value))}`)
      }
    }

    // ---- payload ---------------------------------------------------------
    if (body) chunks.push(`--data-raw ${q(body)}`)
    for (const [flag, arg] of formArgs) chunks.push(`${flag} ${q(arg)}`)

    if (!multiline) return chunks.join(' ')
    return chunks.join(powershell ? ' `\n  ' : ' \\\n  ')
  }
}

export default util
