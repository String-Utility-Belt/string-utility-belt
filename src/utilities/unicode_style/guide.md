---
title: Unicode Text Style Generator: Fancy Fonts Online
description: Make fancy Unicode text to copy and paste anywhere: bold, italic, script, fraktur, bubble, fullwidth, upside-down, small caps and zalgo, 18 styles in all.
---
## What is Unicode text styling?

Unicode includes several blocks of characters that look like styled Latin letters (bold, italic, script, monospace, circled, or fullwidth forms) even though, to a computer, they are entirely different characters from the plain letters they resemble. This tool maps ordinary ASCII letters and digits onto those look-alike characters, producing "fancy" text you can paste anywhere plain text is accepted, such as a bio or a chat message, since no real formatting (like actual bold) is involved. It is achieved entirely through different characters.

## How it works

Each style is either a **range mapping**, which shifts a letter's code point into a parallel Unicode block such as the Mathematical Alphanumeric Symbols used for bold, italic, script, and fraktur, or a **lookup table** for styles like small caps, superscript, subscript, and upside-down text, where the look-alike characters are scattered across several unrelated Unicode blocks rather than sitting in one contiguous range. A handful of styles append a combining mark to each character instead of replacing it.

```example
title: bold, using the mathematical bold letters
params: {"style": "bold"}
input: Hello
output: 𝐇𝐞𝐥𝐥𝐨
```

```example
title: small caps folds capitals into the same forms as lowercase
params: {"style": "small-caps"}
input: Hello World
output: ʜᴇʟʟᴏ ᴡᴏʀʟᴅ
```

Characters that have no styled form in a given style are left exactly as they are. For most styles that means punctuation, digits under a letter-only style such as script, and anything non-ASCII (`fullwidth` and `upside-down` also convert punctuation, and `superscript` and `subscript` convert `+ - = ( )`):

```example
title: characters outside the style's table pass through unchanged
params: {"style": "script"}
input: a-1!
output: 𝒶-1!
```

**Strikethrough** and **underline** work differently from the look-alike styles: instead of mapping to a different letter, they append a combining mark after every character except line breaks, which is why they can be applied to any character at all, not just ASCII letters and digits.

```example
title: strikethrough appends a combining mark to every character
params: {"style": "strikethrough"}
input: ab
output: a̶b̶
```

### Zalgo text

`zalgo` is different again: it randomly stacks combining marks above, through, and below each non-space character, at an **intensity** you control. The output is deterministic rather than truly random: with the default **seed** of `0` the pattern is derived from the text itself, and a non-zero seed picks a different pattern that is just as reproducible, so the same input, intensity, and seed always look identical:

```example
title: zalgo, seeded for reproducible chaos
params: {"style": "zalgo", "intensity": 5, "seed": 42}
input: cursed
output-matches: ^c[\s\S]+d[\s\S]*$
```

Empty input produces empty output for every style:

```example
title: empty input, any style
params: {"style": "upside-down"}
input:
output:
```

## Options

- **style** (`style`, default `fullwidth`): one of 18 styles: `fullwidth`, `small-caps`, `bubble`, `bubble-filled`, `square`, `upside-down`, `bold`, `italic`, `bold-italic`, `monospace`, `script`, `fraktur`, `double-struck`, `strikethrough`, `underline`, `superscript`, `subscript`, or `zalgo`.
- **zalgo intensity** (`intensity`, default `3`, range 0–200): the maximum number of combining marks stacked above and below each character (with up to half as many more struck through it); each character gets a random count up to that limit. Only used by the `zalgo` style; `0` leaves the text unmarked.
- **zalgo seed** (`seed`, default `0`): `0` derives a seed from the input text itself, so the same text always looks the same across runs even without picking a seed; any other whole number picks a specific reproducible pattern independent of the text.

`upside-down` also reverses reading order: each line's characters are reversed, and the lines themselves swap top-to-bottom, so a whole multi-line block reads correctly upside down, not just each character individually.

## Common uses

- Stylized display names, bios, and social media posts where real text formatting is not available.
- Emphasis or a "glitch" aesthetic in messages, without using Markdown or HTML formatting.
- Quick visual variety for headers or labels pasted into plain-text tools.

## Styled text in a pipeline

Styling is one step, so it combines with the others. A pipeline that runs [trim](/util/trim/), then [change case](/util/case/) in title case, then this step in bold turns a pasted line into a styled heading in one go, and saving it keeps the style, the case and the order for next time. The browser extension runs a saved pipeline on selected text from the right-click menu, so the same styling is there on any site without opening the editor. To see what the step produced, add [unicode code point converter](/util/codepoints_encode/) or [unicode code point inspector](/util/unicode_inspect/) after it: every styled letter is a separate code point, which is why the text survives a copy and paste but not a search.

The way back is a pipeline too. [unicode normalize](/util/normalize/) with the NFKC form turns bold, italic, fraktur, double-struck, monospace, fullwidth, bubble, square, superscript and subscript text back into plain letters, because Unicode lists those characters as compatibility forms of the originals; small caps, filled bubbles and upside-down text have no such mapping and stay as they are. [remove diacritics](/util/diacritics/) strips the combining marks that strikethrough, underline and zalgo add. Text that arrived with look-alike characters by accident, such as curly quotes and odd spaces from a word processor, is the job of the [clean up text pasted from Word](/presets/clean-text-pasted-from-word/) preset.

## Tips and pitfalls

- These are not "fonts" in any typographic sense. They are distinct Unicode characters, so **most search boxes, case-insensitive matching and screen readers treat styled text as different from the plain letters it resembles.** A screen reader may spell mathematical letters out one by one by their character names ("mathematical bold capital H…") or skip them entirely. Do not use them anywhere the text needs to remain searchable or accessible, such as a name, a heading or a link.
- `superscript` and `subscript` are incomplete because Unicode is: there is no superscript `q`, and no subscript `b`, `c`, `d`, `f`, `g`, `q`, `w`, `y` or `z`, so those letters stay full-size in otherwise raised or lowered text. Capitals with no superscript form fall back to the lowercase superscript letter.
- Some renderers and older systems do not have glyphs for every mathematical alphanumeric or bubble character and will show a placeholder box (tofu) instead.
- High `zalgo` intensity values produce a lot of combining marks per character; very long input at high intensity can produce a correspondingly large amount of output.
- For a large block-letter effect built from ordinary ASCII characters instead of Unicode look-alikes, see [ASCII banner](/util/ascii_banner/); for restyling by capitalization pattern rather than character shape, see [alternating case](/util/alternating_case/); for swapping letters for look-alike keyboard digits and symbols, see [leet speak](/util/leet/).
