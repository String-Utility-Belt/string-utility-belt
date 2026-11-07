---
title: Smart Quotes to Straight Quotes (and Back) Online
description: Convert smart quotes to straight quotes online, or straight to curly. Em/en dashes and ellipses too, in English, German, French or Polish style.
---
## What are smart quotes?

"Smart" or "curly" quotes are the typographic `“ ”` and `‘ ’` characters used in professionally typeset text, as opposed to the plain straight `"` and `'` that a keyboard types directly. The same distinction applies to dashes (`--` versus a proper en dash `–` or em dash `—`) and to three dots (`...`) versus a single ellipsis character (`…`). This tool converts in either direction: straightening typographic punctuation for plain-text contexts, or curling plain punctuation into typographic form for publishing.

## How it works

The **direction** option picks which way the conversion runs. Converting **to straight** (the default) replaces every curly quote, dash, and ellipsis with its plain ASCII equivalent, including French guillemets (`« »`) and their inner spacing, which are removed along with the quote marks themselves:

```example
title: converting typographic punctuation to plain ASCII
input: “He said” ‘it’s here’ — really…
output: "He said" 'it's here' --- really...
```

Converting **to smart** does the reverse, curling straight quotes into the correct opening or closing mark based on context, turning `--` into an en dash and `---` into an em dash, and turning `...` into a single ellipsis character:

```example
title: converting plain ASCII to typographic punctuation
params: {"direction": "to-smart"}
input: He said "it's here" -- really...
output: He said “it’s here” – really…
```

### Telling an opening quote from a closing one

Going to-smart, a `"` or `'` is treated as opening a quotation at the start of the text or when it follows whitespace, an opening bracket, a slash, a hyphen or dash, or another opening quote, and as closing one otherwise. An apostrophe gets extra handling: between two letters or digits it is always a plain apostrophe (`it’s`), right after a letter or digit it is a closing mark, as in a possessive (`dogs’`), and before a digit it is an apostrophe (`’90s`):

```example
title: apostrophe vs. closing quote in a possessive
params: {"direction": "to-smart"}
input: the dogs' bones
output: the dogs’ bones
```

```example
title: a leading apostrophe before a digit, as in a decade
params: {"direction": "to-smart"}
input: '90s music
output: ’90s music
```

### Locale-specific quote styles

The **locale** option (used only going to-smart) picks which pair of quote marks is used for double and single quotes: English `“ ”`, German `„ “`, French `« » ` with the narrow spacing built in, or Polish `„ ”`:

```example
title: French guillemets, with their built-in spacing
params: {"direction": "to-smart", "locale": "fr"}
input: Il a dit "oui"
output: Il a dit « oui »
```

Empty input returns empty output in either direction:

```example
title: empty input
input:
output:
```

## Options

- **direction** (`direction`, default `to-straight`): `to-straight` converts typographic punctuation to plain ASCII; `to-smart` does the reverse.
- **quotes** (`quotes`, default `true`): whether curly/straight double and single quotes (and guillemets) are converted.
- **dashes** (`dashes`, default `true`): whether `--`/`---` and en/em dashes are converted.
- **ellipsis** (`ellipsis`, default `true`): whether `...` and the single ellipsis character `…` are converted.
- **locale** (`locale`, default `en`): `en`, `de`, `fr`, or `pl`; which quote character pair `to-smart` uses. Ignored going to-straight, since every locale's quotes straighten to the same plain `"` and `'`.

## Common uses

- Preparing plain-text or Markdown source for typeset publishing, where curly quotes and proper dashes read better.
- Cleaning up text copied from a word processor (which auto-curls quotes) before pasting it into code, a URL, or a plain-text file where straight quotes are expected.
- Converting a manuscript between English and other locale-specific quotation styles, in two steps: straighten it first, then curl it again with the target locale.

## Tips and pitfalls

- For input that is plain ASCII to begin with, converting **to smart** and then **to straight** reproduces it exactly, including `--` versus `---`. Typographic characters that were already in the input are straightened on the way back, so mixed input does not round-trip, and going straight-then-smart can pick different quote marks than the original had.
- In the `de` locale the closing marks `‘` and `“` are the same characters English uses for opening, so a double quote directly after a nested closing single quote is curled as another opening `„`. Check nested German quotations by hand.
- The dash conversion is specifically `--` ⇄ en dash and `---` ⇄ em dash; a single hyphen `-` is never touched going to-smart, though a lone minus-like character does straighten to `-` going to-straight.
- Turn off `quotes`, `dashes`, or `ellipsis` independently if you only want to convert one kind of punctuation and leave the rest of the text as-is.
- To delete punctuation rather than convert it, see [strip characters](/util/strip_chars/); to find zero-width and other invisible characters that often come along with text pasted from a word processor, see [remove invisible characters](/util/remove_invisible/).
