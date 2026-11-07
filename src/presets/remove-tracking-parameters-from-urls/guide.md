---
title: Remove Tracking Parameters From URLs in Bulk
description: Remove UTM parameters from URLs in bulk: strip utm_ tags, fbclid, gclid, srsltid and other click ids from many links at once, keeping what each page needs.
---

## Where tracked links come from

Links pile up tracking parameters wherever they travel. A page shared from Facebook gains `fbclid`, a click on a Google ad gains `gclid`, `gbraid` and `gad_source`, a product found through Google Shopping gains `srsltid`, and every newsletter adds `utm_source`, `utm_medium` and `utm_campaign` plus the email platform's own ids, such as HubSpot's `_hsenc`, Mailchimp's `mc_eid` or Klaviyo's `_kx`. None of them changes the page. They identify the visit or the person.

That matters when the links themselves are the data. A content audit or a sitemap check lists the same page five times under five campaign tags. Analytics exports split one landing page into dozens of rows. A link pasted into documentation, a chat or a redirect map carries a click id that belongs to someone else's visit, sometimes their email address in encoded form. Removing the parameters by hand means reading every query string and knowing which names are trackers and which ones the page needs, such as `variant=41`, `page=2` or `q=waterproof+jacket`. A one-link cleaner handles one of these at a time; this preset removes UTM parameters from URLs in bulk, one link per line, and the other trackers with them.

## What each step does

[unescape HTML](/util/unescape_html/) turns `&amp;` back into `&`. Links copied from an email template or a page's source are written that way, and without this step the parameter after one would be named `amp;utm_medium`, which no list matches. It decodes only the few escapes HTML requires, so a parameter named `reg` survives instead of becoming the ® sign.

The second step goes through the text one line at a time and runs [normalize query params](/util/query_params_normalize/) on each line that is one bare link with a query string: a full URL, a protocol-relative `//host/…` link, a root-relative path such as `/pricing?plan=pro` from an analytics report, or a host and path without a scheme. Its drop list holds the tracker names, matched in any capitalization, with `utm_*` and `hsa_*` as wildcards. The tool can also sort, deduplicate and lowercase. Those options are off, so the parameters that stay keep their order and spelling, and a link left with no parameters loses its `?`. Any `#anchor` stays where it was.

Lines that are not a bare link pass through untouched: a heading or note, a link inside quotes, brackets or parentheses, and a CSV row with commas. That is deliberate. Run over the whole list at once, the tool would read everything after the first `?` as one long query and delete whole links that followed a tracker.

## Which parameters go, and which stay

The list covers Google Ads, Merchant Center and Analytics (`gclid`, `gbraid`, `wbraid`, `dclid`, `gad_source`, `gad_campaignid`, `srsltid`, `_gl`, `_ga`), the big social networks (`fbclid`, `igshid`, `igsh`, `msclkid`, `twclid`, `ttclid`, `li_fat_id`), email platforms (Mailchimp, HubSpot, Marketo, MailerLite, Vero, Drip's `__s`, Klaviyo's `_kx`, Kit's `ck_subscriber_id`) and a few more from the ClearURLs and Firefox lists. Add your own names to the drop list in step 2, separated by commas.

`ref` and `si` are kept on purpose. `ref` often only says where a visitor came from, but some sites use it for referral credit or to choose what the page shows. `si` is the share id that Spotify and YouTube add, yet the name is short and generic enough that other sites use it for parameters they need. Add either to the list when you know it is only tracking on the links you clean.

## Limits and when not to use it

- Paste URLs, one per line, not HTML source. A link inside `href="…"` is not a bare link and stays as it is.
- Do not clean the landing page URLs of live ad campaigns. Google Ads attributes a conversion through `gclid`, `gbraid` and `gad_*`, and stripping them from a final URL or a tracking template breaks reporting.
- Parameters after a `#`, as in hash-routed apps (`/#/route?utm_source=x`), are not touched, since they are not part of the query. Queries separated by `;` instead of `&` are read as one parameter.
- Text escaped twice, `&amp;amp;`, is unescaped only once, so the tracker after it stays.
- Spaces around a link are trimmed. Repeated links are kept; add [deduplicate lines](/util/line_dedupe/) at the end for a unique list.

To add campaign tags rather than remove them, use the [bulk UTM link builder](/presets/bulk-utm-link-builder/).
