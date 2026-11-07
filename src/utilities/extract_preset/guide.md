---
title: Extract URLs from Text Online: Emails, IPs & More
description: Extract every URL, email address, IP, phone number, date, hex color or UUID from any text online, plus more built-in patterns, with dedupe, sort and count.
---
## What does this tool extract?

This is a text scraper built around ready-made patterns for the things people most often need to pull out
of free-form text: URLs, email addresses, IPv4 and IPv6 addresses, numbers, hashtags, mentions, hex colors,
UUIDs, quoted strings, dates, times, phone numbers, HTML tags, words, domains, file paths, credit card
numbers, and JWTs. Instead of writing and debugging a regular expression yourself, you pick one or more
built-in types from a list and the matching substrings come back in the order they appear.

## How it works

Choose one or more types in **extract**, and every match for those types is returned, one per line by
default. With a single type, matches come out in the order they appear in the text:

```example
title: urls (the default type)
input: Visit https://example.com/docs?a=1 and http://test.org today
output: https://example.com/docs?a=1
http://test.org
```

Selecting several types at once merges their matches by where each one first appears in the text, not by
the order you listed the types in:

```example
title: several types merged by position in the text
params: {"type": ["emails", "phone"]}
input: Email ada@example.com or call 555-123-4567
output: ada@example.com
555-123-4567
```

Unicode text is handled correctly: a hashtag can contain accented letters, and `words` walks the text by
character, not by ASCII assumptions:

```example
title: hashtags keep accented letters intact
params: {"type": "hashtags"}
input: love #TypeScript and #café and #100days
output: #TypeScript
#café
#100days
```

`credit-cards` is more than a shape match: every candidate is checked against the Luhn checksum, so a
plausible-looking but invalid number is silently dropped instead of being reported as a match:

```example
title: credit-card numbers are Luhn-checked, not just shape-matched
params: {"type": "credit-cards"}
input: card 4111 1111 1111 1111 exp 12/29
output: 4111 1111 1111 1111
```

Turn on **count only** to get just the number of matches instead of the matches themselves. That is handy when
you only need to know how many mentions, links, or dates are in a document:

```example
title: count only
params: {"type": "mentions", "count": true}
input: one @a two @b three @a
output: 3
```

## Options

- **extract**: one or more of: `urls`, `emails`, `ipv4`, `ipv6`, `numbers`, `integers`, `hashtags`,
  `mentions`, `hex-colors`, `uuids`, `quoted-strings`, `dates`, `times`, `phone`, `html-tags`, `words`,
  `domains`, `file-paths`, `credit-cards`, `jwt`. Defaults to `urls`.
- **unique**: off by default. Removes repeated matches, keeping the first occurrence of each.
- **sort**: off by default. Sorts the results alphabetically, or numerically when every selected type is
  `numbers` or `integers`.
- **separator**: the text placed between matches in the output, a newline by default. Accepts typed
  escapes like `\t` and `\n`, or any literal text.
- **count only**: off by default. When on, the output is just the number of matches, ignoring
  **separator**.

## Common uses

- Pulling every link or email address out of a pasted email thread, support ticket, or document.
- Auditing text for accidentally-included personal data (email addresses, phone numbers, or credit card
  numbers) before publishing it.
- Counting how many dates, mentions, or hashtags appear in a body of text without opening a spreadsheet.
- Extracting all the IP addresses, file paths, or UUIDs mentioned in a log file for further processing with
  [line set operations](/util/set_operations/) or [count duplicate lines](/util/uniq_count/).

## Tips and pitfalls

- The patterns behind these types are pragmatic, not formal grammars: `emails` and `urls` cover normal
  real-world formats but are not full RFC validators, `phone` uses a loose shape match with a 7–15 digit
  filter, and `credit-cards` checks only the Luhn checksum and a 13–19 digit length, so a match is not proof
  that a card exists. If you already have a specific value and only want to know whether it's well-formed,
  use [validate](/util/validate/) instead, which reports why a value fails.
- `dates` and `times` will each find their own piece inside a combined ISO timestamp like
  `2024-03-01T10:00:00Z`. The date and the time are reported separately, not as one match.
- For a pattern this list doesn't cover, write your own with [regex extract](/util/regex_extract/), or use
  [grep lines](/util/grep_lines/) to keep only the lines that match a pattern instead of pulling out the
  matched text.
- `words` matches runs of letters, marks and digits joined by single internal apostrophes or hyphens, so
  `don't` and `self-esteem` each come back as one match rather than being split apart. It does not segment
  scripts written without spaces: a run of Chinese or Japanese characters such as `日本語` is one match,
  not one per character (so a `words` count here can be far lower than the one
  [reading time](/util/reading_time/) uses).
