---
title: Pluralize Words Online: Singular to Plural Converter
description: Singular to plural converter, and back: pluralize or singularize English words in a phrase, only the last word or each line, or pick the form from a count.
---
## What does this tool do?

This tool converts English words between their singular and plural forms: `box` to `boxes`, `mouse` to `mice`, `geese` back to `goose`. It knows the common irregular plurals of English (`mouse`/`mice`, `goose`/`geese`, `child`/`children`) as well as the regular patterns (`-s`, `-es`, `-y` to `-ies`), rather than just appending an `s`.

```example
title: convert a single word to its plural
input: box
output: boxes
```

## How it works

The **mode** option picks the direction: `plural` (the default) or `singular`. The **scope** option decides how much of the input is affected:

- **whole** (default): every word in the text is converted. This is naive: it inflects literally every word it finds, including ones like "one" that do not carry real plural meaning on their own (`one goose` becomes `ones geese`), so it works best on a single noun or noun phrase rather than a full sentence.
- **last-word**: only the final word is converted, leaving the rest of the phrase untouched. This is the usual choice for a phrase like "shopping cart" where only the head noun should change.
- **each-line**: treats every line independently and converts the last word of each one, which is useful for pluralizing a whole list at once.

```example
title: scope last-word only changes the final word
params: {"scope": "last-word"}
input: I have one cat and two dog
output: I have one cat and two dogs
```

```example
title: scope each-line converts every line's last word; blank lines are left alone
params: {"scope": "each-line"}
input: user profile

last box
output: user profiles

last boxes
```

Switching **mode** to `singular` runs the same logic in reverse, and preserves the original capitalization of the word it changes:

```example
title: singular mode also preserves capitalization
params: {"mode": "singular"}
input: Boxes and geese
output: Box and goose
```

## Picking a form by count

Setting **count** to a number greater than zero picks the plural or singular form automatically based on whether that count equals one (the familiar "1 box, 5 boxes" pattern) and prefixes the number to the result. When **count** is used this way, it overrides the **mode** setting entirely, since the count itself already determines which form is grammatically correct.

```example
title: a count picks the form and prefixes the number
params: {"count": 5}
input: box
output: 5 boxes
```

A segment with no inflectable word (a bare number, an emoji, punctuation only) still gets the count prefix even though there is nothing to pluralize:

```example
title: the count prefix is added even with nothing to inflect
params: {"scope": "last-word", "count": 2}
input: 🍎
output: 2 🍎
```

## Options

- **mode**: `plural` or `singular` (default `plural`). Ignored whenever **count** is greater than 0.
- **scope**: `whole`, `last-word`, or `each-line` (default `whole`), as described above.
- **count (0 = off)**: a non-negative whole number; `0` (the default) disables count-based selection and uses **mode** directly.

## Common uses

- Generating correctly pluralized labels for a count you already have ("1 item" vs. "3 items") in generated text or templates.
- Normalizing a word list to all-singular or all-plural form before deduplicating or comparing it.
- Converting a list of nouns, one per line, to their plural forms for a form label, a table header, or a report.
- Quick grammar fixes when editing generated or templated copy that mismatches singular and plural.

## Tips and pitfalls

- Scope `whole` inflects every word mechanically; it does not understand grammar, so it is best reserved for short noun phrases rather than full sentences with verbs and articles.
- English pluralization has many irregular forms (`child`/`children`, `person`/`people`) and the underlying rules cannot cover every edge case in the language. Always check unusual or domain-specific nouns.
- Punctuation, emoji, and bare numbers are left completely alone; only a run that starts with a letter (letters and digits, optionally followed by an apostrophe suffix such as `'s`) is treated as a word.
- This tool only handles English. For other kinds of word-level text analysis, see [word_frequency](/util/word_frequency/); for a simple word count, see [count](/util/count/).
