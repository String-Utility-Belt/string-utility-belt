---
title: Decode Stringified JSON Online: Unescape and Pretty-Print
description: Decode stringified JSON into indented JSON: backslashes removed, outer quotes stripped, one or two layers undone, and valid JSON only reformatted.
---

## Why one unescape or one formatter is not enough

Stringified JSON is JSON encoded as a string: every quote inside it is escaped as `\"`, and often the whole thing is wrapped in quotes. It turns up wherever a document is stored as a string value. Docker's default json-file logging driver stores each line your app prints as the string value of a `log` field. An API Gateway proxy integration hands Lambda the request body as a string in `body`. And code that encodes a value that is already a JSON string, such as `res.json(JSON.stringify(data))` in Express or `requests.post(url, json=json.dumps(payload))` in Python, sends a JSON string literal instead of an object: the browser's Network tab shows the response wrapped in quotes, and `await response.json()` resolves to a string. Log that body as a JSON field and the copy you read later has two layers.

A formatter that only parses and re-indents does not help. Given `{\"id\":42}` it reports a syntax error; given `"{\"id\":42}"` it succeeds and prints the same string back, because a quoted string is valid JSON. A single unescape pass removes one layer, so a value encoded twice still comes out full of backslashes. Running an unescape over text that is already valid JSON is worse: it turns the escaped quotes inside values into bare quotes and breaks the document.

## What each step does, and why in this order

To decode stringified JSON properly, remove exactly as many layers as it has and then format what is left. [trim](/util/trim/) runs first because the unescape step strips the outer quotes only when they are the very first and last characters, and a value copied from a terminal often ends with a newline. [code string unescape](/util/code_string_unescape/), set to JSON, then removes one layer: it drops the surrounding quotes if there are any and decodes `\"`, `\\`, `\n`, `\uXXXX` and the other escapes listed in [RFC 8259](https://www.rfc-editor.org/rfc/rfc8259#section-7), rejecting any escape JSON does not define.

The same step appears twice, each guarded by a condition: it runs only when the text starts with a quote (double or single, escaped or not) or a backslash follows its opening `{` or `[`. An object or array that is already valid JSON never has a backslash in that position, so it skips both, and the second copy runs only when one pass was not enough. The worked example needs both passes, the Docker log field and the Lambda body need one, and already-valid JSON needs none. The single quote is there for strings copied from Node's or Python's REPL, which show the result of `JSON.stringify` or `json.dumps` in single quotes: `'{"id": 42}'`.

[json pretty](/util/json_pretty/) comes last. It parses the result, so anything that is still not JSON fails here with the parser's message, and prints it with two-space indentation (change the indent to taste). Parsing also decodes escapes that belong inside values: Python's `json.dumps` writes an em dash as `\u2014` by default (its `ensure_ascii` setting), and it comes out as the dash itself.

## What the pipeline does not handle

- **A third layer.** If the output is still a quoted string full of backslashes, add another copy of the unescape step, condition included.
- **Stringified fields inside an object.** In `{"type":"order.paid","payload":"{\"id\":42}"}` the outer object is valid JSON, so it is only pretty-printed and `payload` stays a string. Copy that field's value and run it through again.
- **Escapes and quotes from other languages.** JSON does not define `\'`, but a JavaScript string literal can contain it, and Python's REPL writes it for an apostrophe inside a single-quoted string, as in `'{"name": "O\'Brien"}'`. The strict JSON mode stops with an error there: switch both unescape steps to `javascript` or `python`. Backticks (Node's REPL uses them when a string contains both kinds of quote) and Python's `b'…'` prefix are not stripped. A Python dict printed with `print()` is not JSON at all (single quotes, `True`, `None`), and no unescaping changes that.
- **Big integers.** Parsing uses JavaScript numbers, so an integer larger than 9,007,199,254,740,991 (2^53 − 1) can be rounded: `12345678901234567890` comes out as `12345678901234567000`. If an ID that large matters, read it from the second unescape step's output, before parsing. Parsing also keeps only the last value of a duplicated key.
- **A copied key or trailing comma.** Paste only the value, from its opening quote or bracket to the closing one.

## Doing it in code or on the command line

In code, call `JSON.parse` (or `json.loads` in Python) once per layer of quoting plus once for the JSON itself, and stop when the result is no longer a string: the worked example takes three calls. With jq, `jq 'fromjson | fromjson' value.txt` decodes the worked example saved to a file: jq parses the outer string itself, and each `fromjson` parses one more layer. jq also covers the case this pipeline cannot: `jq '.payload |= fromjson'` expands a stringified field in place. `JSON.parse` and jq both need a complete JSON value, though, so unquoted text from a log has to be wrapped in double quotes first.
