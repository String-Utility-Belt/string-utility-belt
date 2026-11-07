---
title: Hash an Email List With SHA-256 for Customer Match
description: Normalize and SHA-256 hash a column of customer emails the way Google Ads Customer Match expects, one hash per line, with headers and blank rows kept.
---

## Why the normalization matters more than the hash

Google Ads Customer Match and Meta's Custom Audiences match a customer list against their own users by comparing hashes of email addresses. A hash only matches if the address was written exactly the same way before hashing, and SHA-256 gives a completely different result for `Jane.Doe@Example.com ` (capital letters, trailing space) than for `jane.doe@example.com`. A list exported from a CRM or a spreadsheet is full of those differences: padding spaces, a non-breaking space pasted from a web page, quotes around every cell, mixed case. Hash it as it is and the match rate drops without any error to tell you why.

Google Ads' own upload screen accepts plain addresses and hashes them for you, following its own rules. This preset is for the cases where you have to hash first: uploads through the Google Ads API, a partner or clean-room upload, or a policy that only hashes may leave your systems.

## What each step does

A [replace](/util/replace/) step deletes spaces, tabs, non-breaking and zero-width spaces, and the double quotes a CSV file wraps cells in, while keeping the line breaks, so each address stays on its own row. [Change case](/util/case/) lowercases everything.

The third step applies Google's rule for Gmail: dots before the `@` are removed in `gmail.com` and `googlemail.com` addresses, because Gmail ignores them, so `j.smith.84@gmail.com` and `jsmith84@gmail.com` are the same mailbox. Dots in every other domain are kept, because there they can be part of a different mailbox. Plus addressing (`name+promo@…`) is kept for every domain, since neither Google nor Meta asks for it to be removed.

The last step runs [hash](/util/hash/) with SHA-256 on each line on its own, and only on a line that holds exactly one address. A header row, a blank line and a value that is already a hash pass through as they are, so the output has one row for every input row and lines up with the spreadsheet you copied from. Without the per-line step, the whole list would become a single hash.

## Meta, and checking your result

Meta asks for the same trimming and lowercasing but not the Gmail rule. Leave out step 3: the "What if you skip a step?" section above shows exactly that output for the first example. To check that a list was hashed the way Meta expects, look at the second example: `John_Smith@gmail.com` becomes `62a14e44f765419d10fea99367361a727c12365e2520f32218d505ed9aa0f62f`, the hash Meta's own documentation gives for that address.

## MD5 suppression lists

Email suppression lists exchanged between senders, such as an advertiser's opt-out list sent to an affiliate, are often MD5 hashes of lowercased addresses. Open the preset in the editor, leave out the Gmail step, and replace the hash step inside step 4 with [MD5](/util/md5/). Compare against the other party's list only after you both normalize the same way.

## Hashed emails and mobile advertising IDs

A search for "hashed email to MAID" is looking for a conversion that does not exist. SHA-256 is one-way, and a mobile advertising ID (Apple's IDFA, Google's advertising ID on Android) names a device, not a mailbox, so nothing in the hash points to a phone. The join happens inside the ad platform, not in your data. Google keeps the hashed form of every Google account's email address and compares your hashes with those; a match adds the account to the audience, and the ads reach that person where the account is signed in. Meta compares your hashes with its own hashed records in the same way. In both cases the result is an audience you can target, never a list of device IDs handed back to you.

If you already hold device IDs, upload them as device IDs. Google Ads takes a Mobile Device ID list only on its own, unhashed, as the single column of its file; Meta's customer lists take them in a `madid` column beside the email columns. What this page does is the hashing: the part of the match that has to happen before the list leaves your systems.

## Limits and privacy

- Paste the email column only. A line such as `Jane <jane@example.com>`, a row with several addresses, or a CSV row with other columns is not hashed: it is left as text, with its spaces removed and lowercased, so you can spot and fix it.
- Addresses are not validated. `name@domain` without a dot is hashed like any other.
- Phone numbers, names and postal codes, which Customer Match also accepts, need their own normalization and are not handled here.

A hashed email is not anonymous: anyone with a list of addresses can hash them and compare. Treat the output as the personal data it is. The hashing runs in your browser and this page stores nothing you paste. "Open in the editor" hands your input to the editor, which keeps recent inputs in this browser unless you open the History menu on its input panel and untick remember inputs (clear all removes what is stored), and a share link carries the input in the URL, so do not share links made from a real customer list.
