---
title: Unescape JSON String Online: Decode Escape Sequences
description: Unescape a JSON string online: decode \n, \t, \", \\ and \uXXXX escape sequences back to plain text, such as the escaped JSON inside a log line.
---
## What does unescaping a JSON string mean?

A JSON string value can contain escape sequences for characters that aren't allowed literally inside it: a quote (`\"`), a backslash (`\\`), a newline (`\n`), a tab (`\t`), and any character written as `\uXXXX`. This tool takes the *body* of a JSON string (the part that would sit between the quotes) and decodes those escapes back to plain text, exactly the way `JSON.parse` would. It's the counterpart to [JSON escape](/util/json_escape/), and useful whenever you have JSON-escaped text outside of a JSON document, copied from a log line, a config file, or an API response you're reading by hand.

## How it works

Internally the tool wraps your input in quotes and runs it through `JSON.parse`, so the decoding is exactly what any JSON parser would produce, with no approximation.

```example
title: newline and tab escapes
input: line1\nline2\ttabbed
output: line1
line2	tabbed
```

Quotes and backslashes decode back to single characters:

```example
title: quotes
input: say \"hello\"
output: say "hello"
```

```example
title: backslashes
input: a\\b
output: a\b
```

### Unicode escapes

A `\uXXXX` escape decodes to the character at that code point, the same as JSON's own rules:

```example
title: a unicode escape decodes to its character
input: \u0041\u00e9
output: Aé
```

Characters outside the Basic Multilingual Plane may appear literally in JSON, but when they are escaped JSON has to write them as a UTF-16 surrogate pair (two consecutive `\u` escapes), which decode back to a single character:

```example
title: a surrogate pair decodes to one emoji
input: \ud83d\ude00
output: 😀
```

## Common uses

- Reading the real text behind a JSON-escaped value copied from a log line, browser dev tools, or an API response viewed as raw text.
- Reversing output from [JSON escape](/util/json_escape/) to recover the original string.
- Cleaning up JSON string bodies extracted from a larger document for editing or display elsewhere.
- Debugging garbled text that turns out to still be JSON-escaped (`\n` showing up as two literal characters instead of a line break).

## Tips and pitfalls

- The input should be the *body* of a JSON string, without its own surrounding quotes. This tool adds them internally before parsing.
- Because decoding goes through `JSON.parse`, invalid or incomplete escape sequences (an unterminated `\u`, a lone trailing backslash, an unescaped control character such as a literal newline) throw an error rather than guessing at intent. So does a bare `"`, because it would end the string early.
- This only understands JSON's own escape rules. For source-code string literals in a specific programming language (which mostly overlap with JSON's but add things like `\xNN` or octal escapes), use [code string unescape](/util/code_string_unescape/) instead.
- To go the other direction, use [JSON escape](/util/json_escape/). If your text mixes Unicode escapes into ordinary text that isn't valid JSON, or uses other styles (`\u{...}`, Python's `\U0001F600`, CSS or HTML numeric entities), [unicode unescape](/util/unicode_escape_decode/) covers those.
