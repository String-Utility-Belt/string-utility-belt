---
title: Remove Invisible Characters Online: Hidden Unicode, AI Text
description: Remove invisible characters from ChatGPT output or any pasted text: zero-width, bidi, control and variation-selector marks, or reveal each as U+XXXX.
---
## What are invisible characters?

Unicode includes a number of code points that carry no visible glyph of their own: zero-width spaces used to allow word wrapping without a visible gap, bidirectional (bidi) control characters that change text direction for mixed left-to-right/right-to-left content, variation selectors that pick a glyph variant (such as emoji or text presentation) for the character before them, and leftover C0/C1 control codes. Most of the time these are legitimate and harmless. But they can also be used to hide extra content inside a string, make two visually identical strings compare as different, or smuggle text past a naive filter. This tool finds them.

## How it works

Give it text, and it scans code point by code point for anything on its list of invisible characters: zero-width spaces and joiners, the word joiner and invisible math operators, directional marks and bidi embedding/override/isolate controls, the byte order mark, soft hyphen, variation selectors, tag characters, and control characters other than tab, newline and carriage return (which are left alone as legitimate formatting).

```example
title: list every invisible character found
params: {"mode": "list"}
input: a​b​c
output:
[
  {
    "codePoint": "U+200B",
    "name": "ZERO WIDTH SPACE",
    "index": 1
  },
  {
    "codePoint": "U+200B",
    "name": "ZERO WIDTH SPACE",
    "index": 3
  }
]
```

The `index` in each entry counts code points, not UTF-16 units, so an emoji or other astral character earlier in the string is still counted as one position, matching what you would see stepping through the text character by character.

### Removing or revealing them

**remove** (the default) drops every invisible character it finds and returns the rest of the text untouched:

```example
title: remove them
params: {"mode": "remove"}
input: a​b
output: ab
```

**reveal** keeps the visible text but replaces each invisible character with a readable `‹U+XXXX›` marker, so you can see exactly where one was hiding and what it was:

```example
title: reveal them as markers instead of deleting them
params: {"mode": "reveal"}
input: a​b
output: a‹U+200B›b
```

### What is left alone

Ordinary spacing characters that are simply wider or narrower than a regular space (the non-breaking space, the em space, the ideographic space) are visible spacing, not hidden junk, and this tool leaves them untouched in every mode:

```example
title: a non-breaking space is not treated as invisible
params: {"mode": "remove"}
input: a b
output: a b
```

## Options

- **mode**: `remove` (default, strip invisible characters and return plain text), `reveal` (replace each one with a visible `‹U+XXXX›` marker) or `list` (return a JSON array of every invisible character found, with its code point, name and position).

## Common uses

- Auditing pasted text (from a chat app, a resume, a form submission) for hidden characters before it goes into a form, a filename, or a comparison.
- Investigating why two strings that look identical do not compare as equal, or why a supposedly duplicate entry was not caught by a deduplication check.
- Stripping zero-width characters and stray control codes that sneak in from copy-paste, particularly from web pages and PDFs, before further processing.
- Detecting a class of Unicode-based obfuscation or steganography, where hidden characters are used to encode extra data invisibly inside ordinary-looking text.

## Tips and pitfalls

- This tool targets a well-defined list of known-invisible code points; it does not flag visible-but-unusual characters such as look-alike letters from another script. Pair it with [unicode inspect](/util/unicode_inspect/) if you need to check for those too.
- Tab, newline and carriage return are deliberately never touched, since they are legitimate formatting rather than hidden content. Only the rest of the C0/C1 control ranges, plus DEL, count as invisible here.
- A tag-character sequence used for a flag emoji variant (like the England flag, a black flag followed by hidden tag characters) will have its tag characters stripped by `remove`, leaving just the base black flag emoji.
- Emoji variation selectors (which choose between emoji-style and text-style rendering of a character) are included in the invisible list, so `remove` can visibly change emoji: without its U+FE0F selector, a red heart may fall back to a plain text-style ❤.
- The zero width joiner (U+200D) is removed too, and it is what glues multi-person and other combined emoji together: a family emoji falls apart into its separate people. Removing the zero width non-joiner (U+200C) can likewise change how Persian and several Indic scripts are displayed. Use `list` or `reveal` first when the text contains emoji or non-Latin scripts.
