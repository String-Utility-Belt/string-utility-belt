# String Utility Belt

A React app for chaining string transformations into visual pipelines with live previews — plus the
same engine shipped as a CLI, HTTP API, MCP server, browser extension and VS Code extension.

## Stack

- **Frontend:** React 18, TypeScript, Tailwind CSS (design tokens as CSS vars, `.dark` class), Framer Motion, CodeMirror (lazy)
- **Design system:** tokens and component classes in `src/index.css` (`canvas`/`surface`/`surface-2`/`strip`, `line`/`line-2`,
  `fg`/`muted`, `acc*`, `inv*`, `danger*`, `add-*`/`del-*`; `.btn`, `.btn-ghost`, `.cta`, `.btn-inv`, `.field`, `.pill`,
  `.segmented`, `.popover`, `.menu-item`, `.page-title`, `.link-row`, `.md`). Flat hairline surfaces, one accent; a
  shadow only on things that float. Instrument Sans + JetBrains Mono (Google Fonts, disclosed in the privacy policy)
- **Build:** Vite 7 with `@vitejs/plugin-react`; custom plugins in `scripts/` (utility manifest, PWA service worker)
- **Deploy:** Cloudflare Workers via Wrangler — static assets + the `/api/*` Worker. Released by the Release workflow
  (see "Releases" below); `npm run deploy` is the manual fallback
- **Tests:** Vitest + Testing Library + jsdom, fast-check property tests, Playwright E2E, `vitest bench`
- **Lint:** ESLint 9 flat config with typescript-eslint, react-hooks, react-refresh

## Commands

```bash
npm run dev          # gen + Vite dev server (port 5173 may be taken; launch.json uses autoPort)
npm test             # vitest run (all tests, incl. packages/ and worker/)
npm run typecheck    # tsc --noEmit (CI also checks tsconfig.worker.json and each packages/*/tsconfig.json)
npm run lint         # ESLint
npm run gen          # regenerate src/utilities/_generated/* (predev/prebuild run it)
npm run build        # production build, then (postbuild) build:seo — OG images only in Workers Builds (WORKERS_CI);
                     # npm run check:bundle enforces bundle-budget.json
npm run build:seo    # pre-rendered pages (/util/<id>/, /docs/, site pages, 404.html), sitemap, RSS, OG images (build:seo:fast skips OG)
npm run check:guides -- <id…>  # check utility guides quickly (loads only those utilities; no ids = all)
npm run check:presets -- <slug…>  # check presets with the build's engine (no slugs = all, plus cross-preset rules)
npm run build:tools  # packages/{core,cli,mcp,extension,vscode}
npm run test:e2e     # Playwright against a production build
npm run deploy       # build:site (build + build:seo) + wrangler deploy (manual; releases deploy from CI)
npm run release -- plan   # what a release from HEAD would ship, at which versions (read-only; RELEASING.md)
npm run events            # counted clicks from Analytics Engine (-- --days N | --month YYYY-MM; needs a CF token)
npm run readme:demo       # re-record .github/readme/demo.gif from dist/ (after npm run build; needs ffmpeg)
```

## Architecture

### Core engine (`src/core/`)
- Framework-free: relative imports only, no DOM/React. Consumed by the app, the Worker API and every package.
- `coerce` (value types, `coerceInputFor`, `isBytes`, display formatting), `params` (resolve defaults,
  declarative validation), `registry` (metadata + lazy loader, env/capability checks), `runner`
  (`runPipeline(source, steps, { load, previews, signal, env, onStep })`), `serialize` (schema v3,
  migration, `#/p/…` share links bounded by `MAX_SHARE_CHARS`), `steps`, `split`, `sandbox`, `streaming`, `detect`.
- The runner enforces declared number/range bounds as step errors and caps any step's output at
  `MAX_VALUE_SIZE` (64 MiB; `maxValueSize` overrides it — the Worker uses 8 MiB), checking a branch's
  lanes before merging them. Steps can be utility steps, `branch` steps (parallel, merged
  concat/zip/json/pick), `macro` steps or `each` steps, each with an optional `condition` and `onError` policy
  (`passthrough` default, `stop`, `empty`).
- `each` ("run on each") splits its input (`split.ts`: lines, a literal delimiter, JSON array elements, JSON
  object values), runs its `steps` on every item in a scratch result, and rejoins. Its `onError` also decides
  what a failed item becomes. One run shares an item budget (`MAX_EACH_ITEMS`, 100 000; `maxEachItems`
  overrides it — the Worker uses 10 000), yields to the host between items (`yieldToHost`) so a cancel lands,
  loads each utility once per each step, and records previews for one sample item (`RunResult.items`). Never
  chunked (`canChunk`).
- A new step type goes through `steps.ts`: its guard, `childSequences` and `mapChildSequences` (where it
  keeps nested steps). Tree walks and rebuilds (`walkSteps`, `updateStep`, `cloneWithNewIds`, quarantine,
  bulk enable) use those, so they need no change; `sanitizeSteps` must parse it strictly (and drops any
  unknown `type`).
- Documents carry the oldest schema that can read them (`schemaVersionFor`): v3 only when an `each` step is
  present, else v2. Every reader refuses `v > SCHEMA_VERSION`, so an older build asks to reload rather than
  drop steps it cannot read. Write `schemaVersionFor(steps)`, never `SCHEMA_VERSION`, into stored documents.

### Utility system (`src/utilities/`)
- Each utility lives in `src/utilities/<id>/index.ts` as a default export of type `Utility`.
- `scripts/gen-utilities.ts` (`npm run gen`) writes `src/utilities/_generated/`: `manifest.ts`
  (metadata only), `loaders.ts` (one dynamic import per utility), `examples.ts`, `static.ts`.
  `generated.test.ts` fails when these are stale.
- Three registries — pick the right one:
  - `src/utilities/lazy.ts` (`registry`, re-exported from `src/app/registry.ts`) — **the web app**. Metadata up front, code per chunk.
  - `src/utilities/static-registry.ts` — CLI, MCP, Worker, extensions (no `import.meta.glob`).
  - `src/utilities/index.ts` (`UTILITIES`, `UTIL_MAP`, back-compat `runPipeline(source, steps, wantPreviews)`) — **tests and Node only**. Never import it from app code: it pulls every utility into the entry chunk.

### Utility guides (SEO)
- Every utility has `src/utilities/<id>/guide.md`: frontmatter `title` (the page `<title>`, ≤ 60 chars) and
  `description` (meta description, 80–160), then `##` sections with ```` ```example ```` blocks. Format and
  parser: `src/app/pages/guide.ts`. Rules: `src/utilities/guideCheck.ts`, enforced by `guides.test.ts`
  (every example is executed like a golden example; links must be `/util/<id>/` paths to real utilities).
- Not bundled as JS: `scripts/vite-plugin-guides.ts` serves them at `/guides/<id>.md` in dev and emits
  them as assets in `vite build`. `UtilityDocPage` fetches its guide and shows it in a collapsed `<details>`
  (`UtilityGuide.tsx`); `scripts/seo/build.ts` pre-renders the same markup plus the guide's title/description
  into `/util/<id>/`. Related-utility and guide links use crawlable `/util/<id>/` hrefs with in-app
  navigation (`navigateToPath` in `src/lib/router.ts`).
- `Utility` (`src/types/utility.ts`): `id`, `name`, `category`, `description`, `accepts`, `produces`,
  `params`, `tags`, `aliases`, `examples`, `env` (`dom`/`wasm`/`eval`/`main` capability flags, detected
  by the generator), `streamable`, `apply(input, params, ctx?)` where `ctx` carries `signal` and `env`.
- `ValueType` is `'string' | 'bytes' | 'json'`; values coerce automatically between steps.
- `ParamSpec` kinds: `string`, `number`, `boolean`, `select`, `code`, `textarea`, `regex`, `keyvalue`,
  `file`, `color`, `date`, `multiselect`, `range`. Numbers/ranges that multiply output size or work
  (counts, widths, iterations) must declare `max` — the runner rejects out-of-range values.

### Presets (`src/presets/`) — pre-rendered pipeline pages
- A preset is a hand-picked multi-step pipeline for one real task, published at `/presets/<slug>/` (index: `/presets/`).
  Folder per preset: `preset.ts` (default export `Preset`: top-level steps built with `step()`/`branch()`/`each()` from
  `define.ts`, each with a `why`; nested steps with `laneStep()`/`laneBranch()`/`laneEach()`, which carry no `why` and
  spell out regex condition flags as `sanitizeSteps` stores them (never raw literals); `each()` runs its steps on every
  line or JSON value; 2+ `samples` with golden outputs, the first is the page's worked example) and `guide.md` (frontmatter `title`/`description` for the page head, then prose `##` sections — no
  example blocks). `npm run gen` also writes `src/presets/_generated/` (`index.ts` metadata, `loaders.ts` one chunk
  per preset with its guide via `?raw`, `static.ts` for Node); `generated.test.ts` fails when stale.
- Rules (`check.ts`, run by `presets.test.ts` and `check:presets`): real utilities/params, no `dom`/`main`/`eval`
  steps (the build runs presets in Node, the page in a worker), every sample reproduces its output on every run and
  at any date, **every top-level step changes some sample's output when left out** (no padding), 2+ real utility steps
  counting nested ones (one utility wrapped in `each` is still one), title/description/primaryQuery unique across presets
  and utility guides, `primaryQuery` neither inside a utility guide title nor containing its head term (the title before
  " — ", minus "Online": "bulk slug generator" competes with `/util/slug/`), ≥300 words of guide prose, no near-copied prose.
- `trace.ts` turns a run into what the page shows (each step's output, what leaving each step out does).
  `PresetArticle` renders nested steps recursively (params, conditions, failure policy, split and merge modes):
  the pre-rendered page is all a crawler sees, so a setting inside a lane must show there.
  `scripts/seo/build.ts` traces every preset with the static registry, **fails the build** if the first sample's
  output drifted, renders `PresetArticle` with `renderToStaticMarkup` and embeds the trace as
  `<script type="application/json" id="preset-trace">`. `PresetPage` reads that trace, so nothing runs on load; the
  first edit runs live (worker). `main.tsx` preloads a preset route's chunk and data before mounting
  (`preloadable`, capped at 2.5s) so React replaces the static HTML with the same page, not "Loading…".
- The editor's Presets button (`src/app/library/PresetsButton.tsx` → `PresetGallery.tsx`, lazy: the index stays out of the
  entry chunk) lists `PRESET_INDEX` by category; "Try it" loads one preset chunk and replaces the pipeline (undoable).
  A shipped example pipeline is a preset, and a one-utility example belongs on its utility.
- "Open in the editor" (`openInEditor.ts`) autosaves the visitor's pipeline to the library, saves the preset as the
  working pipeline and hands off the input; its href is a `#/p/` share link carrying only the example input.
- A `<textarea>` turns CRLF into LF: pasted Windows line endings never reach a preset, only the samples' own text.

### App (`src/app/`)
- `AppShell.tsx` — header/nav, lazy route pages, command palette, shortcuts help, theme, PWA install/update, frame-busting.
- `ToolContext.tsx` + `store/pipeline.ts` — pure reducer with undo/redo (coalesced edits); persisted pipeline.
- `tool/` (tool page, IO panels, step list), `engine/` (Web Worker execution, chunked mode, cancellation,
  adaptive debounce), `io/` (file/fetch input, history, diff/hex/output views, stats, download),
  `share/` (share links, `trust.ts` quarantines `custom_js` from links), `sandbox/` (custom JS runs in a
  sandboxed iframe + worker), `library/` (named pipelines, the editor's preset gallery), `magic/` (auto-detect),
  `search/`, `commands/`, `pages/` (utility index/doc pages, embed, changelog), `pwa/`, `i18n/`, `theme/`.
- Components in `src/components/` (`StepCard`, `UtilityPicker`, `ParamsEditor` + `params/*` per kind, `CopyAsMenu`, …).

### Routing (`src/lib/router.ts`)
- Hash routes: `#/` home, `#/p/<payload>` shared pipeline, `#/embed/<payload>`, `#/utilities`,
  `#/util/:id`, `#/presets`, `#/presets/:slug`, `#/blog`, `#/blog/:slug`, `#/changelog`, `#/docs` (usage guide),
  `#/about` | `#/privacy` | `#/contact` | `#/integrations` | `#/advertise` (`SITE_PAGES`).
- A page with no hash routes by its pathname (pre-rendered `/util/<id>/`, `/utilities/`, `/presets/<slug>/`, `/docs/`, `/blog/…`, `/about/`…);
  any other non-root path is `notFound`: the tool with a "page not found" notice that sets `noindex`. The host answers
  it with `dist/404.html` and a 404 status (`not_found_handling: "404-page"`), so a new path-routed page must also be
  pre-rendered by `scripts/seo/build.ts`, or it 404s on a direct load. A page that moves keeps its old path working with a
  301 in `public/_redirects` (presets were `/recipes/` until October 2026), which `vite preview` also applies
  (`scripts/redirects.ts`, a deliberately small subset of the format that throws on anything else).
- **Links use real paths, never `#/` routes** (search engines drop fragments): `href="/utilities/"`,
  `utilityPath(id)`, `/blog/<slug>/`. `AppShell`'s `useInAppLinks` turns plain clicks on any `isInAppPath`
  href into `navigateToPath` (pushState, no reload). It listens on `document`, so a link's click must bubble:
  a React `stopPropagation()` on it (or an ancestor) means a full page load. Hash routes still resolve for old links and commands
  (`#/recipes…` included).

### SEO & sponsorship
- `src/app/pages/seo.ts` holds the search-facing strings both the app (`useDocumentMeta`) and the
  pre-render use — titles go through `pageTitle()` (site name only when it fits 60 chars). Change a
  title/description there, never in only one place: Google indexes the rendered page.
- Sitemap `lastmod` is when the page's content last changed, never the build time: a utility page's folder's last
  commit on the first-parent history (or a newer preset it links to), the file a docs/site page renders, a preset's or
  post's own dates; an index takes its newest entry (`scripts/seo/lastmod.ts`, one `git log` pass). A shallow clone
  gives every git-dated page HEAD's date, so the deploy job checks out full history.
- Site pages: `src/app/pages/content/{about,privacy,contact,integrations,advertise}.md` (frontmatter
  title/description, guide markdown syntax, own `#` heading), rendered by `SitePage` and pre-rendered by
  `build.ts`. The privacy policy says what leaves the browser (Cloudflare Web Analytics, Google Fonts, the server features) — keep it accurate when data flows change.
  `advertise.md` is the sponsors' media kit: keep its promises (formats, rules) in step with what the site does.
- GitHub Sponsors (`GITHUB_SPONSORS_URL`, `src/app/support.ts`) is for people supporting the project; `/advertise/` is for
  companies buying a sponsor slot. The footer (app and pre-render), the about page, the README and `.github/FUNDING.yml`
  link the same account (`support.test.ts`).
- Usage guide: `src/components/Docs.tsx` (`/docs/`), pre-rendered by `build.ts` with `renderToStaticMarkup` of the
  component itself — keep its render free of browser APIs (effects are fine).
- No ad network: sponsorship is sold directly (`/advertise/`) and must render as part of the page — no
  third-party script, pixel or cookie (the CSP blocks them, and people paste tokens and secrets into this site).
  Content pages only; never in the pipeline editor, an embed, the extensions, the CLI or the MCP server. The pipeline
  editor shows only our own tools (`ToolPromo`, house-only by design: no sponsor's content sits beside pasted secrets).
- Sponsors (`src/app/sponsors/`): bookings in `sponsorships.ts` (scope `site` or a topic from `topics.ts`, inclusive
  UTC `start`/`end` days, logo in `public/sponsors/`); `sponsors.test.ts` enforces `check.ts` (100-char text, https
  link, ≤50 KB logo, no script/handler/external reference in an SVG, one booking per scope per day) and that topics
  name real, non-overlapping pages. A topic booking beats a site-wide one. `SponsorBlock` is the one markup, at the end
  of the header of utility, preset and blog pages: the app renders `PageSponsor` (today's sponsor, a `sponsor_click` count;
  its link's UTM campaign is the booking id and its content the page), `scripts/seo/build.ts` pre-renders the sponsor live on the build day.
  Both go through `Slot` (the shared layout).
- An unbooked slot shows one of our own tools (`HousePromo` → `PromoBlock`, `promos.ts`; one promo per
  `INTEGRATION_LINKS` entry, same links and `INTEGRATION_ICONS`): labelled "From String Utility Belt", never "Sponsor".
  A topic's own tool first (`TOPIC_PROMOS`: Kubernetes/cloud → CLI, security/hashing → MCP, data formats → VS Code),
  then VS Code on other preset pages (`PresetExtension` offers the browser extension), else the browser extension where
  `canInstallExtension()` and it has not answered, else VS Code. Store pages open in a new tab, the CLI/MCP sections of
  /integrations/ in place. Hidden below `sm`; nothing while the extension is still answering, unless the page's promo is
  browser-independent (`fixedPromo`). Preset pages, whose pre-render matches the app, pre-render that promo so they
  never shift; a click counts as `integration_click` from `promo` and marks the integrations seen.
- Extra house slots (`PagePromo` → `ExtraPromo`): `inline` (banner in the content), `rail` (side-column card) and
  `strip` (under the header, rendered by `AppShell`) on content pages only. They are **never sold** — the sponsor
  slot stays the page's one sponsor, as `/advertise/` promises. **A page shows at most one promo**: `promoPlan(page)`
  leaves every extra slot of a sponsorable page (utility, preset, blog post) empty, gives an index or reading page one
  browser-independent tool with an on-site link (the MCP server) in whichever of `inline`/`rail` its layout carries
  (none carries both), and never fills the `strip`. A slot the plan leaves empty renders nothing; `e2e/promos.e2e.ts`
  fails on a desktop page showing two. Hidden below `sm`; clicks count as `integration_click` from
  `promo_<slot>`. Never on `/advertise/` itself.

### Content-Security-Policy (`public/_headers`)
- Inline scripts are allowed by SHA-256 only (no `'unsafe-inline'`): `index.html`'s theme script and the
  custom-code sandbox's bootstrap (`SANDBOX_BOOTSTRAP_SCRIPT`). Editing one changes its hash:
  `scripts/csp.test.ts` names the hash to add and the one to drop. Every `npm run build` checks all built pages
  (`scripts/csp.ts`) and fails on an unlisted inline script, an inline `on*=` handler or a `javascript:` URL.
- The sandbox's srcdoc frame and its Blob-URL Worker inherit the site policy on top of their own, so its per-run
  job travels in a JSON data block and the bootstrap stays constant; `'unsafe-eval'` is there because the
  sandbox Worker compiles the user's code (engine.e2e.ts fails without it).
- `vite preview` serves the `/*` headers (`scripts/headers.ts`), so Playwright runs under the real policy
  (`e2e/csp.e2e.ts` fails on any violation report). A new third-party script needs a CSP entry, and a privacy
  policy update.

### Analytics
- No cookies and no tracking scripts. Cloudflare Web Analytics (cookieless; the zone injects its beacon at the edge,
  so no build sees it) counts page views per path, with countries, devices and load timings; it drops the query and
  fragment, so share links' input never reaches it. Google Analytics was removed on 2026-10-09.
- The site counts three events itself (`src/lib/countedEvents.ts`, the contract): `sponsor_click {sponsorship, page}`,
  `integration_click {integration, source}` and `preset_open {preset, source: 'page'|'gallery'}` (a preset loaded
  into the editor from its page or from the editor's Presets dialog). The app sends them with `countEvent()`
  (`src/app/events/countEvent.ts`: `sendBeacon`, production host only, never under webdriver) to `POST /api/event`
  (`worker/events.ts`: same-origin only, rate-limited, strict allow-list parse), which writes one Workers Analytics
  Engine data point (index = event name, blob1/blob2 = its ids, nothing about the request) to the `sub_events`
  dataset (`EVENTS` binding, kept three months). A new event or field changes the contract, the report
  (`scripts/events/report.ts`) and the privacy policy's "Clicks we count ourselves" together; ids only, never text.
- `npm run events [-- --days N | --month YYYY-MM]` prints the counts (needs `CLOUDFLARE_ACCOUNT_ID` and a
  `CLOUDFLARE_API_TOKEN` with Account Analytics: Read); `--month` is a sponsor's monthly click report. Counts are
  indicative (anyone can forge a same-origin header from a script); sponsors also see clicks under their UTM campaign.
- Search data: BigQuery project `string-utility-belt` (US) holds the Search Console bulk export (`searchconsole`, from
  2026-10-08), plus GA4 export tables (`analytics_507388453`) that expire 426 days after collection. Presets were
  recipes until October 2026: older GA data says `recipe_*` and `/recipes/`.

### State
- Pipeline config persisted to localStorage under `string-utility-belt` (`src/lib/persist.ts`).
- Library under `sub:library`; preferences under `sub:pref:<name>` (theme, locale, favorites, recents).

### Worker (`worker/`) and packages (`packages/`)
- `worker/api.ts`: `POST /api/run`, `GET /api/utilities[/:id]` (public CORS, rate-limited, per-request
  budget), `GET /api/fetch?url=` (same-origin fetch proxy with SSRF guards), `POST /api/event` (counted events). Everything else is static assets.
- `packages/core` is a build artifact over `src/core` + the static registry; `cli` (`subelt`), `mcp`
  (stdio server; runs jobs in killable child processes), `extension` (MV3), `vscode`. Each has a README.
- App ↔ extension: `src/core/extensionBridge.ts` is the shared contract (messages, `BRIDGE_ORIGINS`, the store
  extension id, which utilities the extension can run, and — via `stepTypes` in its ping answer — which step
  types it can save; an answer without it means `LEGACY_STEP_TYPES`). The extension is `externally_connectable` from those origins
  (no content script: a new install warning would disable the published extension); `src/app/extension/` pings it
  with `chrome.runtime.sendMessage` and shows "save to extension" only when it answers.

## Categories

`Encoding`, `Decoding`, `Hashing`, `Ciphers`, `Compression`, `Data Formats`, `String Ops`,
`Lines`, `Formatting`, `Analysis`, `Generators`, `Web & Dev`, `Numbers`, `Date & Time`, `Color`
(plus the legacy `URL & JSON` used by the original url/json utilities).

Any dependency (`yaml`, `smol-toml`, `turndown`, `marked`, `sql-formatter`, `diff`, `cronstrue`,
`hash-wasm`, `qrcode-generator`, `franc-min`, `ua-parser-js`, `pluralize`, `fflate`, `brotli`) MUST be
loaded with a dynamic `await import(...)` inside `apply`, cached in a module-level variable — never a
top-level static import. The static registry and the eager test registry import every utility module,
so a static import would bloat every non-browser host and the per-utility chunks.

## Adding a new utility

1. Create `src/utilities/<id>/index.ts` exporting a default `Utility` object
2. Create `src/utilities/<id>/index.test.ts` with tests
3. Create `src/utilities/<id>/guide.md` — the SEO guide for its doc page (see "Utility guides" above;
   `src/utilities/base64_encode/guide.md` and `src/utilities/pad/guide.md` are the references), then
   `npm run check:guides -- <id>`
4. Run `npm run gen` (dev/build do it automatically; the test suite fails if you forget)

Registry tests require: a description, ≥3 lowercase `tags`, ≥1 `example` whose params pass validation
(examples run as golden tests and render on the doc page), and a `max` on amplifying number params.

```ts
import type { Utility } from '@/types/utility'

const util: Utility = {
  id: 'my_util',
  name: 'my util',
  category: 'String Ops',  // see the category list above
  description: 'What it does, in one sentence.',
  accepts: 'string',
  produces: 'string',
  tags: ['keyword', 'synonym', 'use case'],
  examples: [{ title: 'basic', input: 'abc', output: 'abc' }],
  params: {
    option: { kind: 'boolean', label: 'some option', default: false }
  },
  apply: (input: any, { option }: any) => {
    return String(input)
  }
}
export default util
```

## Adding a preset

1. Pick a task people search for that needs 2+ utilities, and check no utility page already owns the search:
   `grep -ih "^title:" src/utilities/*/guide.md | grep -i "<query>"` must print nothing
2. Create `src/presets/<slug>/preset.ts` (see `src/presets/excel-column-to-sql-in-clause/` and `types.ts`): steps
   with a true `why` each (verify against the utility source), 2–4 realistic samples (example.com, RFC 5737 IPs,
   vendor test vectors — never real data or secrets); generate encoded/compressed sample data with a script
3. Write `guide.md`: why single tools fail at this, what each step does and why the order matters, honest limits,
   how to do it elsewhere; link utilities as `[name](/util/<id>/)`
4. `npm run check:presets -- <slug>` until it passes, then `npm run gen`

## CI

GitHub Actions (`.github/workflows/ci.yml`): tests, typecheck (app, worker, e2e, packages), lint, build +
`check:bundle` + `build:seo:fast`, `build:tools` + package tests, `wrangler deploy --dry-run`, and Playwright.

## Releases (`RELEASING.md`)

Nothing is published by hand: merging to `main` releases what changed. Never push to `main`, create or move
`<id>-v*` tags, edit `chore(release)` commits, or start the Release workflow unless the user asks.

- **How it works.** `.github/workflows/release.yml` runs after CI passes on `main` and releases only the targets
  (`app`, `core`, `cli`, `mcp`, `vscode`) whose shipped files changed since their last `<id>-v<version>` tag. It bumps
  versions the merged PR didn't (see labels below), pushes one `chore(release): … [skip ci]` commit, then deploys each
  target (Cloudflare Workers, npm, MCP Registry, VS Code Marketplace), tags it and creates a GitHub release. Every deploy
  checks its store first (idempotent) and refuses when a newer release exists. The browser extension
  (`trigger: 'manual'`) only releases from a manual run with "Release the browser extension" ticked (Chrome Web Store
  reviews every submission); until then plans list it as waiting.
- **Tooling.** `scripts/release.ts` + `scripts/release/`. Per target, `targets.ts` holds the path rules and build
  `entries`; `imports.ts` walks the entries' imports and `lockfile.ts` resolves the npm packages they import (plus their
  dependencies), so a dependency update releases only the packages that bundle it (the site counts every dependency
  change). Tests fail when a bundled file isn't covered by a target's globs — extend them when a package starts
  importing from a new directory. `npm run release -- plan [--labels release:minor] [--manual extension]` previews a
  release locally; `release-preview.yml` posts the same table in each PR's job summary.
- **Versions.** Every version file of a target must agree (tested). The CLI's `VERSION` and the MCP server's version are
  imported from their `package.json`; the extension's version is `manifest.json` alone (not the root's). Don't edit
  versions in a PR — label it instead. Raise one by hand only when the user picks a specific version (every version
  file of that target at once); never lower one. User-visible changes go under `## [Unreleased]` in `CHANGELOG.md`;
  the app's release turns that section into the new version's.

### Labelling pull requests (do this for every PR you open)

The label sets the version bump for every target the PR changes — the highest one wins across a release. `create_pull_request`
takes no labels: add them right after with `issue_write` (method `update`, `labels`) or `gh pr edit --add-label`. Labels
`release:minor` and `release:major` exist; also add `enhancement` for a new feature (it doesn't affect releases).

| Label | When | Examples |
| --- | --- | --- |
| none (patch) | nothing a user relies on changes, or a fix | bug fix (even if output now matches the documented behaviour), performance, refactor, tests, CI, release tooling, docs, guides/SEO copy, dependency update without behaviour change |
| `release:minor` | new capability; existing pipelines, commands and imports behave as before | new utility; new param whose default keeps old behaviour; new CLI flag, MCP tool or tool field, `@string-utility-belt/core` export; new site page or feature; new extension feature |
| `release:major` | something that worked before now fails or gives a different result | removing or renaming a utility id or param; changing a param's default or meaning; changing an existing utility's output beyond a fix; share-link/pipeline schema change without migration (`SCHEMA_VERSION` in `serialize.ts`); removed or changed CLI flag, exit code or output format; MCP tool rename or schema change; removed core export; higher Node `engines` floor; `BRIDGE_PROTOCOL` bump |

- When unsure between two levels, ask the user rather than guess; say in the PR description which label you chose and why.
- Check the PR's **Release preview** job summary: it lists the targets that will release and their versions. A PR that
  only touches tests, CI or release tooling releases nothing — leave it unlabelled.
- If the PR changes the browser extension (or `src/core/extensionBridge.ts`), say in the description that the extension
  needs a manual release after merging; a bridge change reaches site users before the extension updates.
- Don't add `release:*` labels to Dependabot PRs unless the update changes what users get.

## Path aliases

`@/` maps to `src/` (configured in Vite/tsconfig). Code under `src/core/` must use relative imports.

## Conventions

- Tests are colocated: `src/utilities/<id>/index.test.ts`, `src/app/**/X.test.tsx`, `src/components/<Name>.test.jsx`
- Both `.ts` and `.tsx` utility modules are supported
- Utility `apply` functions receive `(input: any, params: any, ctx?)` — cast input with `String(input)` for string utilities
- Round-trip encoder/decoder pairs belong in `src/utilities/__properties__/` (fast-check)
