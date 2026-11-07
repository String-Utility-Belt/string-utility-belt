---
title: Word Frequency Counter: Most Common Words Online
description: Free online word frequency counter: see the most common words in any text, with stop-word and minimum-length filters and table, JSON or CSV output.
---
## What does this tool do?

This tool counts how many times each word appears in a block of text and lists them from most common to least, which is the basic building block of text analysis, keyword extraction, and word-cloud generation. It is the word-level counterpart to [char_frequency](/util/char_frequency/).

```example
title: the default table, most frequent word first
input: the cat the hat the end
output: the  3
cat  1
end  1
hat  1
```

## How it works

With the default **strip punctuation** setting, the text is split into words (runs of letters and digits that may include an internal apostrophe or hyphen, so `don't` and `well-known` each count as a single word), and each one is tallied. Rows are sorted by count, highest first; words tied on count are then sorted by character code (alphabetical for lowercase words, with uppercase sorting before lowercase), which is why `cat`, `end`, and `hat` (each appearing once above) are listed in that order.

By default the table only shows the **top 20** words; anything past that is still counted toward the `totalWords` and `uniqueWords` figures of the JSON output but not displayed, so a long document's table does not run on forever. Set **top n** to `0` to show every word.

```example
title: top n limits how many rows are shown
params: {"top": 3}
input: the cat sat on the mat the cat ran
output: the  3
cat  2
mat  1
```

Words are compared case-insensitively by default, so `The`, `the`, and `THE` are counted as the same word. Turning **ignore case** off keeps each spelling separate:

```example
title: with ignore case off, each casing is its own entry
params: {"ignoreCase": false}
input: The the THE
output: THE  1
The  1
the  1
```

## Removing stop words and short words

Turning on **remove stop words** drops a built-in list of common English function words ("the", "and", "of", "is", and similar), so the remaining list is closer to the meaningful vocabulary of the text.

```example
title: stop words are excluded when turned on
params: {"stopWords": true}
input: the cat and the hat
output: cat  1
hat  1
```

**min word length** filters out words shorter than a given number of characters, which is a quick way to drop short filler words without maintaining a stop-word list:

```example
title: a minimum length filters out short words
params: {"minLength": 3}
input: a bb ccc dddd
output: ccc   1
dddd  1
```

## Options

- **top n (0 = all)**: how many rows to display, sorted by frequency (default 20; `0` shows every word).
- **ignore case**: folds words together regardless of case (default on).
- **remove stop words**: excludes common English function words (default off).
- **min word length**: the shortest word length to count, in characters (default 1, meaning no filtering).
- **format**: `table` (default), `json` (an object with `totalWords`, `uniqueWords`, and a `words` array), or `csv`.
- **strip punctuation**: treats a word as just its letters and digits, ignoring surrounding punctuation (default on); turning it off keeps punctuation attached, so `hi,` and `hi` count as different words.

## Common uses

- Finding the most common terms in an article, transcript, or set of survey responses.
- Building a quick keyword list or a word cloud's input data.
- Comparing vocabulary between two pieces of text, using the CSV or JSON output for further processing.
- Spotting overused words in a piece of writing before editing it.
- Finding the most common words in a PDF, a Google Doc or a web page: paste its text, or chain this step after [strip HTML tags](/util/strip_html_tags/) for page source.

## Tips and pitfalls

- Because only the top 20 words are shown by default, a longer document may hide words you expect to see. Set **top n** to `0` if you need the complete list.
- Words are tokenized as letters and digits, so numbers count as words on their own and hyphenated or apostrophized words stay whole; punctuation-only tokens are dropped when **strip punctuation** is on.
- With **strip punctuation** on, emoji and other symbols are never counted as words, since a word must start with a letter or digit; turn it off and any run of non-whitespace, emoji included, counts.
- For a plain overall word count without a per-word breakdown, use [count](/util/count/). For analyzing common word pairs or sequences instead of single words, see [ngram_frequency](/util/ngram_frequency/).
