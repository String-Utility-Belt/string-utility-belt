---
title: String Length Calculator: Count Characters Online
description: Check string length online: count characters the way JavaScript measures them, and see how emoji and accented letters change the total.
---
## What does this tool do?

This tool reports a single number: the length of the input text. It is the simplest possible measurement, but a genuinely useful one on its own, and a good first step to reach for when you just need to know how big a piece of text is before deciding what to do with it.

```example
title: the length of a short word
input: hello
output: 5
```

## How length is counted

Length here is a plain JavaScript string length: the number of **UTF-16 code units** the text occupies in memory. For ordinary Latin text this matches what you would count by eye, one per visible letter, space, or punctuation mark:

```example
title: spaces and punctuation count too
input: a b c
output: 5
```

Most accented letters and other common characters also occupy exactly one code unit, including precomposed letters like the `é` in `café`:

```example
title: a precomposed accented letter counts as one character
input: café
output: 4
```

Characters outside the Basic Multilingual Plane (most emoji among them) are stored as a **surrogate pair** of two UTF-16 code units, so each one adds 2 to the length rather than 1. This is easy to miss because the character still looks like a single symbol on screen:

```example
title: an emoji counts as two, not one, because of its surrogate pair
input: a😀b
output: 4
```

## Options

This utility has no configurable options; it always reports the plain UTF-16 length of the input.

## Common uses

- Checking whether a value fits inside a length limit, such as a form field, an API field, a username. Check which unit the limit uses: many databases count code points or bytes, and X (Twitter) weights characters, so emoji-heavy or non-Latin text can measure differently there.
- A quick building block inside a larger pipeline, to confirm a previous step produced the size of output you expected.
- Comparing the size of text before and after a transformation, such as encoding or padding. Byte output, such as compressed data, is decoded as UTF-8 before it is measured, so the result is not a byte count.
- Sanity-checking that trimming, truncating, or padding a string landed on the length you intended.

## Tips and pitfalls

- This is a **code-unit** count, not a count of what a person would call "characters." Every character outside the Basic Multilingual Plane counts as 2 rather than 1, and an emoji built from several code points counts all of them: a skin-toned thumbs-up or a flag is 4.
- If your text uses decomposed accented letters (a base letter followed by a separate combining accent mark, rather than a single precomposed character), each accent adds its own extra unit to the length even though nothing extra is visible. Run [normalize](/util/normalize/) with NFC first if you want visually-equivalent text to report the same length.
- For a full breakdown of characters, words, and lines together instead of a single number, use [count](/util/count/). For an inventory of exactly which characters make up the text and how often each appears, see [char_frequency](/util/char_frequency/).
- For the size in bytes rather than characters, which is what a database column or a header limit usually means, [text statistics](/util/text_stats/) reports UTF-8 and UTF-16 byte counts next to the character count.
- Because this always returns a number as text, it slots cleanly into any pipeline step that expects a string value, including ones further down the chain that parse it back into a number.
