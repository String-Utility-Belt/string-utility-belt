---
title: JSON to Curl Command Converter Online
description: Turn JSON describing an HTTP request into a runnable curl command online, in POSIX or PowerShell syntax, with a pretty-printed JSON body.
---
## What does curl build do?

This is the reverse of [curl command to json](/util/curl_parse/): give it a JSON object describing an HTTP request (method, URL, headers, body, auth, form fields and curl flags), and it writes out a `curl` command you can paste straight into a terminal, in either POSIX shell or PowerShell syntax.

## How it works

The input is a JSON object with a `url` (the only required field) and any of `method`, `headers`, `body`, `auth`, `form` and `flags`:

```example
title: a POST request with a JSON body
input:
{
  "method": "POST",
  "url": "https://api.example.com/users",
  "headers": { "Content-Type": "application/json" },
  "body": "{\"name\":\"Ada\"}"
}
params: {"multiline": true, "flavor": "posix", "pretty": true}
output: curl -X POST 'https://api.example.com/users' \
  -H 'Content-Type: application/json' \
  --data-raw '{
  "name": "Ada"
}'
```

The method is only written explicitly when it isn't the one curl would infer anyway. A `GET` with no body is left off entirely, and `HEAD` is emitted as `-I` rather than `-X HEAD`, because `-X HEAD` makes curl wait for a response body that a HEAD request never sends:

```example
title: HEAD uses -I, not the hanging -X HEAD
input: {"method": "HEAD", "url": "https://x.test", "flags": {"head": true}}
params: {"multiline": false}
output: curl -I 'https://x.test'
```

Set `flavor` to `powershell` to get double-quoted arguments with backtick escaping and `curl.exe` instead of `curl` (needed on Windows, where `curl` is often a PowerShell alias for `Invoke-WebRequest` rather than the real curl binary):

```example
title: powershell quoting and curl.exe
input:
{
  "method": "POST",
  "url": "https://api.example.com/items",
  "headers": { "Content-Type": "application/json" },
  "body": "{\"a\":1}"
}
params: {"multiline": false, "pretty": false, "flavor": "powershell"}
output: curl.exe -X POST "https://api.example.com/items" -H "Content-Type: application/json" --data-raw "{`"a`":1}"
```

An embedded quote in a value is escaped for the chosen shell's quoting rules, so the shell hands curl the exact value you wrote:

```example
title: an embedded single quote is escaped for posix
input: {"url": "https://x.test", "body": "it's fine"}
params: {"multiline": false, "pretty": false}
output: curl 'https://x.test' --data-raw 'it'\''s fine'
```

## Options

- **break across lines**: on by default, splitting the command across multiple lines, one flag per line, each ending in a backslash (or, for PowerShell, a backtick character) so the shell reads it as one command.
- **shell flavor**: `posix` (default, single-quoted) or `powershell` (double-quoted with backtick escaping and `curl.exe`).
- **pretty-print a json body**: on by default; if the request body parses as JSON, it's reformatted with 2-space indentation before being embedded in `--data-raw`.

## Common uses

- Turning a saved API request (from a test fixture or hand-written JSON) into a command you can run and tweak from a terminal.
- Producing a reproducible curl command to paste into a bug report or support ticket.
- Converting between the JSON shape this tool understands and a runnable command as part of an API-testing workflow, round-tripping through [curl command to json](/util/curl_parse/).
- Generating request examples for documentation in both POSIX and PowerShell syntax from the same JSON source.

## Tips and pitfalls

- The method is inferred as `POST` whenever a `body` or `form` is present and the `get` flag isn't set. Set `method` explicitly if you need `PUT` or `PATCH` instead.
- A form field's `value` starting with `@` or `<` makes curl read a file (`@` attaches it as an upload, `<` uses its contents as the field value). Set that field's `type` to `"text"` to emit `--form-string` instead, so a literal value starting with `@` isn't mistaken for a file path.
- Windows PowerShell 5.1 (and PowerShell 7 before 7.3) strips embedded double quotes from arguments it passes to native programs such as `curl.exe`, so a JSON body can reach curl as `{a:1}`. Run the `powershell` flavor in PowerShell 7.3 or later, use the `posix` flavor in a POSIX shell such as Git Bash or WSL, or skip `curl.exe` altogether with [json to powershell request](/util/powershell_request_build/), which writes the same request as a native `Invoke-RestMethod` command.
- Missing `url` throws immediately with a clear message, since curl has nothing to run without one.
- To go from an existing header block to the `headers` object this tool expects, use [http headers to json](/util/http_headers_parse/) and copy its `headers` object into your request.
