/**
 * MCP server exposing String Utility Belt's utilities and its pipeline engine
 * as tools for AI agents (roadmap §12.2). Built on the framework-free `src/core`
 * engine and the statically-imported `src/utilities/static-registry` (every
 * utility's code, no lazy chunk loading — this runs in plain Node).
 *
 * `createServer()` builds the server; `bin.ts` connects it to stdio and hands it a
 * child-process executor so the per-call timeout is enforced even for synchronous
 * work and a crash cannot take the server down. Catalog tools/resources are answered
 * in-process from metadata; everything that runs utility code goes through the
 * executor as a `Job`.
 */
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import type { UtilityMeta } from '../../../src/core'
import { EXAMPLES } from '../../../src/utilities/_generated/examples'
import { staticRegistry } from '../../../src/utilities/static-registry'
import { inProcessExecutor } from './executor'
import type { Executor } from './executor'
import { checkInputSize, errorMessage, paramSummary } from './format'
import { isEvalUtility, runJob } from './jobs'
import type { Job, JobResult } from './jobs'
import { MAX_INPUT_BYTES, MAX_OUTPUT_CHARS, MAX_PIPELINE_STEPS, TOOL_TIMEOUT_MS } from './limits'
import { description as SERVER_DESCRIPTION, homepage as SERVER_WEBSITE, version as SERVER_VERSION } from '../package.json'

const SERVER_NAME = 'subelt'
/** What clients show instead of `name`; the MCP Registry entry (server.json) and the .mcpb (manifest.json) use the same. */
export const SERVER_TITLE = 'String Utility Belt'
/**
 * The site's own icons, as the HTTPS URLs the MCP Registry requires (server.json lists the same).
 * A client may fetch them to show the server; the server itself never makes a network request.
 */
export const SERVER_ICONS = [
  { src: 'https://stringutilitybelt.com/icons/icon-192.png', mimeType: 'image/png', sizes: ['192x192'] },
  { src: 'https://stringutilitybelt.com/icons/icon-512.png', mimeType: 'image/png', sizes: ['512x512'] },
]

const errorResult = (message: string): CallToolResult => ({ content: [{ type: 'text', text: message }], isError: true })
/** The body twice: as `structuredContent` (checked against the tool's `outputSchema`) and as JSON text for older clients. */
const jsonResult = (body: Record<string, unknown>): CallToolResult => ({
  content: [{ type: 'text', text: JSON.stringify(body, null, 2) }],
  structuredContent: body,
})

// Output schemas: what each tool's `structuredContent` holds on success (errors carry only text).
const renderedOutputShape = {
  output: z.string().describe('The result: text as-is, JSON pretty-printed, bytes as base64.'),
  outputEncoding: z.literal('base64').optional().describe('Present when `output` is base64-encoded bytes.'),
  truncated: z.boolean().optional().describe('True when `output` was cut off at the output limit.'),
  fullLength: z.number().optional().describe('Length `output` would have had untruncated, when `truncated`.'),
}
const valueTypes = z.union([z.string(), z.array(z.string())])

// ---------------------------------------------------------------------------
// list_utilities
// ---------------------------------------------------------------------------

export interface ListUtilitiesArgs { category?: string; query?: string; limit?: number }

/**
 * Relevance of `m` to every whitespace-separated term of `query` (0 = some term
 * matched nothing). Agents search in phrases ("encode url"), so terms may match in
 * any order and across fields; id/name hits outrank tags/aliases, then description.
 */
function relevance(m: UtilityMeta, query: string): number {
  const q = query.trim().toLowerCase()
  const terms = q.split(/\s+/).filter(Boolean)
  const id = m.id.toLowerCase()
  const name = m.name.toLowerCase()
  const keywords = [...m.tags, ...m.aliases].map(k => k.toLowerCase())
  const description = m.description.toLowerCase()
  let score = id === q || name === q || id === q.replace(/[\s-]+/g, '_') ? 100 : 0
  for (const t of terms) {
    if (id.includes(t) || name.includes(t)) score += 4
    else if (keywords.some(k => k.includes(t))) score += 2
    else if (description.includes(t)) score += 1
    else return 0
  }
  return score
}

export function listUtilities({ category, query, limit }: ListUtilitiesArgs) {
  let metas = staticRegistry.list()
  if (category) {
    const c = category.trim().toLowerCase()
    metas = metas.filter(m => m.category.toLowerCase() === c)
  }
  if (query?.trim()) {
    metas = metas
      .map((m, i) => ({ m, i, score: relevance(m, query) }))
      .filter(r => r.score > 0)
      .sort((a, b) => b.score - a.score || a.i - b.i)
      .map(r => r.m)
  }
  const total = metas.length
  const cap = Math.max(1, Math.min(500, limit ?? 50))
  const items = metas.slice(0, cap).map(m => ({ id: m.id, name: m.name, category: m.category, description: m.description }))
  return { items, total, categories: staticRegistry.categories() }
}

// ---------------------------------------------------------------------------
// describe_utility
// ---------------------------------------------------------------------------

export function describeUtility(id: string) {
  const meta = staticRegistry.get(id)
  if (!meta) throw new Error(`unknown utility: ${id}`)
  const params = Object.fromEntries(Object.entries(meta.params).map(([k, spec]) => [k, paramSummary(spec)]))
  return {
    id: meta.id,
    name: meta.name,
    category: meta.category,
    description: meta.description,
    accepts: meta.accepts,
    produces: meta.produces,
    params,
    tags: meta.tags,
    aliases: meta.aliases,
    env: meta.env,
    ...(isEvalUtility(meta) ? { unavailable: 'runs user-supplied JavaScript, which this server always refuses' } : {}),
    examples: EXAMPLES[meta.id] ?? [],
  }
}

// ---------------------------------------------------------------------------
// server
// ---------------------------------------------------------------------------

export interface ServerOptions {
  /** Where utility code runs. Default: this thread (cooperative timeout only). */
  executor?: Executor
  /** Per-call budget in ms. Default `TOOL_TIMEOUT_MS`. */
  timeoutMs?: number
}

const INPUT_ENCODINGS = ['text', 'base64', 'hex', 'json'] as const
const bytes = MAX_INPUT_BYTES.toLocaleString('en-US')

export function createServer(opts: ServerOptions = {}): McpServer {
  const executor = opts.executor ?? inProcessExecutor(runJob)
  const timeoutMs = opts.timeoutMs ?? TOOL_TIMEOUT_MS
  const utilityCount = staticRegistry.list().length
  const server = new McpServer({
    name: SERVER_NAME,
    title: SERVER_TITLE,
    version: SERVER_VERSION,
    description: SERVER_DESCRIPTION,
    websiteUrl: SERVER_WEBSITE,
    icons: SERVER_ICONS,
  }, {
    // Sent with `initialize`: clients that load tools on demand use it to know when to reach for this server.
    instructions:
      `${utilityCount} string and data transformations (encode/decode, hash, encrypt, compress, convert between ` +
      'JSON, YAML, TOML, CSV and XML, change case, format, analyse), run on this machine with no network access. ' +
      'Find a utility with list_utilities, read its exact parameters with describe_utility, then run it with ' +
      'run_utility. Several transformations in a row go in one run_pipeline call instead of a run_utility call ' +
      'each. detect_format identifies an unknown input (base64, JWT, gzip, …) before you pick a utility.',
  })

  /** Size-checks `input`, runs `job` through the executor, and maps any failure to `isError`. */
  const execute = async (job: Job, signal: AbortSignal): Promise<CallToolResult> => {
    try {
      checkInputSize(job.input, MAX_INPUT_BYTES)
      return jsonResult(await executor.run<JobResult>(job, { timeoutMs, signal }))
    } catch (e) {
      return errorResult(errorMessage(e))
    }
  }

  const limitsNote =
    `Input is capped at ${bytes} bytes, output text past ${MAX_OUTPUT_CHARS.toLocaleString('en-US')} characters ` +
    `is cut off (flagged \`truncated\`, with \`fullLength\`), and the call is stopped after ${timeoutMs / 1000}s.`

  server.registerTool('list_utilities', {
    title: 'List utilities',
    description:
      `Search the string-transformation utilities this server can run (${utilityCount} total, across categories like ` +
      'Encoding, Hashing, Ciphers, Compression, Data Formats, Analysis, Generators and more). Returns ' +
      '{items: [{id, name, category, description}], total, categories}, best matches first. Use this ' +
      'first to find an id, then call describe_utility for its exact parameters before run_utility.',
    annotations: { readOnlyHint: true, openWorldHint: false },
    inputSchema: {
      category: z.string().optional().describe('Category to filter to (case-insensitive), e.g. "Encoding" or "Hashing".'),
      query: z.string().optional().describe(
        'Search words, matched case-insensitively against id, name, tags, aliases and description; every word ' +
        'must match somewhere, in any order (e.g. "encode url", "sha256", "uppercase").'),
      limit: z.number().int().min(1).max(500).optional().describe('Maximum number of results to return (default 50, max 500).'),
    },
    outputSchema: {
      items: z.array(z.object({ id: z.string(), name: z.string(), category: z.string(), description: z.string() }))
        .describe('Matching utilities, best first, up to `limit`.'),
      total: z.number().int().describe('How many utilities matched before `limit` was applied.'),
      categories: z.array(z.string()).describe('Every category name, for filtering.'),
    },
  }, async args => jsonResult(listUtilities(args)))

  server.registerTool('describe_utility', {
    title: 'Describe utility',
    description:
      "Full documentation for one utility: its parameters (kind, default, options/bounds, description), " +
      'the value types it accepts/produces, tags, aliases, worked examples (input, inputEncoding, params and ' +
      'expected output — byte outputs there use the app\'s display format, while run_utility returns bytes as ' +
      'base64), and which runtime capabilities it needs. Call this before run_utility to learn the exact ' +
      'parameter names and defaults.',
    annotations: { readOnlyHint: true, openWorldHint: false },
    inputSchema: {
      id: z.string().describe('Utility id, as returned by list_utilities (e.g. "base64_encode").'),
    },
    outputSchema: {
      id: z.string(),
      name: z.string(),
      category: z.string(),
      description: z.string(),
      accepts: valueTypes.describe('Value type(s) the utility takes: string, bytes or json.'),
      produces: valueTypes.describe('Value type(s) the utility returns.'),
      params: z.record(z.string(), z.record(z.string(), z.unknown()))
        .describe('Parameter name -> spec (kind, label, default, options/bounds, description…).'),
      tags: z.array(z.string()),
      aliases: z.array(z.string()),
      env: z.array(z.string()).describe('Runtime capabilities the utility needs (dom, wasm, eval, main).'),
      unavailable: z.string().optional().describe('Why this server will not run the utility, when it will not.'),
      examples: z.array(z.record(z.string(), z.unknown())).describe('Worked examples: input, params and expected output.'),
    },
  }, async ({ id }) => {
    try {
      return jsonResult(describeUtility(id))
    } catch (e) {
      return errorResult(errorMessage(e))
    }
  })

  server.registerTool('run_utility', {
    title: 'Run utility',
    description:
      'Run a single utility on `input` and return {output, outputEncoding?}. Plain text output is returned ' +
      'as-is; a JSON-producing utility returns pretty-printed JSON text; a byte-producing utility (e.g. ' +
      'gzip_compress, get_bytes) returns base64 with `outputEncoding: "base64"`. `inputEncoding` controls how ' +
      '`input` itself is decoded first: "text" (default) uses it as-is, "base64" or "hex" decode it to raw ' +
      'bytes, "json" parses it. Params are validated against describe_utility\'s spec; invalid ones are ' +
      `rejected. ${limitsNote} A failing utility returns isError with the error message. Utilities that run ` +
      'arbitrary user JavaScript (e.g. "custom_js") are refused, and the few that need a browser DOM parser ' +
      '(e.g. "xml_to_json", "html_table_to_csv") fail here.',
    annotations: { readOnlyHint: true, openWorldHint: false },
    inputSchema: {
      id: z.string().describe('Utility id (see list_utilities / describe_utility).'),
      input: z.string().describe('The value to run the utility on.'),
      inputEncoding: z.enum(INPUT_ENCODINGS).optional()
        .describe('How to decode `input` before passing it to the utility. Default "text".'),
      params: z.record(z.string(), z.unknown()).optional()
        .describe('Utility parameters (see describe_utility for names/kinds); params left out use their declared default.'),
    },
    outputSchema: renderedOutputShape,
  }, async (args, extra) => execute({ kind: 'utility', ...args }, extra.signal))

  server.registerTool('run_pipeline', {
    title: 'Run pipeline',
    description:
      "Run a whole pipeline — an ordered list of steps, in the string-utility-belt v3 schema, which may " +
      'include branches (parallel forks merged back together), macros (named sub-pipelines) and "run on each" ' +
      'steps (a sub-pipeline run on every line, delimited piece, JSON array element or JSON object value) — on `input`. ' +
      'Returns {output, outputEncoding?, errors, timings, skipped, halted}: `errors` maps step id to its error ' +
      'message, `timings` maps step id to milliseconds. Provide exactly one of `steps` or `share` (a ' +
      '`#/p/<payload>` share link, a full URL containing one, or the bare payload). Untrusted step data is ' +
      'sanitized first, so malformed entries are dropped rather than rejected. Refused outright: pipelines with ' +
      `more than ${MAX_PIPELINE_STEPS} steps (nested steps counted), unknown utility ids, enabled steps with ` +
      'invalid params, and any step that would run arbitrary user JavaScript (e.g. "custom_js") — LLM-driven ' +
      `code execution is out of scope. ${limitsNote}`,
    annotations: { readOnlyHint: true, openWorldHint: false },
    inputSchema: {
      steps: z.array(z.record(z.string(), z.unknown())).optional().describe(
        'Pipeline steps (v3 schema). Each entry is either a utility step ' +
        '{id, utilityId, params?, enabled?, condition?, onError?}, a fork ' +
        '{type:"branch", id, branches:[[...steps], [...steps]], merge:{mode:"concat"|"zip"|"json"|"pick", ...}}, ' +
        'a sub-pipeline {type:"macro", id, name, steps:[...steps]}, or a map ' +
        '{type:"each", id, split:{mode:"lines"|"json-array"|"json-values"} or {mode:"delimiter", separator}, ' +
        'steps:[...steps], skipEmpty?} that runs `steps` on every item and puts the results back in place ' +
        '(on an each step, `onError` also decides what a failed item becomes). `condition` gates a step on its input ' +
        '({kind:"always"|"nonEmpty"|"regex"|"type", ...}); `onError` is "passthrough" (default: record the ' +
        'error, pass the input on), "stop" or "empty". Use [] for the identity pipeline; omit when using `share`.',
      ),
      share: z.string().optional()
        .describe('A share link (or its bare payload) for a previously built pipeline; used instead of `steps`.'),
      input: z.string().describe("The pipeline's source input."),
      inputEncoding: z.enum(INPUT_ENCODINGS).optional().describe('How to decode `input`. Default "text".'),
    },
    outputSchema: {
      ...renderedOutputShape,
      errors: z.record(z.string(), z.string()).describe('Step id -> error message, for steps that failed.'),
      timings: z.record(z.string(), z.number()).describe('Step id -> milliseconds it took.'),
      skipped: z.record(z.string(), z.string()).describe('Step id -> why it did not run (disabled, condition, halted, aborted).'),
      halted: z.boolean().describe('True when a step with onError "stop" failed and ended the pipeline.'),
    },
  }, async (args, extra) => execute({ kind: 'pipeline', ...args }, extra.signal))

  server.registerTool('detect_format', {
    title: 'Detect format',
    description:
      'Guess what `input` is — JSON, YAML, TOML, XML, HTML, CSV/TSV, base64/base32/hex, URL-encoding, JWT, ' +
      'UUID, data URI, gzip/zlib, email, URL, IP address, unix timestamp, Markdown, SQL, Morse code, ROT13, ' +
      'plain binary — and return {candidates: [{format, confidence, note}]}, best first, confidence 0-1. ' +
      'Empty input yields an empty list.',
    annotations: { readOnlyHint: true, openWorldHint: false },
    inputSchema: {
      input: z.string().describe('The value to inspect.'),
      inputEncoding: z.enum(['text', 'base64', 'hex']).optional().describe('How to decode `input` first. Default "text".'),
    },
    outputSchema: {
      candidates: z.array(z.object({ format: z.string(), confidence: z.number(), note: z.string() }))
        .describe('Likely formats, best first; confidence is 0-1. Empty for empty input.'),
    },
  }, async (args, extra) => execute({ kind: 'detect', ...args }, extra.signal))

  server.registerResource(
    'utilities',
    'subelt://utilities',
    {
      title: 'All utilities',
      description: 'The full utility catalog as JSON: id, name, category, description, tags and aliases for every utility.',
      mimeType: 'application/json',
    },
    async uri => ({
      contents: [{
        uri: uri.href,
        mimeType: 'application/json',
        text: JSON.stringify(
          staticRegistry.list().map(m => ({
            id: m.id, name: m.name, category: m.category, description: m.description, tags: m.tags, aliases: m.aliases,
          })),
          null,
          2,
        ),
      }],
    }),
  )

  server.registerResource(
    'utility',
    new ResourceTemplate('subelt://utility/{id}', {
      list: undefined,
      complete: { id: value => staticRegistry.list().map(m => m.id).filter(id => id.startsWith(value)).slice(0, 100) },
    }),
    {
      title: 'Utility documentation',
      description: 'Full parameter/example documentation for one utility, by id — the same shape describe_utility returns.',
      mimeType: 'application/json',
    },
    async (uri, variables) => {
      const raw = Array.isArray(variables.id) ? variables.id[0] : variables.id
      const doc = describeUtility(decodeURIComponent(String(raw)))
      return { contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(doc, null, 2) }] }
    },
  )

  return server
}
