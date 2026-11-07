---
title: Levenshtein Distance Calculator: Edit Distance Online
description: Calculate the Levenshtein distance between two strings online, or Damerau-Levenshtein, Jaro-Winkler, Dice, Jaccard, cosine and LCS similarity scores.
---
## What is string distance?

String distance measures how different two strings are, as a number. Some algorithms count the minimum
number of edits needed to turn one string into the other; others compare the strings' shared sub-pieces as
a ratio. This tool implements nine well-known algorithms and reports both a raw (or normalized) distance
and a similarity score between 0 and 1, so you can compare fuzzy matches, dedupe near-identical records, or
check spelling suggestions without picking and implementing an algorithm yourself.

## How it works

Enter the string to compare against in **other string**, and pick an **algorithm**. By default, Levenshtein
distance counts the minimum number of single-character insertions, deletions, and substitutions needed to
turn one string into the other:

```example
title: levenshtein counts single-character edits
input: kitten
params: {"other": "sitting", "algorithm": "levenshtein"}
output:
{
  "algorithm": "levenshtein",
  "distance": 3,
  "similarity": 0.571429,
  "a": "kitten",
  "b": "sitting"
}
```

Damerau-Levenshtein adds one more edit type: swapping two adjacent characters counts as a single edit
instead of two substitutions. So a simple transposition scores lower than plain Levenshtein would give it.
This tool implements the common "optimal string alignment" variant, in which no substring is edited more
than once: `ca` to `abc` is 3 here, where the unrestricted Damerau-Levenshtein distance is 2.

```example
title: a transposition counts as one edit, not two
input: ca
params: {"other": "ac", "algorithm": "damerau-levenshtein"}
output:
{
  "algorithm": "damerau-levenshtein",
  "distance": 1,
  "similarity": 0.5,
  "a": "ca",
  "b": "ac"
}
```

Jaro and Jaro-Winkler work differently: instead of counting edits, they look at how many characters match
within a small window and how many of those matches are out of order, which tends to suit short strings
like names well. Jaro-Winkler adds a bonus for a shared prefix of up to four characters (0.1 per
character, scaled by the remaining gap), applied only when the plain Jaro score is above 0.7:

```example
title: jaro-winkler rewards a shared prefix
input: MARTHA
params: {"other": "MARHTA", "algorithm": "jaro-winkler"}
output:
{
  "algorithm": "jaro-winkler",
  "distance": 0.038889,
  "similarity": 0.961111,
  "a": "MARTHA",
  "b": "MARHTA"
}
```

Dice, Jaccard, and cosine all compare the two strings' character bigrams (overlapping 2-character chunks;
a one-character string is used as-is) instead of individual characters. Dice is twice the shared bigrams
divided by the total bigram count, Jaccard is shared distinct bigrams over all distinct bigrams, and cosine
compares bigram frequency vectors:

```example
title: dice compares shared character bigrams
input: night
params: {"other": "nacht", "algorithm": "dice"}
output:
{
  "algorithm": "dice",
  "distance": 0.75,
  "similarity": 0.25,
  "a": "night",
  "b": "nacht"
}
```

Hamming distance is the odd one out: it only counts substitutions at matching positions, and it requires
both strings to be the same length (counted in code points, so a single emoji counts as one character, not
two or four):

```example
title: hamming requires equal length, counted by code point
input: 👍
params: {"other": "x", "algorithm": "hamming"}
output:
{
  "algorithm": "hamming",
  "distance": 1,
  "similarity": 0,
  "a": "👍",
  "b": "x"
}
```

## Options

- **other string**: the string to compare the input against.
- **algorithm**: `levenshtein` (default), `damerau-levenshtein`, `hamming`, `jaro`, `jaro-winkler`, `dice`,
  `jaccard`, `lcs`, or `cosine`.
- **ignore case**: off by default. When on, both strings are lowercased before comparing (the `a` and `b`
  fields in the result still show your original, unmodified strings).
- **normalized distance (0-1)**: off by default, so `distance` is the raw edit count for Levenshtein,
  Damerau-Levenshtein, Hamming, and LCS. Turn it on to scale those same distances into 0..1 (dividing by
  the longer string's length, or by the combined length for LCS) so results from different string lengths
  are comparable. The coefficient-based algorithms (Jaro, Jaro-Winkler, Dice, Jaccard, cosine) are always
  reported as `1 − similarity`, in 0..1, regardless of this setting.

## Which algorithm to use

- **levenshtein** / **damerau-levenshtein**: general-purpose edit distance; use Damerau-Levenshtein when
  transposed letters (a common typo) should count as a smaller error than two substitutions.
- **hamming**: only meaningful for strings you expect to already be the same length, such as comparing
  fixed-width codes or hashes.
- **jaro** / **jaro-winkler**: tuned for short strings like names, especially when the strings tend to
  share a prefix.
- **dice** / **jaccard** / **cosine**: bigram-overlap measures that are less sensitive to where a
  difference falls in the string, useful for fuzzy deduplication of longer text.
- **lcs**: distance is the combined length minus twice the longest common subsequence, i.e. the number
  of insertions and deletions (no substitutions) needed. Useful when shared characters may be spread out
  with other text in between; they still have to appear in the same order.

## Common uses

- Fuzzy-matching user input against a list of known values (city names, product names, commands) to
  suggest a correction.
- Deduplicating near-identical records (customer names, addresses, log lines) that differ by a typo or
  small formatting difference.
- Scoring "did you mean" suggestions or autocomplete candidates by similarity.
- Comparing two versions of a short string as a numeric alternative to a full [text diff](/util/text_diff/).

## Tips and pitfalls

- `similarity` is always `1 − distance` on the algorithm's natural 0..1 scale. For Levenshtein and
  Damerau-Levenshtein without **normalized distance** on, `distance` is a raw edit count that can exceed 1,
  so compare `similarity` (not `distance`) when you want a score you can compare across different string
  lengths.
- Every algorithm here counts by Unicode code point, so an emoji or a precomposed accented letter counts as
  one unit, not one per UTF-16 code unit. Text is not Unicode-normalized, though: an accent typed as a
  separate combining mark is a second code point, so `é` and `e` + U+0301 are not treated as equal.
- Hamming distance throws an error rather than guessing when the two strings have different lengths. Pad
  or truncate first with [pad](/util/pad/) or [truncate](/util/truncate/) if you need to compare
  different-length strings that way anyway.
- Floating-point rounding can leave two identical strings a hair away from a perfect score internally; this
  tool clamps the result so identical input always reports a distance of exactly 0 and a similarity of
  exactly 1.
