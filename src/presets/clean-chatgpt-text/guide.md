---
title: Remove ChatGPT Formatting, Em Dashes & Hidden Characters
description: Free online ChatGPT text cleaner: remove ChatGPT formatting from text, keep list numbers and bullets, and fix em dashes, curly quotes and hidden spaces.
---

## Why pasted ChatGPT text is full of asterisks

ChatGPT writes its answers in Markdown, and the chat window renders it. Paste an answer somewhere that does not render Markdown, such as a LinkedIn post, a CMS text field or an SMS tool, and you often get the source instead: `**` around bold phrases, `###` before headings, `>` before quotes and a `|---|---|` row under every table. Em dashes, curly quotes and the single-character ellipsis come along too, and so can characters that look like a space or do not show at all: no-break spaces (U+00A0), narrow no-break spaces (U+202F) and zero-width spaces (U+200B).

Each layer needs its own fix. [strip markdown](/util/markdown_strip/) removes the syntax, but list markers are syntax too, so numbered steps lose their numbers. A dash or quote converter leaves the asterisks, and an invisible-character remover leaves everything you can see.

Hidden spaces are sometimes called a ChatGPT watermark, but word processors, `&nbsp;` in web pages and French typography produce the same characters. The reasons to remove them are practical: a no-break space stops a line from wrapping, and a zero-width space makes search and find-and-replace miss text that looks identical.

As a ChatGPT text cleaner, this preset handles all of those at once: paste the answer, copy the plain text, and paste that into Word, Google Docs or wherever the asterisks showed up.

## Why the steps run in this order

Hidden characters go first, because a zero-width space or byte order mark at the start of a line hides the `-` or `###` after it from every later rule. [invisible characters](/util/remove_invisible/) deletes them, and [collapse whitespace](/util/collapse_whitespace/), with collapsing and trimming off, turns every Unicode space into a plain one, so the later rules only have to match ordinary spaces.

Structure has to be protected before the Markdown goes. The [sed script](/util/sed/) turns bullets into •, rewrites `1.` as `1\.` (an escaped period, which Markdown reads as text), drops table divider rows and horizontal rules, and trims the outer pipes from table rows. It also turns the bold label ChatGPT often puts in list items, `**Speed** — loads fast`, into `Speed: loads fast`, which only works while the `**` still marks where the label ends. [strip markdown](/util/markdown_strip/) then removes the rest of the syntax, turns `1\.` back into `1.` and keeps each link's URL in parentheses.

Dashes come after the Markdown. [multi replace](/util/multi_replace/) turns an em dash that opens a line, as in a quote attribution, into a hyphen that the Markdown steps would have read as a bullet. En dashes become hyphens, so 30–50 and Mon–Fri keep their meaning, and every other em dash becomes a comma. [smart quotes](/util/smart_quotes/) then straightens quotes and apostrophes and turns … into three periods.

## Choices worth changing

A comma suits most of ChatGPT's em dashes, the asides and afterthoughts: "still works—if your emails get opened" becomes "still works, if your emails get opened". Between two full sentences it makes a comma splice, and in a heading such as `## Step 1 — Pick a niche` it reads oddly. Change the last rule of step 5 to " - " or "; ", or delete it to keep em dashes, and read the result before you publish. The pipeline changes characters, not wording, so ChatGPT's closing offer to draft more stays in.

For SMS, add a rule to step 5 that turns • into a hyphen. The bullet is the only character the pipeline adds that is outside the GSM 7-bit alphabet (3GPP TS 23.038), and one such character, an emoji included, sends the whole message as UCS-2: 70 characters per SMS instead of 160, unless your provider replaces it.

## What it does not handle

- Emoji built from several code points. Step 1 removes zero-width joiners and variation selectors, so ❤️ loses its emoji-style selector and a family emoji splits into separate people. For such text, replace step 1 with a [replace](/util/replace/) step that removes only the zero-width space, byte order mark and soft hyphen: pattern `[\u200B\uFEFF\u00AD]`, regex on, empty replacement. Keep it first, for the same reason step 1 is first.
- Code. The list and table rules ignore code fences: in a code block, a YAML `- name` line becomes `• name`, a `---` line disappears and a line starting `1.` keeps its backslash (`1\.`). Copy code out separately.
- An em dash that cuts off speech or ends a line leaves a stray comma: `“Wait—”` comes out as `"Wait, "`.
- `5*3*2` is read as italics and comes out as 532, and lists numbered `1)` lose their numbers.
- LaTeX keeps its commands: `\( A = \pi r^2 \)` comes out as `( A = \pi r^2 )`.
- HTML tags are deleted, so a `<br>` inside a table cell glues its two lines together.
- Tables become lines with a pipe between cells. For a spreadsheet, convert the original with [markdown table to csv](/util/markdown_to_csv/) instead (it keeps `**` in cells).
- Ideographic spaces in Chinese or Japanese text become ASCII spaces.

## Doing it on the command line

pandoc handles the Markdown half: `pandoc -f gfm -t plain --wrap=none answer.md` keeps list numbers and bullets and lines tables up in columns. pandoc 3.1 drops link URLs, though, and leaves dashes, curly quotes and hidden characters alone. Pipe its output through `perl -CSD -pe` with one substitution per character, such as `s/[\x{A0}\x{202F}]/ /g` for no-break spaces, `s/\x{200B}//g` for zero-width spaces and `s/ *\x{2014} */, /g` for em dashes.
