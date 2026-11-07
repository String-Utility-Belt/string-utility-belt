---
title: Add Prefix to Each Line Online: Prefix, Suffix or Quotes
description: Add a prefix to each line of text online, a suffix, or both, such as quotes around every line; skip blank lines automatically or join all onto one line.
---
## What does adding a prefix or suffix to lines do?

This tool decorates every line of a multi-line text with a fixed prefix, a fixed suffix, or both. Use it to turn a plain list into Markdown bullets, HTML list items, quoted SQL values, or anything else that needs the same wrapper repeated on every line. It is the fastest way to build a repetitive structure around a list of values without writing a script.

## How it works

**Prefix** is added to the start of each line and **suffix** to the end. Either can be used alone, or both together:

```example
title: add a bullet prefix to every line
params: {"prefix": "- "}
input:
a
b
output:
- a
- b
```

By default, **skip blank lines** leaves lines that are empty (or only whitespace) untouched, so you don't end up with a bare prefix sitting on an otherwise empty line:

```example
title: blank lines are skipped by default
params: {"prefix": "> "}
input:
a

b
output:
> a

> b
```

**Join with** changes the output from one affixed line per line of input into a single line, with every affixed item glued together by the string you give it. This is the shape you need for building something like a SQL `IN (...)` list from a column of values, and a skipped blank line is dropped entirely rather than turning into an empty item:

```example
title: build a SQL IN-list from a column of values
params: {"prefix": "'", "suffix": "'", "joinWith": ", "}
input:
apple
banana
cherry
output: 'apple', 'banana', 'cherry'
```

The prefix, suffix and join fields understand a few backslash escapes for characters that are awkward to type into a single-line box: `\t` for tab, `\n` for newline, `\r` for carriage return, and `\\` for a literal backslash. An escape sequence the tool does not recognize is left exactly as typed, so a LaTeX or regex snippet survives untouched instead of being misread as an escape:

```example
title: an unrecognized escape is kept exactly as typed
params: {"prefix": "\\item "}
input: x
output: \item x
```

## Options

- **prefix**: text added to the start of every line (except skipped blank lines). Understands `\n`, `\r`, `\t`, `\0` and `\\` escapes.
- **suffix**: text added to the end of every line (except skipped blank lines). Same escapes as prefix.
- **skip blank lines**: when on (the default), a line that is empty or all whitespace is left alone instead of getting the prefix and suffix. When off, every line is affixed, blank or not.
- **join with (blank = newline)**: when set, the affixed lines are joined into a single line with this string instead of being separated by newlines. A skipped blank line is dropped from the joined result rather than appearing as an empty item.

## Common uses

- Turning a plain list of values into a Markdown bullet list or an HTML `<li>` list.
- Building a SQL `IN ('a', 'b', 'c')` clause or a quoted, comma-separated list from a column of values.
- Adding a comment marker or a fixed indent to every line of a code snippet.
- Wrapping each line in a tag or delimiter before feeding it into another format.

## Tips and pitfalls

- An empty document stays empty regardless of the options. A blank input never turns into a bare prefix/suffix pair sitting on nothing.
- Leaving prefix, suffix and join with all empty is a deliberate no-op that returns the input unchanged (apart from mixed line endings, below), which is a safe way to add this step to a pipeline before deciding what to configure.
- When **join with** is not used, the document's line ending and its trailing newline are preserved. Lines are split on LF, CRLF or a lone CR and rejoined with one ending for the whole document (CRLF if it appears anywhere in the input), so a file with mixed endings comes out uniform. With **join with**, a trailing newline is dropped.
- To add line numbers rather than a fixed prefix, use [number lines](/util/number_lines/) instead.
- To reverse the order of the lines rather than decorate them, use [reverse line order](/util/line_reverse/); to add or remove consistent leading whitespace instead of a custom prefix, use [indent / dedent](/util/indent/).
