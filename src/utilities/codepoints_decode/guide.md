---
title: Code Points to Text: Convert U+XXXX to Characters
description: Convert Unicode code points to text: turn a list of U+XXXX, 0xXXXX, \u{...} or plain decimal or hex numbers back into the characters they stand for.
---
## What does this tool do?

Given a list of Unicode code points (the numbers that identify each character, usually written `U+1F600` or similar), this tool turns them back into the actual text they represent. It's the counterpart to [to code points](/util/codepoints_encode/), and it deliberately accepts a mix of notations in the same input, since code points get pasted in from all kinds of sources: Unicode charts use `U+XXXX`, C-like code uses `0xXXXX`, JavaScript source uses `\u{...}` or a raw `\uXXXX` pair, and plain lists just give bare numbers.

## How it works

The tool splits the input into tokens on anything that isn't part of a recognized notation, so punctuation, arrows, dashes, or any separator [to code points](/util/codepoints_encode/) might produce all work as a divider. Each token is then read as a code point and converted to its character.

```example
title: U+ notation
input: U+1F600 U+1F44D
output: 😀👍
```

```example
title: hex without the 0x prefix
params: {"format": "hex"}
input: 48 69
output: Hi
```

### The ES2015 brace escape

```example
title: a JavaScript-style brace escape
input: \u{1F600}
output: 😀
```

### Any separator works

Because the tool splits on anything that isn't a digit, letter, backslash, or brace, it doesn't matter what character separates the tokens: a dash, an arrow, a middle dot, or anything else that isn't a letter or digit:

```example
title: arbitrary separators are ignored
input: U+0048-U+0069
output: Hi
```

### Bare numbers: hex or decimal?

A token with no prefix and no letters, like `128512`, is read as **decimal** by default. A bare token that contains a hex letter (`a`–`f`), like `1f600`, is read as **hex**. This auto-detection is what the **radix of bare numbers** option controls:

```example
title: forcing decimal changes the meaning of leading-zero tokens
params: {"format": "decimal"}
input: 0048 0069
output: 0E
```

Here `0048` and `0069` look like they might be hex (they're what [to code points](/util/codepoints_encode/)'s hex format would produce for `H` and `i`), but with **radix of bare numbers** forced to `decimal`, they're read as the decimal values 48 and 69 instead, which are the characters `0` and `E`. `auto` would read them as decimal too, since they contain no `a`–`f` digit. Set the option to `hex` for a bare hex list, or use `0x` / `U+` prefixes.

## Options

- **radix of bare numbers**: `auto` (default): a bare token with a hex letter is read as hex, otherwise decimal. `hex` or `decimal` forces every unprefixed token to that radix, regardless of its digits.

Tokens with an explicit notation (`U+`, `0x`, `\u{...}`, or a raw `\uXXXX` pair) always use the radix their notation implies, no matter what this option is set to. It only affects bare, unprefixed numbers.

## Common uses

- Converting a code point reference from a Unicode chart, bug report, or font-testing tool into the actual character.
- Reversing output from [to code points](/util/codepoints_encode/) in any of its formats (set the radix to `hex` for its bare hex format).
- Building a specific character or emoji from its known code point when you can't type it directly.
- Testing how a font or renderer handles a specific, exactly-specified code point.

## Tips and pitfalls

- A code point above U+10FFFF, or a token that doesn't match any recognized notation, throws an error rather than silently skipping it.
- Two consecutive `\uXXXX`-style values that form a valid UTF-16 surrogate pair (the way JSON and Java escape an astral character) are recombined into the single character they represent, the same as the brace form.
- To go the other direction, use [to code points](/util/codepoints_encode/), which lists a string's code points in the `U+XXXX`, hex, decimal, or `\u{...}` format you choose, with a custom separator.
- A clean list of HTML numeric entities (`&#233; &#x1F600;`) is read too, with the radix option on `auto`. If escapes or entities are mixed in with ordinary text rather than forming a list, [unicode escape decode](/util/unicode_escape_decode/) is the better fit.
