# String Utility Belt

Gives Claude [String Utility Belt](https://stringutilitybelt.com)'s string and data utilities as tools: encode and
decode (base64, hex, URL encoding, JWTs and more), hash, encrypt, compress, convert between JSON, YAML, TOML, CSV and
XML, change case, format and analyse text, and chain any of them into a pipeline. Every transformation runs on your
computer.

The tools come from String Utility Belt's MCP server,
[@string-utility-belt/mcp](https://github.com/String-Utility-Belt/string-utility-belt/tree/main/packages/mcp#readme),
which this plugin starts for you.

## Where it works

- **Claude Code**, and **Cowork** sessions that run on your computer.
- Not in claude.ai chat, which doesn't start servers that run on your computer.

It needs **Node.js 20 or later**: the plugin starts the server with `npx`, which comes with Node.js.

## Install

Add **String Utility Belt** from the plugin directory on claude.ai. Claude Code picks it up through your claude.ai
account the next time it starts while you're signed in; in a session that's already open, run `/reload-plugins`.

## Use it

Ask for what you want done to some text, for example:

- "Base64-decode this and pretty-print the JSON."
- "What format is this string, and what does it say?"
- "Give me the SHA-256 of each of these lines."

Claude finds a utility with `list_utilities`, reads its parameters with `describe_utility` and runs it with
`run_utility`, or runs several steps at once with `run_pipeline`. `detect_format` identifies an unknown input first.
Utilities that would run arbitrary JavaScript are always refused.

## What it runs and what it sends

- **What it runs.** `npx` fetches the exact version of `@string-utility-belt/mcp` this plugin release names from the
  npm registry the first time the server starts, then runs it from npm's cache. The package is a single bundled file
  with no dependencies of its own; its source is in the
  [String Utility Belt repository](https://github.com/String-Utility-Belt/string-utility-belt/tree/main/packages/mcp).
- **What it sends.** Nothing. The server makes no network requests: it receives only what Claude sends in each tool
  call and returns the result only to Claude.

## Privacy Policy

Our full privacy policy is at [stringutilitybelt.com/privacy/](https://stringutilitybelt.com/privacy/). For this
plugin it comes down to:

- **Data collection.** The server receives only the arguments Claude sends in each tool call (the input text, utility
  ids, parameters, pipeline steps). It contains no analytics, telemetry or ads.
- **Use and storage.** Inputs are processed in memory to produce the result Claude asked for. Nothing is written to
  disk. Diagnostics, such as a failed start, go to standard error, which Claude Code may keep in its own logs.
- **Third-party sharing.** None. Apart from `npx` downloading the server from the npm registry, nothing leaves your
  computer.
- **Retention.** Nothing is kept once a call returns.
- **Contact.** [contact@stringutilitybelt.com](mailto:contact@stringutilitybelt.com).

## Support

Report bugs or ask for a utility in the
[issue tracker](https://github.com/String-Utility-Belt/string-utility-belt/issues), or write to
[contact@stringutilitybelt.com](mailto:contact@stringutilitybelt.com).

## License

MIT. See the LICENSE file.
