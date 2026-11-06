---
title: Bulk MD5 Hash Generator: One Hash per Line for a Whole List
description: MD5-hash a list of strings at once, one 32-digit hash per line, with hidden characters and padding stripped first so each hash is the hash of the value you see.
---

## Hashing a list, not a blob

MD5 of a list of values is a common chore: a suppression list of email addresses to hand to a partner, a column of identifiers to compare with another system's hashed column, a set of filenames or keys to fingerprint. The catch is that a hash utility hashes whatever it is given as one input. Paste a column into it and you get one hash of the whole column, line breaks included, which matches nothing anyone else has. The job needs one hash per line, in the same order, with blank lines left blank so the result pastes back beside the original column.

The second catch is that MD5 is exact. A trailing space, a tab in front, a no-break space from a web page or a byte order mark at the start of a file saved by Notepad all change the hash, while the value looks the same on screen. A hash that fails to match for one of those reasons is very hard to debug later, so the pipeline removes them before hashing.

## What the steps do

[Invisible character remover](/util/remove_invisible/) deletes zero-width spaces, joiners, directional marks, the byte order mark and control characters, the things that show nothing yet count as bytes. The first example starts with a byte order mark and has a zero-width space on its third line; without this step those two rows would carry wrong hashes and look correct.

[Trim lines](/util/trim_lines/) strips spaces, tabs and no-break spaces from both ends of every line. Copying a column from a spreadsheet or a terminal is the usual source of that padding, and the third example, pasted from a web page with a no-break space at the end, is a typical case.

The last step is a run on each line that computes [MD5](/util/md5/) for every line on its own and writes the 32 lowercase hex digits back on that row. Empty lines are passed through untouched rather than hashed, so a blank cell stays a blank cell. Windows line endings are kept, so a list saved on Windows comes back the same way.

## Matching another party's hashes

Hashes only match if both sides prepared the values the same way. Email suppression lists are usually hashed after lowercasing, and sometimes after removing dots in Gmail addresses; the second example hashes the addresses as written, mixed case and all, so add a [change case](/util/case/) step before the hashing step when the other side lowercases, or start from the [Customer Match](/presets/hash-email-list-for-customer-match/) preset, which encodes Google's rules and uses SHA-256. For uppercase hashes, which SQL Server's `HASHBYTES` and some Windows tools print, add a change case step after the run-on-each. MD5 is fine as a fingerprint for matching lists; it is not a way to protect passwords, for which the [bcrypt](/util/bcrypt_hash/) or [Argon2](/util/argon2_hash/) utilities exist.

Every line is hashed, including a header row, so delete the header first or ignore the first hash. Values that contain characters outside ASCII are hashed as UTF-8, which is what `md5sum` and Python's `hashlib` do with UTF-8 input.

## Reuse and the shell

Open in the editor to swap MD5 for [SHA-256](/util/hash/), add the lowercasing step or change the trimming, then save the pipeline to your library and run the next list through it with the same settings. The `subelt` command-line tool runs a saved pipeline file over a file of values in a script, and the editor offers to save it to the browser extension when the installed extension supports every step. The list never leaves your browser. The shell equivalent is `while IFS= read -r v; do printf '%s' "$v" | md5sum | cut -c1-32; done < list.txt`, which hashes the padding and hidden characters along with the values; stripping them first is the part that is easy to forget.
