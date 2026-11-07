---
title: Remove Duplicate Lines Online: Line Deduplicator
description: Remove duplicate lines online, keeping the first copy of each in place: works on any list or text, with optional case-insensitive matching, like Unix uniq.
---
## What does deduplicating lines do?

Given a block of text, this tool removes every line that has already appeared earlier, keeping only the first occurrence of each distinct line and preserving the original order. It is the same idea as piping sorted or unsorted text through Unix `uniq`, except this tool does not require the input to be sorted first.

## How it works

The input is split into lines on `\n`. Each line is checked against the set of lines already seen: if it is new, it is kept and remembered; if it has been seen before, it is dropped. The surviving lines are joined back together in their original order.

```example
title: default, case-sensitive deduplication
input: a
b
a
c
output: a
b
c
```

Turning off **case sensitive** folds letters to lowercase before comparing, so lines that only differ in capitalization are treated as duplicates and only the first spelling is kept:

```example
title: case-insensitive deduplication keeps the first spelling
params: {"caseSensitive": false}
input: Hello
hello
HELLO
world
output: Hello
world
```

A line that never repeats is left alone, and a block where every line is identical collapses to a single line:

```example
title: no duplicates means no lines are removed
input: a
b
c
output: a
b
c
```

Empty input produces empty output:

```example
title: empty input
input:
output:
```

## Options

- **case sensitive** (`caseSensitive`, default `true`): when `true`, lines must match exactly, including capitalization, to count as duplicates. When `false`, matching is done on the lowercased line, but the line kept in the output is the first (original-case) spelling encountered.

## Common uses

- Cleaning up a list of URLs, email addresses, or log lines that contains repeats.
- Deduplicating a word or tag list before further processing.
- Removing accidental repeated rows after concatenating several files or exports together.
- Deduplicating rows copied from a spreadsheet column, which paste as one line per row.

## Tips and pitfalls

- This tool only recognizes `\n` as a line break. With Windows-style `\r\n` endings the `\r` stays part of each line's content, so the last line (which has no `\r` after it), or any line in a file with mixed endings, will not match its duplicates. Run [normalize line endings](/util/normalize_line_endings/) first to avoid that.
- Blank lines are lines too: only the first empty line is kept, so paragraph breaks after the first one disappear, and if the text ends with a newline after an earlier blank line, that final newline is removed as a duplicate.
- Order is always preserved. The first occurrence of a line is what survives, not necessarily the "best" or most complete one, so if later duplicates carry extra detail you will lose it.
- Whitespace differences count: a line with a trailing space is not considered a duplicate of the same line without one. Run [trim lines](/util/trim_lines/) beforehand if you want to ignore that.
- To sort lines instead of, or in addition to, deduplicating them, see [sort lines](/util/line_sort/), which has its own `unique` option that removes duplicates as part of sorting.
