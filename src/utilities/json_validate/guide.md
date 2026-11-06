---
title: Validate JSON Online: Check Syntax, See the Exact Error
description: Validate JSON syntax online and see the exact error, line, column and source excerpt; optionally allow JSON5-style comments and trailing commas.
---
## What does a JSON validator check?

Most JSON errors (a missing comma, an unclosed brace, a stray trailing comma) are invisible until something tries to parse the document and fails. This tool runs a full JSON parser over your input and reports either that it's valid, or exactly what's wrong: the error message, the line and column where it occurs, and a short excerpt of that line so you don't have to hunt for it. It never guesses at a fix; it tells you precisely where the parser gave up.

## How it works

A valid document reports `valid: true` with every other field `null`:

```example
title: a valid document
input: {"id":1,"name":"Ada"}
output:
{
  "valid": true,
  "error": null,
  "line": null,
  "column": null,
  "excerpt": null
}
```

An invalid document reports the problem's exact position. Line and column are both 1-based, and the excerpt shows the offending line (truncated with `…` if it's very long):

```example
title: a trailing comma is rejected in strict mode
input: {"id":1,"name":"Ada",}
output:
{
  "valid": false,
  "error": "trailing comma is not allowed in strict JSON",
  "line": 1,
  "column": 21,
  "excerpt": "{\"id\":1,\"name\":\"Ada\",}"
}
```

Under the hood, strict mode checks the input with the JavaScript engine's native `JSON.parse`, which is the authority on whether it's really valid. But its error text is engine-specific and doesn't always pinpoint the problem. So on failure, the tool re-scans the input with its own hand-written parser whose only job is to walk up to the first syntax error and report exactly where it is. (With strict off, that hand-written scanner alone decides validity.)

### Strict vs. lenient mode

Turning **strict (RFC 8259)** off switches the scanner to a JSON5/JSONC-flavored grammar: `//` and `/* */` comments, trailing commas, single-quoted strings, unquoted object keys, and numbers with a leading `+` or a leading dot are all accepted. This is useful for validating config files (`.jsonc`, `tsconfig.json`-style files) that intentionally aren't strict JSON:

```example
title: the same trailing comma is fine with strict off
params: {"strict": false}
input: {"id":1,}
output:
{
  "valid": true,
  "error": null,
  "line": null,
  "column": null,
  "excerpt": null
}
```

Whatever mode you use, the check is purely syntactic. It confirms the text can be parsed into a value; it does not check that value against any particular shape or set of required fields. For that, use [json schema validate](/util/json_schema_validate/).

## Options

- **strict (RFC 8259)**: on by default. Off accepts JSON5/JSONC syntax: comments, trailing commas, single quotes, unquoted keys, and hex/`+`/leading-dot numbers.

## Common uses

- Pinpointing a syntax error in hand-edited JSON before it reaches a parser that only gives a vague message.
- Checking JSON pasted from a log, an API response, or a chat message before feeding it into another step.
- Validating `.jsonc`-style config files that intentionally include comments or trailing commas.
- A first pass before [json pretty](/util/json_pretty/) or [json sort keys](/util/json_sort_keys/), both of which need valid JSON to do their job.

## Tips and pitfalls

- Empty input reports `valid: false` with the message `empty input` rather than treating a blank box as trivially valid. There is nothing to parse yet.
- The excerpt is capped at 120 code points; a very long line is trimmed around the error position with `…` markers rather than dumped in full.
- Column counts code points, not UTF-16 units, so a line containing an emoji before the error still reports the column a person would count by eye.
- If your source legitimately uses JSON5 or JSONC syntax and you want the strict JSON equivalent rather than just a validity check, use [json5 / jsonc parse](/util/json5_parse/) instead. It converts rather than just reports.
