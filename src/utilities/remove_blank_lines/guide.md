---
title: Remove Blank Lines Online: Strip Empty Lines from Text
description: Remove blank lines online: delete every empty or whitespace-only line from text or code, compacting a document down to only the lines that contain content.
---
## What does this tool do?

This tool deletes every line that is empty or contains only whitespace, keeping every other line exactly as it was. It is a quick way to compact a document that has accumulated stray blank lines (from pasting, exporting, or editing) down to just its actual content.

```example
title: empty and whitespace-only lines are both removed
input: a

b
   
c
output: a
b
c
```

## How it works

The text is split into lines, and each line is checked: if trimming its leading and trailing whitespace leaves nothing at all, the line is dropped; otherwise it is kept **exactly as written**, whitespace and all. The remaining lines are then joined back together with a single newline between them, so removing a blank line closes the gap rather than leaving an empty line behind.

```example
title: a line of only spaces or tabs counts as blank too
input: a
   
	
b
output: a
b
```

A line is judged purely by whether anything survives trimming it. A line that's blank in the middle of the text, at the very start, or at the very end is treated the same way.

```example
title: leading and trailing blank lines are removed along with interior ones
input:

hello

world

output: hello
world
```

## Options

This utility has no configurable options. It always removes every blank or whitespace-only line and leaves every other line untouched.

## Common uses

- Cleaning up text copied from a PDF, web page, or email that leaves extra blank lines behind.
- Compacting a log file, config file, or code listing down to just its non-empty lines before reviewing or diffing it.
- Preparing a word or line list (names, URLs, IDs) for a tool that expects one item per line with no gaps.
- Tidying up the output of another step in a pipeline before it feeds into something line-sensitive, such as a CSV or JSONL parser.

## Tips and pitfalls

- This tool only removes lines that are blank; it does not trim whitespace from the lines it keeps. If a kept line has leading or trailing spaces, use [trim_lines](/util/trim_lines/) as a separate step.
- Removing blank lines is not the same as limiting *how many* blank lines appear. Every blank line disappears entirely here, with no gap left behind. If you want to keep single blank lines between paragraphs but collapse runs of several down to one, use [collapse_whitespace](/util/collapse_whitespace/) instead, which limits blank-line runs rather than deleting them outright.
- A line containing only a tab or a run of spaces is blank by this tool's definition even though it is not literally empty, because it checks the line after trimming, not its raw length.
- Since this tool judges each line independently, it works the same regardless of how many blank lines are next to each other, or where in the text they sit.
- For finding and removing duplicate lines rather than blank ones, see [line_dedupe](/util/line_dedupe/).
