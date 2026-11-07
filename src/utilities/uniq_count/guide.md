---
title: Uniq Count Online: Count Duplicate Lines (uniq -c)
description: Count duplicate lines online: how many times each line appears, sorted by frequency or alphabetically, as tab-separated text or JSON, like uniq -c.
---
## What does counting duplicate lines do?

This tool tallies how many times each distinct line occurs in a block of text and reports the counts.
It does the same job as the Unix pipeline `sort | uniq -c | sort -rn`, without needing a terminal (unlike a bare
`uniq -c`, it counts repeats anywhere in the input, not just adjacent ones). It is
useful for turning a raw log file, a column of exported values, or a list of survey answers into a
frequency table: which values show up most, which are one-offs, and how many distinct values there are in
total.

## How it works

The input is split into lines (LF, CRLF or a lone CR), and each distinct line is counted as it appears;
the output rows are joined with LF. By default the result is
sorted with the most frequent line first and rendered as `count`, a separator, then the line:

```example
title: count-desc is the default sort
input:
a
b
a
c
b
a
output:
3	a
2	b
1	c
```

Set **format** to `json` to get the same information as structured data instead, including the total
number of lines and the number of distinct lines:

```example
title: json format
params: {"format": "json"}
input:
a
b
a
c
b
a
output:
{
  "totalLines": 6,
  "uniqueLines": 3,
  "entries": [
    {
      "line": "a",
      "count": 3
    },
    {
      "line": "b",
      "count": 2
    },
    {
      "line": "c",
      "count": 1
    }
  ]
}
```

Sorting alphabetically (`sort: "alpha"`) uses dictionary order, not raw character-code order, so a
lowercase word sorts next to its capitalized counterpart instead of every capitalized line being grouped
first. This example also swaps in a readable `" | "` separator instead of the default tab:

```example
title: alphabetical sort uses dictionary order, not ASCII order
params: {"sort": "alpha", "separator": " | "}
input:
banana
apple
banana
Cherry
output:
1 | apple
2 | banana
1 | Cherry
```

Turn on **only duplicates** to hide lines that only occur once, leaving just the repeated ones:

```example
title: only duplicates hides one-off lines
params: {"onlyDuplicates": true, "separator": " | "}
input:
a
b
a
output: 2 | a
```

## Options

- **sort**: `count-desc` (default, most frequent first), `count-asc` (least frequent first), `alpha`
  (dictionary order, comparing lowercased lines when **ignore case** is on), or `original`
  (first-appearance order). Lines with equal counts keep the order they first appeared in.
- **separator**: the text placed between the count and the line, `\t` (a tab) by default. It accepts
  the typed escapes `\t`, `\n`, `\r`, `\0` and `\\`, or any literal text such as `" | "`.
- **ignore case**: off by default. When on, lines that differ only by case are counted together and
  sorted together (using the case of whichever version appeared first).
- **trim lines**: off by default. When on, leading and trailing whitespace is removed from each line
  before counting, so `"  a  "` and `"a"` are the same entry.
- **only duplicates**: off by default. When on, lines that occur exactly once are left out of the result
  entirely, so only repeated lines are shown.
- **format**: `count-line` (default, `count` then the line), `line-count` (the line then the count), or
  `json` (an object with `totalLines`, `uniqueLines`, and an `entries` array of `{ line, count }`).

## Common uses

- Finding the most common values in a column of exported data (status codes, referrers, error messages)
  without opening a spreadsheet.
- Spotting duplicate rows in a list before deduplicating it with [remove duplicate lines](/util/line_dedupe/).
- Building a quick word- or value-frequency report from log files or survey exports; for counting words
  within running prose instead of whole lines, see [word frequency](/util/word_frequency/).
- Pairing with [line set operations](/util/set_operations/): that tool tells you which lines two lists
  share or don't, while this one tells you how often each line repeats within a single list.
- Counting duplicates in a list or in rows pasted from a spreadsheet column, one value per line.

## Tips and pitfalls

- A trailing newline at the end of the input does not create a phantom empty line. The tool ignores the
  final line break the same way most text editors do.
- Counting is exact per line, including whitespace, unless you turn on **trim lines**: `"a"` and `"a "`
  are different entries by default.
- The alphabetical sort uses the JavaScript engine's locale-aware string comparison (`localeCompare`, as
  [line sort](/util/line_sort/)'s alphabetical mode does), so it is not simply sorting by character code:
  accented letters and mixed case sort roughly the way a dictionary would. Because it follows the browser's
  default locale, the exact order of accented or non-Latin lines can differ slightly between machines.
- `json` output is the easiest format to feed into another tool or script; the text formats are meant for
  reading directly or pasting into a report.
