---
title: Extract Unique Email Addresses From Any Text
description: Extract email addresses from a thread, CSV or web page online and get each one once: case variants merged, the list sorted, and no-reply senders left out.
---

## Why finding the addresses is the easy part

Pulling email addresses out of a block of text sounds like a single regular expression, and finding them is. The trouble starts with the list you get back. A copied email thread names the same colleague in the From line, the Cc line and every quoted reply. A CRM export has `ADA@example.com` on one row and `ada@example.com` on the next, because two people typed it. A notification footer adds `noreply@` and `notifications@` addresses that nobody reads. Paste the raw matches into a mailing tool or a spreadsheet and you get duplicates, bounces and a count that is wrong before you start.

So the work is in three decisions: which spellings count as the same address, which matches to keep, and in what order to do it. Lower-casing has to happen before duplicates are removed, otherwise the two spellings of Ada survive as two entries. The no-reply filter runs last, on a clean one-address-per-line list, so it can anchor its pattern to the start of each address and leave alone a person whose address merely contains a word like "bounce" further along.

## What each step does

[Change case](/util/case/) set to lower turns the whole text to lower case. Domain names are case-insensitive by definition, and although the standard allows a mail server to treat the part before the @ as case-sensitive, the large providers do not, so merging case variants is what you almost always want.

[Extract matches](/util/extract_preset/) with the emails pattern then finds every address wherever it appears: between angle brackets in a header, after `mailto:` in a link, in a CSV cell or at the end of a sentence, without the full stop. Its unique option keeps the first copy of each address and its sort option puts the list in alphabetical order, one address per line, ready to paste into a spreadsheet column. Change its separator to `, ` if you would rather paste the result straight into a To field.

[Grep lines](/util/grep_lines/) in invert mode finally removes the addresses that belong to systems: no-reply and do-not-reply senders, notification addresses, `bounces+…@` return paths, mailer-daemon and postmaster. Edit its pattern to drop more, for example `^(info|sales)@` when you only want named people, or turn the step off to keep everything.

## What it will not find

The pattern covers ordinary addresses, which is nearly all of them. It misses or cuts short addresses with non-Latin characters before the @ or a domain written in its Unicode form, quoted local parts such as `"j doe"@example.com`, and addresses written with HTML entities like `&#64;` instead of the @ sign. Addresses spelled out to dodge spam harvesters, as in "name at example dot com", are left alone on purpose. The steps also do not check that an address exists; a typo such as `gmial.com` passes through unchanged.

Bear in mind what the list is. Email addresses are personal data under the GDPR and similar laws, and having someone's address does not mean you may add them to a mailing list. Once you have a list you are allowed to use, [hashing an email list for Customer Match](/presets/hash-email-list-for-customer-match/) shows the normalisation advertising platforms expect before you upload it.

## Doing it in a terminal or a spreadsheet

On Linux or macOS, `grep -Eio '[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}' file.txt | tr 'A-Z' 'a-z' | sort -u` gets you most of the way, with one more `grep -Eiv` for the no-reply filter. Spreadsheets struggle with free text: REGEXEXTRACT in Google Sheets returns only the first match in each cell, so a cell holding three addresses gives you one. The preset handles any number per line, keeps every step visible, and runs in your browser, so the contact list never leaves your machine.
