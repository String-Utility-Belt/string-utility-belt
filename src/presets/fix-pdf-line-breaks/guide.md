---
title: Remove Line Breaks From PDF Text and Rejoin Hyphens
description: Remove line breaks from text copied from PDF files, rejoin words hyphenated at line ends, drop page numbers and expand fi and fl ligatures, in your browser.
---

## Why text copied from a PDF breaks mid-sentence

The text on a PDF page is stored as runs of characters placed at coordinates. Unless the file is tagged, nothing says which lines make up a paragraph, so the viewer rebuilds the text line by line and you usually get a line break at the end of every printed line. The rest of the page comes along too: the hyphen the typesetter added to split a word, the page number from the footer when your selection crosses a page, and, in some files, single ligature characters for fi or ffl.

A plain "remove line breaks" pass fixes only the first of those. It turns "spe-" and "cific" into "spe- cific", glues "Page 4 of 12" into a sentence and, if it removes every break, runs paragraphs and lists together.

## What each step does, and why in this order

[normalize line endings](/util/normalize_line_endings/) turns Windows CR LF into LF, so the hyphen rules only have to look for one character. [multi replace](/util/multi_replace/) maps the ligatures U+FB00 to U+FB04, from Unicode's [Alphabetic Presentation Forms](https://www.unicode.org/charts/PDF/UFB00.pdf) block, back to ff, fi, fl, ffi and ffl; add a row if your text also has the st ligatures U+FB05 and U+FB06.

The two [sed script](/util/sed/) steps carry the logic, and both need the line breaks that [unwrap / reflow](/util/unwrap/) removes, so they run before it. The first deletes lines that hold nothing but a page number, such as "- 7 -" or "Page 4 of 12", while each is still a line of its own. The second closes the gap after a hyphen at a line end. A hyphen between two lowercase letters is taken to be the typesetter's and removed, so "spe-" and "cific" become "specific". Some PDF producers write that hyphen as an invisible soft hyphen (U+00AD), which the same rule removes. Any other hyphen or dash, as in "12-month", "non-English" or "2023–2024", is kept.

Unwrap then joins the remaining lines of each paragraph, an indented first line and the wrapped lines of a list item included. Blank lines stay paragraph breaks, and a line that starts with a bullet or a number such as "1." keeps its own line. [collapse whitespace](/util/collapse_whitespace/) closes the double gap left where a page number stood between two blank lines and trims the indentation and both ends.

## What it cannot fix

Paragraph breaks have to be in the input. When the copy has no blank lines, the preset cannot tell where a paragraph ended: the selection comes back as one paragraph, a heading joins the text under it, and a paragraph that follows a list joins the last item. Copy a paragraph at a time, or add the blank lines first.

A real compound split at a line end, such as "screen-" and "reader", becomes "screenreader": without a dictionary it looks exactly like a typesetter's hyphen. If your text has more compounds than hyphenated breaks, delete the first hyphen rule. A wrapped URL loses its hyphen the same way, or gets a space where it wrapped. A line holding only a number of up to four digits, such as a year in a table, is deleted with the page numbers, while a running header stays until you add a line for it to the footer step (the script has a commented example). A wrapped line that happens to start like a list item, with "2023. " or "– ", keeps its own line. And when a font has no Unicode mapping for its ligatures, the copy can lose them outright ("eective"); no rule can restore letters that never reached the clipboard.

## The same job on the command line

With Poppler, run `pdftotext -raw -nopgbrk file.pdf out.txt`. The default mode rejoins words hyphenated at a line end itself, but drops every such hyphen: Poppler 24.02 turns "12-" and "month" into "12month". The -raw option keeps hyphens and line breaks for rules like these to judge, though it follows content-stream order, which can differ from reading order in multi-column layouts. The -layout option keeps them too, but can put a blank line above a page footer, which then reads as a paragraph break. The -nopgbrk option drops the form feed between pages.

With GNU grep and Perl, the core of the preset is `grep -Eiv '^\s*(page\s+)?[0-9]+(\s+of\s+[0-9]+)?\s*$' out.txt | perl -CSD -0777 -pe 's/(\p{Ll})-\n(\p{Ll})/$1$2/g; s/(\S-)\n(?=\S)/$1/g; s/(\S)\n(?=\S)/$1 /g'`, though it also joins list items to the line before them. In Python, `unicodedata.normalize('NFKC', text)` expands ligatures but also turns "m²" into "m2" and "½" into "1⁄2", which is why the preset uses an explicit table. In Word, three Find and Replace passes (^p^p to a placeholder, ^p to a space, the placeholder back to ^p^p) keep paragraphs apart but leave hyphens, page numbers and ligatures alone.
