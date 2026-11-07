---
title: JSON to .env Converter: Environment Variables Online
description: Convert JSON to .env environment variables online: nested keys flattened to KEY=value lines, with optional upper-casing, custom delimiter and auto-quoting.
---
## What does converting JSON to .env do?

Configuration often starts as JSON (an API response, a settings file) but
needs to end up as `.env`-style `KEY=value` lines for a shell, a Docker
container, or a dotenv-based app to read. This tool flattens a JSON object
into that format: nested objects become underscore-joined keys, arrays
become indexed keys, and every value is quoted only when it needs to be, so
a dotenv-style parser reads it back as written.

## How it works

1. Only a JSON object at the root is accepted. Arrays and scalars at the
   top level are rejected, since there is no key to attach them to.
2. Each nested object is walked depth-first; a key path like `db.host`
   becomes `DB_HOST` (joined with the **path delimiter**, `_` by default).
   An array is walked the same way, with its index as the next path
   segment (`tags.0` → `TAGS_0`).
3. Every path segment is sanitized: each run of characters that are not
   Unicode letters, digits, or underscores is replaced with `_`, so spaces,
   dashes, and dots cannot break the `KEY=value` syntax. Non-ASCII letters
   (`café` → `CAFÉ`) and a leading digit are kept, even though POSIX shells
   only accept ASCII letters, digits, and underscores, not starting with a
   digit.
4. Keys are upper-cased by default (**upper-case keys**); turn this off to
   keep the original casing.
5. **quoting** decides when a value is wrapped in quotes: `auto` (the
   default) quotes only values that need it (those with leading/trailing
   whitespace or shell-significant characters like spaces, `#`, `$`, or
   backticks), `always` quotes everything, and `never` never quotes,
   escaping any embedded newline as `\n` instead so the record still fits
   on one line.

```example
title: flat and nested keys
input: {"port":3000,"debug":true,"db":{"host":"localhost"}}
output: PORT=3000
DEBUG=true
DB_HOST=localhost
```

```example
title: always quote every value
params: {"quote": "always"}
input: {"greeting":"hi there"}
output: GREETING="hi there"
```

A value containing `$` or a backslash is wrapped in single quotes instead of
double quotes when possible (no line break and no `'` in the value), since
single quotes keep `$` and backslashes literal:

```example
title: shell metacharacters stay literal in single quotes
input: {"cmd":"echo $HOME"}
output: CMD='echo $HOME'
```

Characters that are not letters, digits, or underscores are replaced with
`_` in the key name:

```example
title: illegal characters in a key are sanitized
input: {"my key-name":"1"}
output: MY_KEY_NAME=1
```

## Options

- **upper-case keys**: on by default (`PORT`); off keeps the original
  casing (`port`).
- **path delimiter**: the string joining nested path segments, default
  `_` (so `DB_HOST`); set to `__` or anything else you prefer.
- **quoting**: `auto` (default) quotes only values that need it, `always`
  quotes every value, and `never` never quotes (escaping embedded newlines
  as `\n` instead). A dotenv parser reads `never` output back less
  faithfully: that `\n` stays two characters, edge whitespace is trimmed,
  and anything after a ` #` is treated as a comment.
- **export prefix**: off by default; on, prefixes every line with
  `export `, for files that will be sourced by a shell (see the caveat
  below).

## Common uses

- Generating a `.env` file for local development from a JSON configuration
  object.
- Producing environment variables for a CI pipeline, or a
  `docker run --env-file` file, from structured JSON. Docker's env-file
  format takes values literally, quotes included, so use **quoting**
  `never` for it.
- Flattening nested settings (`db.host`, `db.port`) into the flat variable
  names most tools expect.

## Tips and pitfalls

- An empty object, or empty input, produces no output at all. There is
  nothing to write a line for.
- `null` becomes an empty value (`KEY=`): the variable is set to an empty
  string, not left unset.
- The output is not shell-escaped. A double-quoted value can still contain
  `$` (when it also holds a `'`) or backticks, which a shell would expand
  or execute on `source`, and `never` leaves spaces unquoted. Only source
  the result in a shell when you trust every value.
- Different JSON paths can collapse to the same name (`a-b` and `a_b`, or
  `db.host` and `db_host`); both lines are written, and a reader keeps the
  last one.
- [.env to json](/util/env_to_json/) reads the resulting file back into
  JSON, but it parses `.env` literally. `DB_HOST` comes back as a flat
  `"DB_HOST"` key, not nested back under `db.host`, since `.env` has no
  native concept of nesting and this tool's flattening is one-directional.
- For a config format that supports sections natively instead of
  underscore-joined keys, consider [json to ini](/util/json_to_ini/).
