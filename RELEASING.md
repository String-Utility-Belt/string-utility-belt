# Releasing

Nothing is published by hand. Every push to `main` that passes CI runs the
[Release workflow](.github/workflows/release.yml), which releases each target whose shipped
files changed since its last release — and only those. The browser extension is the exception:
its changes wait until you start a release for it ([below](#releasing-the-browser-extension)).

| Target | Released | Ships to | Version lives in |
| --- | --- | --- | --- |
| `app` | automatically | stringutilitybelt.com (Cloudflare Workers) | `package.json`, `package-lock.json`; `CHANGELOG.md` sections |
| `core` | automatically | npm `@string-utility-belt/core` | `packages/core/package.json` |
| `cli` | automatically | npm `subelt` | `packages/cli/package.json` |
| `mcp` | automatically | npm `@string-utility-belt/mcp` + the MCP Registry (+ a `.mcpb` on the GitHub release); Anthropic's plugin directory reads `plugins/string-utility-belt` from `main` ([below](#anthropics-plugin-directory)) | `packages/mcp/package.json`, `packages/mcp/manifest.json`, `server.json` (both versions), `plugins/string-utility-belt/.claude-plugin/plugin.json`, the package pinned in `plugins/string-utility-belt/.mcp.json` |
| `extension` | **by hand** | Chrome Web Store | `packages/extension/manifest.json` |
| `vscode` | automatically | VS Code Marketplace (+ Open VSX, opt-in) | `packages/vscode/package.json` |

The CLI's `--version` and the MCP server's reported version are read from their `package.json`
at build time; there is no other copy to keep in step.

## How a release runs

1. **CI passes on `main`** (`ci.yml`). The release only ever ships a commit CI verified: if
   `main` has moved on by the time it starts, it stands down and the newer commit's run releases
   everything instead.
2. **Plan** (`npm run release -- plan`). For each target, the newest `<id>-v<version>` tag
   reachable from `main` is its last release. The target releases when:
   - files it ships changed since that tag (see [What counts as a change](#what-counts-as-a-change)), or
   - its version was raised by hand in a pull request, or
   - it has no tag yet (its first release through this workflow).

   The extension only releases when the run asks for it; otherwise the summary lists it as
   **⏸ manual** with the version it would get.
3. **Version.** A version the pull request already raised is released as it is. Otherwise it is
   bumped: **patch** by default, **minor** or **major** when a merged pull request that changed the
   target carries the `release:minor` or `release:major` label (the highest wins). All of a target's
   version files are rewritten together, without reformatting; a non-empty `## [Unreleased]` section
   of `CHANGELOG.md` becomes the app's new version section. These edits are pushed to `main` as one
   `chore(release): … [skip ci]` commit.
4. **Deploy**, one job per target, in parallel: build from the release commit, run the package's
   tests against the built output, publish, then tag `<id>-v<version>` and create a GitHub release
   with notes generated from the pull requests since the previous tag. Every job asks its store
   first and skips what is already there, so re-running never publishes twice — and refuses to run
   at all once a newer release of its target exists, so re-running an old job never downgrades.

Pull requests get a **Release preview** check (`release-preview.yml`): the job summary lists what
merging would release and at which versions. It also fails when version files disagree or fall
below a released version, which would stop the release.

### Releasing the browser extension

Every Chrome Web Store submission goes through review, so the extension isn't released on every
merge. When you want to ship what has accumulated: **Actions → Release → Run workflow** (from
`main`), tick **Release the browser extension**, and run it. The run releases the newest commit on
`main` that CI passed on: the extension gets one version for everything since its last release
(patch, or the highest `release:*` label among the pull requests that changed it), and anything
else still unreleased goes out too.

Keep in mind that the site deploys on every merge while the extension waits: a change to the
extension bridge (`src/core/extensionBridge.ts`) reaches users of the site first. The bridge's
protocol check tells them to update the extension; release it promptly after such changes.

### What counts as a change

Each target's rules live in [`scripts/release/targets.ts`](scripts/release/targets.ts):

- **Files.** Every package bundles the engine (`src/core/`, `src/types/`, `src/utilities/`), so a
  utility change releases the site and every package. Tests, fixtures, utility guides (for packages),
  the extension's store listing copy, CI and release tooling never trigger a release. A test walks
  each package's imports and fails if its rules miss a file it bundles.
- **Dependencies** (root `package.json` / `package-lock.json`). The site counts any change but the
  version: its build tooling lives there. A package counts only changes to the npm packages its build
  imports and to everything those depend on, found by following its imports from its build entries
  (`importGraph`) and resolving them through the lockfile like Node does (`dependencyClosure`). A
  React or Vite update redeploys the site only; a `yaml` update releases every package. The import
  walk errs on the side of too much — checked against the real bundles, it never misses a bundled
  package, but it does count dependencies of dependencies that the bundler drops (the MCP SDK's HTTP
  server stack, for one), which can mean an unnecessary release, never a missing one.

### Choosing the version yourself

Label the pull request `release:minor` or `release:major`, or raise the version in the pull request
(every version file of the target, e.g. `npm version 2.0.0 --no-git-tag-version` in the package
directory plus its manifests). The release keeps a raised version as it is. Versions never go down:
the plan fails when version files are below the last release tag. A version is only ever released
with the content it was set for: if the target changes again before that version is released (say,
its deploy failed and another pull request was merged meanwhile), the next release bumps it again.

## Failures, retries and rollbacks

- **A deploy job failed** (store outage, expired credential): fix the cause, then **Re-run failed
  jobs** on that workflow run. The release commit and the other targets are untouched; the job
  publishes what is missing and tags the release. A re-run uses the workflow as it was for that run:
  to pick up a fix to the workflow or the release tooling, merge it instead. The release run after
  that retries the same versions, as long as nothing those targets ship has changed.
- **Run the whole release again** — *Actions → Release → Run workflow*. It releases the newest
  commit on `main` that CI passed on, and continues where an earlier run stopped (a version an
  earlier run already bumped is released as it is, not bumped again).
- **Roll back the site:** `npx wrangler rollback` (or *Workers → Deployments* in the Cloudflare
  dashboard), then revert the change on `main`; the revert ships as the next patch release.
- **Packages and extensions:** registries don't take a version back. Revert on `main` and let the
  next patch release supersede it (`npm deprecate <pkg>@<version> "<why>"` for a broken npm version;
  the Chrome Web Store dashboard can also roll back to the previous published version).
- **The `mcp` job failed after the release commit:** the Claude plugin on `main` now pins an npm
  version that doesn't exist yet, so marketplace installs can't start the server. Re-run the job, and
  don't publish that plugin version in the developer portal until it has put the version on npm.

## One-time setup

Until a target's credentials are in place, its deploy job fails with a clear error; the other
targets still release. Do step 1 first, and turn off Workers Builds (step 3) **before** merging the
release workflow, or the site deploys twice on every push.

Every value below lives in a GitHub **environment** (*Settings → Environments*), never in plain
repository secrets: an environment limited to `main` only hands its secrets to jobs running on
`main`, so a workflow on any other branch can't read them.

| Environment | Name | Kind | For |
| --- | --- | --- | --- |
| `release` | `RELEASE_APP_CLIENT_ID` | variable | the GitHub App that pushes release commits past `main`'s protection |
| `release` | `RELEASE_APP_PRIVATE_KEY` | secret | its private key |
| `production` | `CLOUDFLARE_API_TOKEN` | secret | Workers deploy |
| `production` | `CLOUDFLARE_ACCOUNT_ID` | secret | Workers deploy |
| `npm` | `MCP_REGISTRY_PRIVATE_KEY` | secret | MCP Registry (DNS-verified namespace) |
| `npm` | `NPM_TOKEN` | secret, optional | only if you don't use npm trusted publishing |
| `vscode-marketplace` | `AZURE_CLIENT_ID` | variable | the Entra ID app that publishes |
| `vscode-marketplace` | `AZURE_TENANT_ID` | variable | its tenant |
| `vscode-marketplace` | `OVSX_PAT` | secret, optional | Open VSX (skipped when unset) |
| `chrome-web-store` | `CWS_PUBLISHER_ID` | variable | your Chrome Web Store publisher |
| `chrome-web-store` | `CWS_SERVICE_ACCOUNT` | variable | the Google service account that publishes |
| `chrome-web-store` | `CWS_WORKLOAD_IDENTITY_PROVIDER` | variable | the workload identity provider it signs in through |

### 1. Environments

*Settings → Environments → New environment*, five times: `release`, `production`, `npm`,
`vscode-marketplace`, `chrome-web-store`. In each, under **Deployment branches and tags**, choose
**Selected branches and tags** and add `main`. Optionally add yourself as a **required reviewer** on
`chrome-web-store` or `production` to approve those deploys by hand.

(Manual runs must then be started from `main`, which is what you want anyway.)

### 2. Protect `main`, and the release GitHub App

`main` has no protection today: anyone with write access can push straight to it, and this workflow
would publish that push. Protect it, and give the release a GitHub App of its own to push its version
commits past the protection. The job's built-in `GITHUB_TOKEN` (`github-actions[bot]`) can't be added
to a ruleset's bypass list, so a dedicated app is the way. **Don't** add an existing app (Claude,
Dependabot, any integration) to the bypass list: it would let that app skip review on `main` too.

**Create the app** under the organization, so it lives with the repository: *github.com/String-Utility-Belt →
Settings → Developer settings → GitHub Apps → New GitHub App*:

- **GitHub App name:** something unique, e.g. `string-utility-belt-release`.
- **Homepage URL:** `https://github.com/String-Utility-Belt/string-utility-belt`.
- **Webhook:** untick **Active**.
- **Repository permissions → Contents:** **Read and write**. Nothing else (Metadata: read-only is added automatically).
- **Where can this GitHub App be installed?** **Only on this account.**

Create it, then on its page:

1. Copy the **Client ID** → variable `RELEASE_APP_CLIENT_ID` in the `release` environment.
2. **Private keys → Generate a private key.** Paste the whole downloaded `.pem` file (including the
   `BEGIN`/`END` lines) into secret `RELEASE_APP_PRIVATE_KEY` in the `release` environment, then delete
   the file.
3. **Install App** → `String-Utility-Belt` → **Only select repositories** → `string-utility-belt`.

**Create the ruleset.** Repository *Settings → Rules → Rulesets → New ruleset → New branch ruleset*:

- **Name:** `main`; **Enforcement status:** Active.
- **Bypass list → Add bypass:** your release app, set to **Always allow**.
- **Target branches → Add target → Include default branch.**
- Tick **Restrict deletions**, **Block force pushes**, **Require a pull request before merging**, and
  **Require status checks to pass** with the checks `typecheck`, `lint`, `test`, `build`, `tools`,
  `e2e` and `preview` (they appear once they've run on a pull request).

Optionally, a **tag ruleset** for `*-v*` with **Restrict updates** and **Restrict deletions** (not
creations) keeps release tags from being moved or deleted.

### 3. Cloudflare (the site)

1. **Turn off Workers Builds for production:** *Workers & Pages → string-utility-belt → Settings →
   Build* — disconnect the repository, or turn off builds for the production branch (preview builds of
   other branches can stay).
2. **API token:** *My Profile → API Tokens → Create Token → Edit Cloudflare Workers* (template).
   **Account Resources:** your account. **Zone Resources:** *Specific zone* → `stringutilitybelt.com`.
   Add **Zone → DNS → Edit** (the deploy maintains the custom domain's record). Create it and save it
   as secret `CLOUDFLARE_API_TOKEN` in `production`.
3. **Account ID:** shown on the *Workers & Pages* overview (or `npx wrangler whoami`). Save it as
   secret `CLOUDFLARE_ACCOUNT_ID` in `production`.

Check the token: `CLOUDFLARE_API_TOKEN=<token> npx wrangler whoami`.

### 4. npm (core, cli, mcp) — trusted publishing, no token

For each of `@string-utility-belt/core`, `subelt` and `@string-utility-belt/mcp` on npmjs.com:
*package → Settings → Trusted Publisher → GitHub Actions*:

- **Organization or user:** `String-Utility-Belt`
- **Repository:** `string-utility-belt`
- **Workflow filename:** `release.yml`
- **Environment name:** `npm`
- **Allowed actions:** tick **`npm publish`**. Trusted publishers created since 2026-09-03 allow only
  `npm stage publish` until you do, and this workflow publishes directly.

Every field is case-sensitive (`String-Utility-Belt`, not `string-utility-belt`), and npm checks none
of them when you save. Save. Nothing is stored in GitHub: each publish exchanges the job's OIDC token
for a short-lived npm token and attaches provenance. Once the first release has published through it,
set *Settings → Publishing access* to **Require two-factor authentication and disallow tokens**, so
nothing but this workflow can publish.

npm accepts a publish before it serves the new version: it scans each one first ("Your package is
being processed"), which has taken anywhere from a few minutes to over half an hour. The publish
step waits up to an hour until npm serves it, so the MCP Registry (which checks the npm version it
points at), the tag and the GitHub release only follow an installable version. If the wait runs out,
check the version on npmjs.com and re-run the job once it's listed: the publish is skipped and the
release carries on.

If a publish fails with `ENEEDAUTH`, npm refused the token exchange. It doesn't say why, so the
publish step (`.github/actions/npm-publish`) adds a report to the job log and summary: npm's own
account of the exchange, and the exact values the trusted publisher has to hold for that job.

### 5. MCP Registry

The `com.stringutilitybelt/*` namespace is verified through the DNS record already on
`stringutilitybelt.com` (`v=MCPv1; k=ed25519; p=…`). The workflow needs that key's private half as hex.

If you still have the `key.pem` you made it with:

```bash
openssl pkey -in key.pem -noout -text | grep -A3 'priv:' | tail -n +2 | tr -d ' :\n'
```

Save the output as secret `MCP_REGISTRY_PRIVATE_KEY` in `npm`.

If the key is lost, make a new one and swap the record:

```bash
openssl genpkey -algorithm Ed25519 -out key.pem
# the TXT value for stringutilitybelt.com (name "@" in Cloudflare DNS); replace the old v=MCPv1 record
echo "v=MCPv1; k=ed25519; p=$(openssl pkey -in key.pem -pubout -outform DER | tail -c 32 | base64)"
dig +short TXT stringutilitybelt.com   # wait until the new record shows
mcp-publisher login dns --domain stringutilitybelt.com \
  --private-key "$(openssl pkey -in key.pem -noout -text | grep -A3 'priv:' | tail -n +2 | tr -d ' :\n')"
```

Then save the hex key as above and keep `key.pem` somewhere safe offline (or delete it — you can
always rotate again).

### 6. VS Code Marketplace — Microsoft Entra ID, no token

Azure DevOps global personal access tokens stop working on 2026-12-01, so the workflow signs in as an
Entra ID app instead (`vsce publish --azure-credential`). Any Microsoft account has an Entra ID tenant;
no Azure subscription is needed.

1. [Azure portal](https://portal.azure.com) → **Microsoft Entra ID → App registrations → New
   registration**. Name: `string-utility-belt-vscode`; **Accounts in this organizational directory
   only**; no redirect URI. Register.
2. From its **Overview**, save **Application (client) ID** as variable `AZURE_CLIENT_ID` and
   **Directory (tenant) ID** as variable `AZURE_TENANT_ID`, both in `vscode-marketplace`.
3. **Certificates & secrets → Federated credentials → Add credential**. Scenario: **GitHub Actions
   deploying Azure resources**. Organization `String-Utility-Belt`, repository `string-utility-belt`, entity
   type **Environment**, environment `vscode-marketplace`, name `release`. Add. (This trusts exactly
   one thing: this repository's jobs in that environment.)
4. Make the app a member of the publisher. The Marketplace adds members by their Azure DevOps ID,
   which only the app itself can look up, so let the workflow do it: run a release (any run that
   includes `vscode`). Its **Check Marketplace access** step fails with *Add member ID `<id>` to the
   publisher*: the app's Azure DevOps identity, not its client ID. Open
   [the publisher's page](https://marketplace.visualstudio.com/manage/publishers/stringutilitybelt) →
   **Members → Add**, paste the ID, role **Contributor**, add, and **Re-run failed jobs**. If the
   `stringutilitybelt` publisher doesn't exist yet, create it there first.

Optional — Open VSX (VSCodium, Cursor, Gitpod): sign in at [open-vsx.org](https://open-vsx.org) with
GitHub, accept the publisher agreement, create an access token (*Settings → Access Tokens*), run
`npx ovsx create-namespace stringutilitybelt -p <token>` once, and save the token as secret `OVSX_PAT`
in `vscode-marketplace`.

### 7. Chrome Web Store — Google service account, no key

The workflow signs in to Google with the job's OIDC token (workload identity federation) as a service
account the Chrome Web Store trusts; no key file exists. Run these in
[Cloud Shell](https://shell.cloud.google.com) or anywhere `gcloud` is signed in, in a project of yours:

```bash
PROJECT_ID=<your project id>
gcloud config set project "$PROJECT_ID"
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"

gcloud services enable chromewebstore.googleapis.com iam.googleapis.com iamcredentials.googleapis.com sts.googleapis.com
gcloud iam service-accounts create cws-publisher --display-name='Chrome Web Store publisher'

gcloud iam workload-identity-pools create github --location=global --display-name='GitHub Actions'
# only this repository's jobs in the chrome-web-store environment can sign in
gcloud iam workload-identity-pools providers create-oidc string-utility-belt \
  --location=global --workload-identity-pool=github \
  --issuer-uri='https://token.actions.githubusercontent.com' \
  --attribute-mapping='google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.environment=assertion.environment' \
  --attribute-condition="assertion.repository == 'String-Utility-Belt/string-utility-belt' && assertion.environment == 'chrome-web-store'"

gcloud iam service-accounts add-iam-policy-binding "cws-publisher@$PROJECT_ID.iam.gserviceaccount.com" \
  --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/github/attribute.repository/String-Utility-Belt/string-utility-belt"

echo "CWS_SERVICE_ACCOUNT=cws-publisher@$PROJECT_ID.iam.gserviceaccount.com"
echo "CWS_WORKLOAD_IDENTITY_PROVIDER=projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/github/providers/string-utility-belt"
```

Then:

1. Save the two printed values as variables in `chrome-web-store`.
2. In the [developer dashboard](https://chrome.google.com/webstore/devconsole), **Account**: add the
   service account's email (`cws-publisher@…`) as a service account, and copy your **publisher ID**
   (also the ID after `devconsole/` in the dashboard's address) into variable `CWS_PUBLISHER_ID`.

If the sign-in step later fails with `iam.serviceAccounts.getAccessToken` denied, grant the same
`principalSet://…` member `roles/iam.serviceAccountTokenCreator` on the service account as well.

Each extension release uploads the package and submits it for review, with automatic publishing once
approved. A submission still in review when a newer version is released is cancelled and replaced by
the newer one (the store reviews one submission at a time).

### 8. Labels

```bash
gh label create release:minor --color 1D76DB --description 'Release the changed targets as a minor version'
gh label create release:major --color B60205 --description 'Release the changed targets as a major version'
```

### First run

No target has a release tag yet, so the first run releases every automatic target with a patch bump
— a store may already hold the current version with older content, and a version is never reused.
The MCP version files were aligned at 1.3.3 (the newest version the MCP Registry has), so npm and the
registry both get 1.3.4. The extension waits for its first manual release. To keep a target out of the
first run, tag the commit whose content its store already ships, e.g.
`git tag vscode-v1.3.0 <sha> && git push origin vscode-v1.3.0`; it then releases only after its
files change.

## Directory listings

The MCP Registry entry is published by every `mcp` release, and the Claude Code marketplace is this
repository itself. Two other directories list the MCP server and need a person, once.

### Claude Code marketplace

`.claude-plugin/marketplace.json` makes the repository a Claude Code plugin marketplace with one plugin,
`plugins/string-utility-belt`, so anyone can install it from `main` without waiting for a directory
review: `/plugin install string-utility-belt --marketplace String-Utility-Belt/string-utility-belt`. The
entry names the plugin's folder and nothing else; the listing comes from its `plugin.json`.

Between a release commit and the `mcp` job putting that version on npm, a fresh install pins a version
npm doesn't serve yet, so the server fails to start. `npx` fetches on every start, so it works on the
next start once the job has published. Try a branch before merging:

```bash
claude plugin validate . --strict
claude plugin marketplace add String-Utility-Belt/string-utility-belt#<branch> --sparse .claude-plugin plugins
claude plugin install string-utility-belt@string-utility-belt
```

### Anthropic's plugin directory

The plugin in `plugins/string-utility-belt` installs the MCP server in Claude Code and in Cowork on
the user's computer (claude.ai chat doesn't start local servers). It runs
`npx -y @string-utility-belt/mcp@<version>`: the directory refuses an unpinned package, so every
`mcp` release bumps the pin and the plugin's `version` with the rest, and any change to the plugin is
an `mcp` release (installed copies only update when `version` changes).

Check it before submitting:

```bash
claude plugin validate plugins/string-utility-belt --strict
claude --plugin-dir plugins/string-utility-belt mcp list   # plugin:string-utility-belt:subelt: … Connected
```

**Submit** (anyone on a paid Claude plan; on a Team or Enterprise plan, an Owner): at
[claude.ai/directory/manage](https://claude.ai/directory/manage) choose **Submit new → Plugin bundle**,
repository `String-Utility-Belt/string-utility-belt`, plugin path `plugins/string-utility-belt`, branch
`main`. **Validate**, answer the data-handling questions (no personal data is read or stored; nothing is
sent anywhere but npm, to download the server), keep the **GitHub push webhook**, and submit.

**Every release after that:** the directory scans the release commit. A plugin that runs a pinned npx
package is always **held for a reviewer** (its dependencies resolve at install time, even though ours
has none), so each version waits for Anthropic's review before it goes live; leave auto-publish off.
Wait for the `mcp` job to finish before you select **Publish** (see
[Failures](#failures-retries-and-rollbacks)).

### Glama

[glama.ai/mcp/servers/String-Utility-Belt/string-utility-belt](https://glama.ai/mcp/servers/String-Utility-Belt/string-utility-belt)
lists the server already, and `glama.json` names its maintainer. Until Glama has a release of its own
the listing says "This server cannot be deployed" and has no tool or quality grade, because Glama can't
start the server to inspect it. A GitHub release doesn't count.

Signed in to Glama as a maintainer, open the listing's **Admin → Dockerfile** page and enter:

| Field | Value |
| --- | --- |
| Node.js version | `22` |
| Build steps | `npm install -g @string-utility-belt/mcp` |
| CMD arguments | `subelt-mcp` |
| Environment variables | none (`SUBELT_MCP_TIMEOUT_MS` is optional) |
| Pinned commit | leave empty |

**Deploy**, wait for the test to pass, **Make Release**, then publish it on the releases page. The build
installs the published npm package rather than building this repository, so the image is what users
run and needs no network once built. A Glama release is a snapshot: make a new one when the tools
change.

## Locally

```bash
npm run release -- plan                          # what a release from HEAD would do (read-only)
npm run release -- plan --labels release:minor   # …if the pull request carried that label
npm run release -- plan --manual extension       # …including the extension
npm run release -- preflight mcp                 # is the current mcp version on npm / the MCP Registry?
```
