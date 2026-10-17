# @string-utility-belt/mcp

[![smithery badge](https://smithery.ai/badge/string-utility-belt/string-utility-belt)](https://smithery.ai/servers/string-utility-belt/string-utility-belt)

An [MCP](https://modelcontextprotocol.io) server that exposes [String Utility Belt](https://stringutilitybelt.com/?utm_source=npm&utm_medium=referral&utm_campaign=mcp)'s 247
string-transformation utilities — and its pipeline engine — as tools an AI agent can call
directly, with no browser involved.

## Install

Nothing to clone or build: clients run it from npm with `npx` (Node.js 20 or later).

**Claude Code**

```bash
claude mcp add subelt -- npx -y @string-utility-belt/mcp
```

**Claude Desktop, Cursor and other MCP clients**: add this to the client's MCP configuration
(for Claude Desktop, `claude_desktop_config.json`), then restart the client:

```json
{
  "mcpServers": {
    "subelt": {
      "command": "npx",
      "args": ["-y", "@string-utility-belt/mcp"]
    }
  }
}
```

It is also on [Smithery](https://smithery.ai/servers/string-utility-belt/string-utility-belt) and in the
official MCP Registry as `com.stringutilitybelt/mcp`. Then ask your agent for something like "base64-decode this
and pretty-print the JSON": it finds the utilities with `list_utilities` and runs them with `run_utility` or
`run_pipeline`.

## Tools

- **`list_utilities`** — `{ category?, query?, limit? }` → `{ items: [{ id, name, category, description }], total, categories }`, best matches first. `query` is a set of words that must all match (in any order) somewhere in the id, name, tags, aliases or description. Start here.
- **`describe_utility`** — `{ id }` → a utility's full doc: params (kind, default, options/bounds, description), what it accepts/produces, tags, aliases, worked examples, and the runtime capabilities it needs.
- **`run_utility`** — `{ id, input, inputEncoding?, params? }` → `{ output, outputEncoding? }`. Text output is returned as-is; JSON output is pretty-printed text; byte output is base64 with `outputEncoding: "base64"`. Params are validated against the utility's spec. A failing utility comes back as `isError: true` with the message, never a thrown exception.
- **`run_pipeline`** — `{ steps?, share?, input, inputEncoding? }` → `{ output, outputEncoding?, errors, timings, skipped, halted }` for a whole pipeline (the v3 schema: utility steps, branches, macros, "run on each" steps, conditions, per-step error policy). Pass exactly one of `steps` (`[]` is the identity pipeline) or `share` (a `#/p/<payload>` link, a URL containing one, or the bare payload). Unknown utility ids and invalid params on enabled steps are rejected up front.
- **`detect_format`** — `{ input, inputEncoding? }` → `{ candidates: [{ format, confidence, note }] }`, best first (JSON, YAML, base64, JWT, gzip, …).

`inputEncoding` is `"text"` (default), `"base64"` (standard or URL-safe, padding optional),
`"hex"` (both decode to raw bytes first) or `"json"` (parse first); `detect_format` takes
`"text"`, `"base64"` or `"hex"`.

## Resources

- **`subelt://utilities`** — the full catalog as JSON (id, name, category, description, tags, aliases for every utility).
- **`subelt://utility/{id}`** — one utility's full documentation (same shape as `describe_utility`), via a resource template with id completion.

## Limits and isolation

- Input is capped at 1 MB per call (a `share` link at 1M characters).
- Output past 1M characters is cut off and flagged `truncated: true` with the untruncated `fullLength`.
- A pipeline is capped at 100 steps (nested steps counted).
- Every call is stopped after 20 s — set `SUBELT_MCP_TIMEOUT_MS` to change that.
- Utility code runs in pooled child processes (up to 4, 512 MB heap each), not in the server:
  a call that blocks (a catastrophic regex, bcrypt at cost 31) is killed at the deadline, one
  that exhausts memory fails with "ran out of memory", and either way the server keeps
  answering. Runners exit with the server, and kill themselves if it dies abruptly.
- Utilities that run arbitrary user JavaScript (`custom_js`) are always refused — LLM-driven
  code execution is out of scope for this server. The two utilities that need a browser
  `DOMParser` (`xml_to_json`, `html_table_to_csv`) fail with an explanatory error.

## Privacy Policy

The server runs entirely on your computer. Our full privacy policy is at
[stringutilitybelt.com/privacy/](https://stringutilitybelt.com/privacy/); for this server it comes down to:

- **Data collection.** It receives only the arguments your MCP client sends in each tool call (the input text,
  utility ids, parameters, pipeline steps) and returns results only to that client. It contains no analytics,
  telemetry or ads.
- **Use and storage.** Inputs are processed in memory, by the server and its child processes, to produce the
  result you asked for. Nothing is written to disk. Diagnostics, such as a failed start or a runner that ran
  out of memory, go to standard error, which your MCP client may keep in its own logs.
- **Third-party sharing.** None. The server makes no network requests, so nothing you give it reaches us or
  anyone else. (Your MCP client may download the icon listed in the server's metadata from
  stringutilitybelt.com to display it; the server itself does not.)
- **Retention.** Nothing is kept once a call returns.
- **Contact.** [contact@stringutilitybelt.com](mailto:contact@stringutilitybelt.com).

## Building

From the repo root (no separate install needed — it reuses the root `node_modules`):

```bash
npm run build:mcp
```

This produces a single standalone file at `packages/mcp/dist/server.mjs` (Node 20+, every
dependency bundled in — only Node's own built-ins are external). It is an SSR build, so
dependencies resolve to their Node variants; the same file doubles as the job-runner entry
(`--job-runner`).

## Running a local build

To try changes from a checkout, point the client at the built file instead of the npm package:

```bash
claude mcp add subelt -- node /absolute/path/to/string-utility-belt/packages/mcp/dist/server.mjs
```

## Development

```bash
# Unit + integration tests (in-process via InMemoryTransport, plus the process pool)
npx vitest run packages/mcp/src --maxWorkers=2

# Build, then also run the stdio smoke tests against the real binary
npm run build:mcp
npx vitest run packages/mcp/src/bin.smoke.test.ts --maxWorkers=1
```

## Source and issues

@string-utility-belt/mcp is developed in the [String Utility Belt repository](https://github.com/String-Utility-Belt/string-utility-belt/tree/main/packages/mcp) on GitHub,
alongside the web app and the other integrations. Report bugs or request features in its
[issue tracker](https://github.com/String-Utility-Belt/string-utility-belt/issues). MIT licensed.
