---
title: Strip Characters Online: Remove Punctuation or Emoji
description: Remove characters from a string online: punctuation, special characters, digits, letters, whitespace, emoji, control or non-ASCII characters, or a custom set.
---
## What does stripping characters do?

Stripping characters removes every character that belongs to a chosen category: punctuation, digits, letters, whitespace, non-ASCII characters, non-printable characters, emoji, or a set you type in yourself. It is a fast way to clean up text without writing a regular expression: pick a category, and every matching character is removed (or, with the invert option, every character *except* that category is removed).

## How it works

The **strip** option chooses which category of character counts as a match. Categories are defined using Unicode character properties, not just the ASCII range, so accented letters, non-Latin digits and non-English punctuation are all recognized correctly:

```example
title: strip punctuation, keeping letters and digits
params: {"type": "punctuation", "custom": "", "invert": false, "replaceWith": ""}
input: Hello, World! 123
output: Hello World 123
```

```example
title: strip digits (any Unicode number, not just 0-9)
params: {"type": "digits"}
input: a1b2 c٣
output: ab c
```

**Emoji** are matched as whole grapheme clusters rather than one code point at a time, so a skin-tone modifier or a flag built from two regional-indicator characters is removed as a single unit instead of leaving an orphaned half behind:

```example
title: an emoji with a skin-tone modifier is removed as one unit
params: {"type": "emoji"}
input: wave 👋🏽!
output: wave !
```

**Custom** lets you list the exact characters to strip, instead of picking a predefined category:

```example
title: strip a custom set of characters
params: {"type": "custom", "custom": "-_/"}
input: a-b_c/d
output: abcd
```

**Invert** flips the logic so that only characters in the chosen category are *kept*, and everything else is removed. That is useful for extracting just the digits out of a messy string, for example:

```example
title: invert to keep only digits
params: {"type": "digits", "invert": true}
input: phone: +1 555-0100
output: 15550100
```

Instead of deleting matched characters, **replace with** substitutes them with a string of your choice, one substitution per matched character (or per matched emoji cluster):

```example
title: replace matched characters instead of deleting them
params: {"type": "digits", "replaceWith": "#"}
input: a1b2
output: a#b#
```

Empty input always returns empty output, no matter what the other options are set to, and an empty custom set is caught before it can silently do nothing: choosing **custom** without filling in the **custom** field throws an error rather than passing text through unchanged.

## Options

- **strip**: the category to match: `punctuation`, `digits`, `letters`, `whitespace`, `non-alphanumeric`, `non-ascii`, `non-printable`, `emoji`, or `custom`. Defaults to `punctuation`.
- **custom characters**: the exact characters to match when **strip** is set to `custom`. Required in that mode; every character in this field is treated as an individual character to match, not a pattern, and backslash escapes like `\n` are not interpreted.
- **invert (keep only these)**: when on, characters that do *not* match the category are removed instead, so the category becomes an allowlist rather than a blocklist. Default off.
- **replace with**: text inserted in place of each removed character (or emoji cluster) instead of deleting it outright. Defaults to an empty string, which deletes matches.

## Common uses

- Cleaning punctuation out of text before running it through a word-frequency or tokenizing step.
- Stripping emoji from user-generated content for plain-text logs or exports.
- Extracting only the digits from a phone number, ID or price string using invert mode.
- Removing non-printable or non-ASCII characters that snuck in from a bad copy-paste or a mismatched encoding.
- Removing special characters from a string before it becomes a file name, a slug or an ID, with the non-alphanumeric category or a custom set.

## Tips and pitfalls

- "punctuation" means the Unicode punctuation categories, which do not include symbols: `+`, `$`, `=`, `<`, `>`, `^`, `|`, `~`, the backtick and currency signs survive it. Use "non-alphanumeric" or a custom set to remove those too.
- "digits" matches any Unicode number character, so superscripts like `²`, fractions like `½` and Roman numeral characters are removed along with `0`–`9` and non-Latin digits.
- "non-alphanumeric" removes everything that is not a Unicode letter, mark or number. So it keeps accented letters, but strips spaces, line breaks, punctuation and symbols together.
- "non-printable" strips control characters (like NUL and BEL), Unicode format characters (like zero-width spaces, the byte-order mark and the zero-width joiner inside emoji sequences) and private-use characters, but deliberately keeps tab, newline and carriage return so a document is not shredded.
- "emoji" uses the Unicode Extended_Pictographic property, which also covers `©`, `®` and `™`, so those are removed too.
- To remove diacritics (accents) specifically while keeping the base letters, use [diacritics](/util/diacritics/) instead. That is a different operation from stripping "letters" here, which would remove the letters entirely.
- For pattern-based removal rather than category-based (matching a specific regex), use [find and replace](/util/replace/) with an empty replacement.
- To strip HTML tags rather than characters, use [strip html tags](/util/strip_html_tags/).
