# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- **Sponsor on GitHub.** The site's footer and the about page link to the project's GitHub Sponsors page, for anyone who
  wants to support its development.

## [1.12.3] - 2026-10-09

### Fixed

- **Inputs that froze a run.** `normalize line endings` with CRLF output and "remove final newline" hung on text with a
  few dozen blank lines in a row, `extract` (HTML tags) on an unclosed tag full of `=` signs, and output-type detection
  on a long run of unclosed HTML comments (which a shared link's input could trigger on opening). Each now runs in
  linear time. Reading a share link in the CLI, MCP server and `@string-utility-belt/core` no longer slows to seconds
  on text holding many `#/p/` fragments.
- **`csv to markdown table`** kept a backslash right before a pipe as an escape, so `a\|b` ended its cell early; the
  backslash now stays literal and the pipe inside the cell.

## [1.12.2] - 2026-10-09

### Removed

- **Google Analytics.** The site sets no cookies and loads no tracking script: Cloudflare Web Analytics counts page views
  without cookies or identifiers, and never sees what you paste. The site itself counts only clicks on sponsor links, links
  to our tools and presets loaded into the editor, by id and with nothing about the visitor. The privacy policy, the about
  page and the README say so.

## [1.12.1] - 2026-10-09

### Changed

- **Recipes are now called presets.** The pages moved from `/recipes/` to `/presets/`, and the editor's
  Recipes button, the header link and the command palette's "Start from a preset" follow. Old `/recipes/…` links
  redirect permanently to the same page, and `#/recipes` links still open it.

## [1.12.0] - 2026-10-09

### Added

- **Recipes in the editor.** The editor's Presets button is now **Recipes**: it lists every published recipe by
  category, "Try it" loads the recipe's steps and worked example, and "How it works" opens its page. The command
  palette's "Start from a recipe" opens the same list.
- New recipes: **Extract unique email addresses from text** and **Clean up text pasted from Microsoft Word**.

### Removed

- The separate preset gallery. Single-step presets (Decode a JWT, CSV to JSON, Hex dump, JSON to YAML, …) live on as
  their utilities' own pages, and the multi-step ones as recipes. Pipelines you saved from a preset stay in your library.

## [1.11.2] - 2026-10-09

### Changed

- **One promo per page.** Utility, recipe and blog pages show only their sponsor slot (one of our own tools while it is
  unbooked), without the extra banner and side-column card; index and reading pages show one of our tools, and the
  strip under the header is gone.
- The about page and the README say plainly what the site measures: Google Analytics (without cookies in the EEA, the UK
  and Switzerland) and Cloudflare Web Analytics, neither of which ever receives what you paste.

## [1.11.1] - 2026-10-09

### Fixed

- Cloudflare Web Analytics counts visits again: the site's Content-Security-Policy blocked the script Cloudflare adds
  to each page. The privacy policy now describes what it collects.

## [1.11.0] - 2026-10-08

### Changed

- **New icons in the new brand**: the "sub" keycap on an orange tile, for the site (browser tab, home-screen and
  installed-app icons, with a sharp 32 px favicon) and the browser extension's toolbar. At 16 px the toolbar icon is a
  bold "s" key, so it stays legible.
- **Share cards in the new design**: the preview image a page shows when it's shared (Slack, X, LinkedIn and the
  like) uses the site's warm canvas, the keycap mark, Instrument Sans and JetBrains Mono.
- Plainer wording when the browser extension confirms a saved pipeline.

## [1.10.0] - 2026-10-08

### Changed

- **New look across the whole site.** Warm, flat surfaces with a single orange accent, Instrument Sans for text and
  JetBrains Mono for data, in light and dark. The header now has a search box for the command palette, icon links
  to the extensions, CLI and MCP server, and a keyboard shortcuts button. Every page and the pipeline editor were
  rebuilt in the new style; every feature works as before.
- **Browser extension: new look** for the toolbar popup and options page, matching the site in light and dark. The
  popup shows a clear banner when a right-click run fails and links to the options page; deleting a saved pipeline
  now takes a second click on "Confirm delete" instead of a browser dialog.
- **Plainer wording** on buttons, hints and the about, contact, integrations and advertise pages.

### Added

- **More of our own tools on content pages.** Besides the sponsor block, utility, recipe, blog, docs, changelog and
  index pages show our VS Code extension, command-line tool or MCP server in a thin strip under the header, a
  banner in the content or a card in the side column. Each is labelled "From String Utility Belt", none is sold to
  sponsors, and none appears on phones. The pipeline editor shows one of our own extensions under the output, and
  never a sponsor.

## [1.9.1] - 2026-10-08

### Changed

- The privacy policy says how long Google Analytics data is kept (14 months) and that a copy is exported to Google
  BigQuery in our own Google Cloud project, where it is also deleted after 14 months.

## [1.8.0] - 2026-10-08

### Added

- **"Run it from your terminal or AI agent"** on every utility page that the CLI and MCP server can run: the exact
  `npx subelt …` command for what the page's playground just did (updating as you type or change a parameter), the
  one-line MCP install for Claude Code, and the `run_utility` arguments an agent would send — each with a copy button.
- **Seven recipes built on run on each**: turn a `.env` file into a Kubernetes Secret; convert Unix timestamps
  in a JSON response to dates; decode every JWT in a log, HAR file or curl trace; remove tracking parameters
  from a list of URLs; hash an email list with SHA-256 for Customer Match; extract the domain from each URL in
  a list; parse the user agents of an access log into a CSV.

### Changed

- The MCP server's README starts with installing it from npm (`npx -y @string-utility-belt/mcp`) for Claude Code,
  Claude Desktop and other clients; building from a checkout moved to its own section.
- Recipe pages show what runs inside a run-on-each or branch step: every nested step with its link, the
  settings it changes, its condition and what happens when it fails, how an each step splits its input and
  how a branch merges its lanes, in the pre-rendered page too.
- **Decode CloudWatch Logs subscription data** decodes every record of a Kinesis or Firehose batch, not
  only the first, and finds the payload in an event printed by Python or Node.js. A message ending in a
  literal `\n` no longer stops it.
- **Excel column to SQL IN clause** escapes and quotes each value on its own, so the `mysql` flavor
  (backslash escapes) and the `mssql` flavor (`N'…'` for non-ASCII values) work per value.
- **Bulk UTM link builder** removes old `utm_` parameters with *normalize query params*, so names with
  digits, without `=` or percent-encoded are removed too, and the drop list takes more names (`fbclid`,
  `gclid`). Tags inside a `#fragment` are no longer removed.

### Fixed

- **gzip decompress** reports short input that is not gzip (`{`, `[`, a cut-off `H4sIAAAA`) as not valid
  gzip data instead of a failed integrity check.
- A recipe page with one numbered step says "1 step", on the page and on its share card.
- Leaving a recipe page stops working out its "What if you skip a step?" examples, instead of running them
  on in the background while the next page waits for the engine.

## [1.7.0] - 2026-10-08

### Added

- **Advertise page** (`/advertise/`, linked from the footer): who the site is for, the sponsorship formats on offer,
  what sponsors may and may not do, and how to book.
- **Sponsor block** on utility, recipe and blog pages: while a sponsorship is booked, the sponsor's logo, name, one
  line of text and a plain link, labelled "Sponsor" — served by this site, with no script, pixel or cookie. Until
  then it introduces our own tools, matched to the page (not shown on phones): the command-line tool on Kubernetes and
  cloud pages, the MCP server on hashing and security pages, the VS Code extension on data-format and recipe pages, and
  elsewhere the browser extension in a desktop Chrome, Edge or other Chromium browser that doesn't have it yet,
  otherwise the VS Code extension.

### Changed

- **No more Google AdSense.** The site loads no advertising scripts; any sponsorship is shown as part of the page,
  with no scripts, pixels or cookies, and never in the tool, embeds, extensions, CLI or MCP server. Without
  AdSense there is no consent message either: in the EEA, the UK and Switzerland Google Analytics now always runs
  without cookies. The privacy policy, about and contact pages say so.

### Security

- **Content-Security-Policy** on every page: scripts only from the site itself and Google Analytics, inline scripts
  only by hash, no plugins, no `<base>` changes, forms only to the site. The custom JavaScript sandbox runs under it
  too. Every build checks the pre-rendered pages against it, and the end-to-end tests run under it.

## [1.6.0] - 2026-10-08

### Added

- **Recipes in the browser extension** — every recipe page offers "Save to extension" when the String Utility
  Belt extension is installed, saving the recipe under its name to the right-click menu in one click. In a
  desktop Chrome, Edge or other Chromium browser without it, the page links to the extension's Chrome Web
  Store listing instead; other browsers and phones, which can't install it, see neither.

### Fixed

- CSV: an empty value in a one-column table no longer disappears. `csv normalize headers` used to drop it
  (it parsed as a blank line), and `json to csv` wrote it as a blank line that `csv to json` skipped; both
  now write it as `""`, and `csv normalize headers` also keeps a final `""` that has no trailing newline.

## [1.5.0] - 2026-10-07

### Added

- **Recipes** — ready-made multi-step pipelines for real tasks, each with its own page at
  `/recipes/<slug>/` (index at `/recipes/`, linked from the header, the home page and the pages of the
  utilities they use). A page opens with the worked example running live, shows every step's output and
  why it is there, what leaving each step out does, then a guide; "Open in the editor" loads the steps and
  your input into the tool. Pages are pre-rendered for search engines, with the step outputs computed at
  build time. Twelve to start: decode a SAML request, a Flask session cookie, CloudWatch Logs subscription
  data and a Helm release secret; Spring Boot `application.yml` to environment variables; fix
  `/bin/bash^M: bad interpreter`; unescape stringified JSON; nested JSON to CSV; an Excel column to a SQL
  `IN` clause; fix line breaks in text copied from a PDF; remove ChatGPT formatting; a bulk UTM link builder.
- `npm run check:recipes -- <slug…>` checks recipes with the engine the build uses.
- **Run on each** — a new pipeline step that splits its input into lines, pieces between a separator, the
  elements of a JSON array or the values of a JSON object, runs the steps inside it on every item on its
  own, and puts the results back in place (CRLF line endings and a final newline kept). Add one from the
  toolbar, or select steps and choose *Run on each line*. On error decides what a failed item becomes, the
  card counts failed items, and nested previews show the first item that failed. It works in share links,
  embeds, the library, the HTTP API (`"type": "each"`), the CLI, the MCP server and the editor extensions.
- Recipe: **decode a Kubernetes Secret** — every value under `data` decoded at once, keys kept, from
  `kubectl get secret -o yaml` or `-o json` (the first recipe built on run on each).

### Changed

- Pipelines that use a run-on-each step are saved and shared as schema v3. Pipelines without one are still
  written as v2, so they keep opening in older builds; a v3 link opened in an older build asks to reload
  instead of dropping the step.

### Fixed

- **unwrap** keeps list items that start with the bullets text copied from a PDF carries (`●`, `○`, `■`,
  Word's private-use bullet) and parenthesised markers (`(a)`, `(12)`, `(iv)`), instead of joining them
  into one paragraph.
- A page for an unknown utility (`/util/<id>/`) is no longer offered to search engines (`noindex`).

## [1.4.0] - 2026-10-06

### Added

- **210 new utilities**, bringing the registry to 246 across 16 categories (counts from
  `src/utilities/_generated/manifest.ts`): Data Formats (37), String Ops (29), Encoding (25),
  Formatting (25), Decoding (23), Analysis (21), Web & Dev (15), Generators (13), Ciphers (12),
  Hashing (11), Lines (10), Numbers (8), Compression (7), Date & Time (4), URL & JSON (4), Color (2).
  Every utility ships colocated tests, `tags`, `aliases` and worked `examples`.
- **Pipeline & engine** — lazy per-utility code loading (one chunk per utility instead of one bundle),
  execution in a Web Worker off the main thread, cooperative cancellation via `AbortSignal`, per-step
  conditions (`always` / `nonEmpty` / `regex` / `type`, with negation), per-step error policies
  (`passthrough` / `stop` / `empty`), branching steps that fork a pipeline and merge the results
  (`concat` / `zip` / `json` / `pick`), and named macros that collapse a sub-chain into one reusable step.
- **Share links & embed** — pipelines (and optionally their input) compress into a shareable `#/p/…` URL,
  plus a minimal iframe-able `#/embed/…` view for dropping a pipeline into a blog post or wiki page.
- **Library & presets** — a named pipeline/macro library (save, rename, delete, export/import as JSON) and
  a shipped preset gallery for common chains.
- **Magic decode** — inspects the input or the pipeline's output, guesses the encoding, and suggests
  matching decode steps; picking one appends it to the pipeline.
- **New param kinds** — `textarea`, `regex` (with a linked flags param), `keyvalue`, `file`, `color`,
  `date`, `multiselect` and `range`, each with declarative validation (`required`, `min`/`max`, `step`,
  `integer`, `pattern`, `maxLength`).
- **Discoverability** — a fuzzy command palette (Ctrl+K) with keyboard shortcuts, per-utility
  documentation pages (`/util/:id/`) with a live playground and related-utility links, an all-utilities
  index page, and a light/dark theme toggle.
- **Quality & infra** — fast-check round-trip property tests, a golden test that runs every utility's
  documented examples, a Playwright end-to-end smoke suite, a bundle-size budget check, `tsc --noEmit`
  and lint in CI, this changelog, an RSS feed, and pre-rendered per-utility pages with a sitemap and
  generated Open Graph images.
- **Platform** — an installable PWA, a framework-free core package, a `subelt` CLI, an HTTP API and fetch
  proxy on the existing Cloudflare Worker, an MCP server exposing utilities/pipelines as agent tools, and
  browser + VS Code extensions, all built on the same utility core.
- **Site pages & search** — About, Privacy policy and Contact pages linked from a new site footer; a
  popular-tools section on the home page; utility pages open with their playground; links between pages are
  real addresses (`/utilities/`, `/util/<id>/`, `/blog/<slug>/`) that search engines can follow; every
  production build now ships the pre-rendered pages, sitemap and preview images; unknown addresses show a
  "page not found" notice and stay out of search results; structured data for the site name, blog posts
  and breadcrumbs.
- **Browser extension: favourites and saved pipelines** — the right-click menu lists your favourite
  utilities in your order, then saved pipelines that run with their saved settings (a failing step leaves the
  page untouched). The options page reorders favourites and renames, reorders, deletes, opens or imports
  (from a share link) pipelines; the toolbar popup lists both first and can run a pipeline.
- **Save to extension** — with the browser extension installed, the pipeline toolbar offers "save to
  extension" for the current pipeline (saving under an existing name updates it) and your starred utilities.
- **Chrome extension in the header** — "Get it for" now links the Chrome Web Store listing, and the
  integrations page has a browser extension section.

### Fixed

- Browser extension: the popup's utility dropdown no longer shows invisible light-on-white text in dark mode,
  and the toolbar icon gains a 32 px size for high-DPI screens.
- The blog now ships from `public/blog/` instead of `./blog/`, which Vite never copied into `dist/` — in
  production, `/blog/_manifest.json` and every `/blog/<slug>.md` returned a 404.
- **Accessibility & mobile** — no horizontal page scroll at 375 px on any screen, 40 px tap targets, AA text
  contrast in both themes (danger/success/warn tokens and placeholders darkened), named controls, visible
  focus everywhere, `aria-current` nav, a Tab-friendly utility picker, and landmarks/headings on the embed view.

### Security

- `POST /api/run` is now rate-limited per client IP (60 runs a minute), like the fetch proxy; it answers
  `429` with `retry-after` beyond that.
- The fetch proxy (`GET /api/fetch`) now refuses requests without `Sec-Fetch-Site: same-origin`, so
  scripts and other header-less clients can no longer use it as a general-purpose proxy.
- The HTTP API refuses a `repeat` step or a branch merge that would pass its 8 MiB output limit before
  building the oversized value, instead of allocating it first and risking the Worker's memory limit.
- Share links, embeds and imports: select params naming an `Object.prototype` member are refused (a
  `base58_encode` alphabet of `constructor` looped until the tab died); 27 utilities' quadratic regexes
  rewritten to linear forms; a pipeline that crashes the background worker is no longer replayed on the
  main thread; shared pipelines that can only run on the main thread wait for an explicit Run.
- HTTP API: input caps for utilities with superlinear worst cases (`sql_format`, `markdown_to_html`,
  base58/base62). SSRF classifier now also refuses hostnames embedding private/metadata IPs.
- CLI: `--allow-custom-js` is refused together with `--share`. Static assets send `nosniff`,
  `Referrer-Policy` and `Permissions-Policy` headers.

## [1.3.0]

### Added

- The baseline this changelog starts from: 36 string utilities chained into visual pipelines with live
  previews — base64 encode/decode, case, count, diacritics, escape_html/unescape_html, format_case,
  get_bytes, hash (SHA-256/384), hex_encode/decode, json_escape/unescape/minify/pretty, length,
  line_dedupe, line_sort, md5, normalize, number_lines, pad, regex_extract, remove_blank_lines, repeat,
  replace, reverse, rot13, slice, slug, split_join, trim, truncate, url_encode/decode.
