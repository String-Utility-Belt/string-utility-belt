---
title: Curl to JSON Converter Online: Parse a Curl Command
description: Convert a curl command to JSON online: method, URL, headers, body, auth and form fields parsed out, with shell quoting handled for you.
---
## What does curl parse do?

Browser DevTools, Postman and Chrome's "Copy as cURL" all let you export a request as a `curl` command line. But a command line is awkward to feed into a test, a script, or documentation. This tool parses a `curl` command into structured JSON: method, URL, headers, body, authentication and form fields, handling the shell quoting that real curl commands are pasted with (single and double quotes, `$'...'` ANSI-C quoting, and line continuations from bash, `cmd.exe` or PowerShell).

## How it works

Paste a `curl` command and get back its request shape:

```example
title: a POST with a header and a JSON body
input: curl -X POST https://api.example.com/users -H "Content-Type: application/json" -d '{"name":"Ada"}'
output:
{
  "method": "POST",
  "url": "https://api.example.com/users",
  "headers": {
    "Content-Type": "application/json"
  },
  "body": "{\"name\":\"Ada\"}",
  "auth": null,
  "flags": {
    "compressed": false,
    "insecure": false,
    "location": false,
    "get": false
  }
}
```

A command copied from a browser often spans several lines with `\`-continuations. Those are joined back into one command before parsing, exactly as a real shell would:

```example
title: a multi-line command with a continuation
input: curl 'https://api.example.com/v1/items?page=2' \
  -X POST \
  -H 'Content-Type: application/json' \
  --data-raw '{"name":"café ☕"}' \
  --compressed
output:
{
  "method": "POST",
  "url": "https://api.example.com/v1/items?page=2",
  "headers": {
    "Content-Type": "application/json"
  },
  "body": "{\"name\":\"café ☕\"}",
  "auth": null,
  "flags": {
    "compressed": true,
    "insecure": false,
    "location": false,
    "get": false
  }
}
```

`-u` becomes a structured `auth` object. `-A` (user agent) and `-e` (referer) become ordinary `User-Agent` and `Referer` headers, since that's what they are on the wire, and so does `-b` when it carries `name=value` cookies (a `-b` value without `=` names a cookie file and is recorded as a `cookie-file` flag):

```example
title: auth, cookie and user-agent flags
input: curl 'https://x.test' -u 'alice:s3cret' -A 'my-agent/1.0' -e 'https://ref.test' -b 'sid=42'
output:
{
  "method": "GET",
  "url": "https://x.test",
  "headers": {
    "User-Agent": "my-agent/1.0",
    "Referer": "https://ref.test",
    "Cookie": "sid=42"
  },
  "body": "",
  "auth": {
    "user": "alice",
    "password": "s3cret"
  },
  "flags": {
    "compressed": false,
    "insecure": false,
    "location": false,
    "get": false
  }
}
```

The method is inferred when `-X`/`--request` isn't given: `-I`/`--head` implies `HEAD`, `-T`/`--upload-file` implies `PUT`, a body or form field implies `POST`, and anything else defaults to `GET` (or stays `GET` even with a body when `-G`/`--get` is set, which is how curl sends data as a query string instead):

```example
title: -G keeps the request a GET (curl would send the data as a query string)
input: curl -G 'https://x.test' -d 'q=1' -d 'p=2'
output:
{
  "method": "GET",
  "url": "https://x.test",
  "headers": {},
  "body": "q=1&p=2",
  "auth": null,
  "flags": {
    "compressed": false,
    "insecure": false,
    "location": false,
    "get": true
  }
}
```

## How the tokenizer and flags work

The tokenizer understands everything curl commands are typically pasted with: single quotes (literal), double quotes (where a backslash escapes a double quote, a backslash, a `$` or a backtick character), bash's `$'...'` ANSI-C quoting (`\n`, `\t`, `\uXXXX`, octal escapes), backslash line continuations from bash, and caret or backtick continuations from `cmd.exe`/PowerShell. A wide set of long (`--header`, `--data-raw`, `--form`, …) and short (`-H`, `-d`, `-F`, …) flags are recognized and folded into the right JSON field; an unrecognized flag's *value* can end up looking like a stray positional argument, so the URL is picked as whichever positional token actually looks like one rather than just the first.

This utility takes no parameters. Its output shape is fixed, always including `method`, `url`, `headers`, `body`, `auth` and the four core `flags` (`compressed`, `insecure`, `location`, `get`), plus a `form` array when `-F`/`--form`/`--form-string` fields are present. Any other flag it sees is added to `flags` too, as `true` or with its value (`"silent": true`, `"max-time": "10"`).

## Common uses

- Turning a "Copy as cURL" export from browser DevTools into a request object for a test fixture or API client.
- Documenting an API endpoint's exact request shape from a working curl example.
- Feeding the parsed JSON into [json to curl command](/util/curl_build/) to reformat it, switch it to PowerShell syntax, or edit a field and regenerate the command.
- Turning a saved curl command's `headers` object into a raw header block with [json to http headers](/util/http_headers_build/) (pass it the `headers` object on its own).

## Tips and pitfalls

- Repeated headers (two `-H 'X-A: 1' -H 'X-A: 2'`) fold into a JSON array rather than overwriting each other, matching how curl actually sends them.
- `--data-urlencode` percent-encodes its value the way curl itself does. It leaves only the RFC 3986 unreserved characters untouched, which is a stricter set than JavaScript's `encodeURIComponent`.
- Input that doesn't start with `curl` or `curl.exe` (after skipping a shell prompt or leading `VAR=value` assignments) throws immediately, so a wrong tool's command line is never silently misparsed.
- An unterminated quote, a flag that needs a value but doesn't get one, or a malformed `-H` header (no colon) all throw with a specific, actionable message.
