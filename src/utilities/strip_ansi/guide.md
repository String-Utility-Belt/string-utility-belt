---
title: Strip ANSI Codes Online: Remove Terminal Color Codes
description: Remove ANSI escape sequences (SGR colors, cursor moves, OSC titles and hyperlinks) from captured terminal output, or keep just the readable text they carry.
---
## What are ANSI escape sequences?

Terminal programs color and format their output using ANSI escape sequences: short byte sequences starting with the `ESC` character (or its 8-bit equivalents) that tell the terminal to change color, move the cursor, set a window title, or embed a clickable hyperlink. They render invisibly in a real terminal but show up as garbage like `^[[31m` or `←[0m` when that output is captured into a log file, pasted into a text editor, or displayed somewhere that does not understand them. This tool strips that garbage back out.

## How it works

Feed it captured terminal output, and it removes every recognized escape sequence: SGR color and style codes, cursor-movement and screen-erase CSI sequences, and OSC sequences (window titles, OSC 8 hyperlinks).

```example
title: strip SGR color codes
params: {"mode": "strip"}
input: ␛[31mred␛[0m text
output: red text
```

Cursor movement and screen-clearing codes are removed the same way as color codes, while ordinary text, whitespace and Unicode characters pass through completely untouched. Only escape sequences are removed: a bare control character that is not part of one (a carriage return from a progress bar, a backspace, a lone BEL) is left in place.

### Keeping the readable text from OSC sequences

Some ANSI sequences carry human-readable content inside their control bytes: a window title, or the URL of an OSC 8 hyperlink. (A hyperlink's visible label is ordinary text between two OSC 8 sequences, so both modes keep it.) **Strip** mode drops that content along with the escape framing; **keep-text** mode extracts and keeps it instead, which is useful when you want the substance of a hyperlink or title without the raw formatting codes.

```example
title: strip mode drops OSC payloads entirely
params: {"mode": "strip"}
input: ␛]0;my title␇hello
output: hello
```

```example
title: keep-text mode preserves the readable text
params: {"mode": "keep-text"}
input: ␛]0;my title␇hello
output: my titlehello
```

In the `keep-text` example, the window-title sequence's payload (`my title`) is preserved right where the escape sequence was, immediately followed by the literal text `hello`. There is no separator added, since the tool has no way to know whether one belongs there.

## Options

- **mode**: `strip` (default: remove escape sequences and their payloads entirely) or `keep-text` (remove the escape framing but keep the readable text an OSC sequence carries, such as a title or hyperlink URL).

## Common uses

- Cleaning up terminal output that was copy-pasted into a text file, bug report, or chat message and now shows raw escape codes instead of colors.
- Preparing colorized CLI output for plain-text logging, diffing, or further text processing where the color codes would only get in the way.
- Extracting the actual title or hyperlink text embedded in a terminal's OSC sequences, using `keep-text` mode.
- Removing escape sequences from untrusted terminal-like output before displaying it somewhere that should not execute them. Bare control characters survive, so follow up with [invisible characters](/util/remove_invisible/), which removes C0 and C1 controls other than tab, newline and carriage return.

## Tips and pitfalls

- This is a full ANSI-family parser, not a single "strip color codes" regular expression: it correctly handles CSI (colors, cursor movement), OSC (titles, hyperlinks) terminated by BEL or the string terminator, device control strings (and the similar SOS, PM and APC strings), plain escapes such as `ESC =` or `ESC ( B`, and the 8-bit C1 forms of these sequences (bytes like `0x9B`), so it does not leave partial codes behind the way a narrower regex often does.
- Truncated or malformed escape sequences (for example, output cut off mid-sequence by a buffer limit) throw a clear error rather than silently emitting a corrupted result, since there is no safe way to guess what was meant.
- `keep-text` mode is deliberately defensive: it never lets a nested or malformed escape sequence hiding inside an OSC payload leak back out into the output as a live escape sequence.
- If you only need to know whether text contains any escape sequences at all rather than remove them, [unicode inspect](/util/unicode_inspect/) or [remove invisible characters](/util/remove_invisible/) can help identify the specific control characters present.
