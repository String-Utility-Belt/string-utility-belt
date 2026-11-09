---
title: TOML to JSON Converter: Parse TOML Online
description: Convert TOML to JSON online or from the CLI: tables, array-of-tables, dotted keys and dates handled, with a configurable indent or minified output.
---
## What is TOML to JSON conversion?

TOML is the configuration format behind tools like Cargo, Poetry and many app config files, but most code that consumes configuration at runtime (a web server, a build script, a browser app) wants plain JSON. This tool parses a TOML document and re-emits it as JSON, so you can read a `Cargo.toml` or `pyproject.toml` value from JavaScript, diff a config against a JSON schema, or just inspect a TOML file's structure more easily. [json to toml](/util/json_to_toml/) converts back the other way.

## How it works

The parser reads the TOML document into a value tree and hands it to `JSON.stringify`:

- `[section]` table headers become nested JSON objects.
- `[[section]]` array-of-tables headers become a JSON array of objects, one entry per repeated block.
- Dotted keys (`a.b.c = 1`) are expanded into nested objects the same way a bracketed header would be.
- Inline arrays and tables convert directly to JSON arrays and objects.
- TOML dates and datetimes become ISO 8601 strings. An offset datetime keeps its offset (`1979-05-27T07:32:00+07:00`); a local (offset-less) date, datetime or time keeps its reduced, offset-free form.
- TOML's `inf`, `-inf` and `nan` float values have no JSON equivalent and become `null`.

```example
title: a table becomes a nested object
input: name = "example"
port = 8080
[owner]
name = "Bob"
output: {
  "name": "example",
  "port": 8080,
  "owner": {
    "name": "Bob"
  }
}
```

```example
title: minified output
params: {"indent": 0}
input: name = "x"
output: {"name":"x"}
```

```example
title: array-of-tables becomes a JSON array
params: {"indent": 0}
input: [[x]]
a = 1

[[x]]
a = 2
output: {"x":[{"a":1},{"a":2}]}
```

```example
title: an offset datetime becomes an ISO 8601 string
params: {"indent": 0}
input: d = 1979-05-27T07:32:00Z
output: {"d":"1979-05-27T07:32:00.000Z"}
```

A document that holds only comments parses to an empty object `{}` rather than an error, while empty or whitespace-only input produces empty output.

## Options

- **indent**: the number of spaces used to pretty-print the JSON, from 0 to 10. `0` produces minified, single-line JSON with no extra whitespace. The default is 2.

## Common uses

- Reading values out of a `Cargo.toml`, `pyproject.toml` or `.streamlit/config.toml` file in a JavaScript build step.
- Comparing a TOML config against a JSON Schema with [json schema validate](/util/json_schema_validate/).
- Converting TOML test fixtures to JSON for tools that only understand JSON.
- Converting from the command line: the [subelt](https://www.npmjs.com/package/subelt) CLI runs the same utility, `subelt -i Cargo.toml toml_to_json`, in a script or a CI step with no browser.

## Tips and pitfalls

- Malformed TOML (an unterminated string, a stray `=`) is reported with the underlying parser's message rather than a generic failure.
- TOML's `inf`, `-inf` and `nan` have no JSON form and come through as `null`; check the source TOML if a numeric field unexpectedly turns into `null`.
- TOML integers are 64-bit, but a JavaScript number is exact only up to 2^53 − 1. An integer beyond that (such as `9007199254740993`) is rejected with an error rather than silently rounded.
- If you need to go the other way, [json to toml](/util/json_to_toml/) has the opposite restriction: TOML has no `null`, so it rejects null-valued keys instead of silently dropping them.
