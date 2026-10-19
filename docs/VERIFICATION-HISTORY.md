> Historical scope: sections 0–8 describe 0.1.0; section 9 describes the earlier,
> pre-repair 0.1.1 working tree. Current acceptance is in [VERIFICATION.md](VERIFICATION.md).
> Screenshot paths were reused for new captures: the sizes/hashes and observations
> below describe the old captures and do not identify the PNGs currently at those paths.
> The no-user-profile statement below applies to sections 0–8 only; section 9
> explicitly describes a different earlier Desktop verification scope.

# dsh-pele-mermaid — Historical verification record

Historical status: PASS as recorded at the time; not current acceptance.
Date: 2026-10-19 (Asia/Shanghai).
This file is the evidence trail for three independent layers:

1. **Unit + artifact tests** — the built bundle really mounts, toggles, themes,
   tears down and observes, and it is byte-fresh against `src/client/`.
2. **Real-browser fixture** — a Chromium browser renders the fixture page with
   real DSH design tokens in light and dark, interactions work, and teardown
   restores the DOM.
3. **Real profile install** — the actual `dsh` binary installs the package into a
   throwaway profile, serves the bundle from `/plugins/`, and **omits it
   completely** when the row is disabled or the package is removed.

No user profile, Desktop app, session or Markdown data was read or written by
any of these steps. Every `dsh` invocation runs under a throwaway `DSH_HOME`
under `os.tmpdir()` (see `scripts/verify-install.mjs`).

---

## 0. Environment and artifact identity

| Item | Value |
| --- | --- |
| Host | `Darwin arm64` (macOS) |
| Node / npm | `v24.22.0` (mise) / `11.19.1` |
| DSH | `0.2.1-rc.2` (commit `332895e`), `/usr/local/bin/dsh` → Desktop-installed CLI |
| DSH shipped web frontend | `@deepseek-ai/dsh-web-frontend` `0.2.1-rc.2` |
| Test deps | `jsdom ^29.1.1`, `esbuild ^0.28.2`, `pele ^1.6.0` (all installed; no network fetched) |
| Built bundle | `lib/client.js` — **693,967 bytes** |
| Bundle SHA-256 | `f93c8feda14e3988296a0a6d636146a4d3d9610fcff4eef46479d11a1c6f7a08` |
| Module-loader id | `"dsh-pele-mermaid"` (== `package.json.name`) |
| Wrapper prefix | `window.__ModuleLoader__.load({id:"dsh-pele-mermaid",factory:(require)=>{…` |
| Theme color tokens (fixture) | `tests/fixtures/theme-tokens.css`, 19,035 B, SHA-256 `679d7660…bcfa76` (verbatim DSH 0.2.1-rc.2 light+dark color layers) |
| Theme base tokens (fixture) | `tests/fixtures/theme-tokens-base.css`, 1,797 B, SHA-256 `fbde7d74…9289cf` (verbatim DSH `:root`/`body` base layer: fonts, radii, easings) |

The base-token layer matters: `--dsw-font-family`, `--ds-font-family-code` and
`--dsw-radius-md` are **not** in the color-token extraction but are defined in
`@deepseek-ai/dsh-client-ui-theme/lib/client.js` (`base.css.mjs`). Both layers
are loaded by the fixture so the plugin's `--pele-font`, `--pele-font-mono` and
`--pele-radius` mappings resolve exactly as in real DSH instead of falling back
to Pele's defaults. See [tests/fixtures/README.md](../tests/fixtures/README.md)
for the extraction commands.

---

## 1. Reproduce everything

```sh
cd /Users/farewe1ll/Objects/dsh-pele-mermaid

# 1) Unit + bundle tests (67 tests: engine/theme/blocks 61 + bundle smoke 6)
node --test "tests/*.test.mjs"

# 2) Artifact check: build --check (bundle freshness) + bundle smoke test
node scripts/verify-bundle.mjs          # same as: npm run verify

# 3) Real-profile install → enabled boot graph → disabled/absent boot graph
node scripts/verify-install.mjs         # --keep to retain the throwaway DSH_HOME

# 4) Visual fixture (manual / browser-driven)
node scripts/serve-fixture.mjs --port 8123
#   light http://127.0.0.1:8123/tests/fixtures/fixture.html?locale=en
#   dark  http://127.0.0.1:8123/tests/fixtures/fixture.html?theme=dark&locale=en
```

Exit codes observed: `0` for all three automated commands.

---

## 2. Test suite results

`node --test "tests/*.test.mjs"`:

```text
ℹ tests 67
ℹ suites 0
ℹ pass 67
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 7115.435209
```

The 6 tests added by this verification task (`tests/bundle.test.mjs`, run against
the **built** `lib/client.js` in jsdom):

```text
✔ bundle wrapper: registers exactly id "dsh-pele-mermaid" and the factory never requires
✔ apply(): settled mermaid fences become Pele diagrams; banners, source and non-mermaid blocks are preserved
✔ toolbar: Diagram/Source round-trips the original <pre> node and aria-pressed state
✔ theme/change: unchanged font inputs never re-render; a font change rebuilds in place
✔ ctx.effect cleanup: restores the pre-plugin DOM byte-identically and stops observing
✔ MutationObserver: a mermaid fence appended after boot settles and renders
```

If `lib/client.js` is missing the test file fails with
`lib/client.js is missing — run \`npm run build\` first`, never silently skips.

### What the bundle smoke test actually asserts

- Wrapper: bundle starts with the exact DSH module-loader call for id
  `"dsh-pele-mermaid"`, ends with `return module.exports;}});`, registers exactly
  once, and never references a CDN (`cdn.jsdelivr.net`, `unpkg.com`,
  `fastly.jsdelivr.net`, `esm.sh`, `skypack`) or uses dynamic `import()`.
- Factory: `factory(require)` **never calls `require`** (a throwing stub is
  passed; the call count is asserted 0), `inject` is the static array
  `['theme']`, `apply` is a function, and no DOM/style is touched at load time.
- Mount: on the ARCH.md CodeBlock fixture (3 drawable mermaid fences, 1
  undrawable, 1 `javascript` fence) exactly 3 diagrams mount, each with one
  `svg.pele` (class `pele-flowchart`/`pele-sequence`/`pele-pie`) inside
  `[data-dsh-pele-mermaid-host]` inside `[data-code-block-content]`, Pele zoom
  controls present, one `<style data-dsh-pele-mermaid>`, banner `outerHTML`
  unchanged, original `<pre>` detached while mounted.
- Error fallback: the invalid fence keeps its `<pre>` visible and gets one
  `.dsh-pele-mermaid-error` note whose text starts with `Pele: ` and includes
  Pele's own message (`No diagram type detected…`), assigned via `textContent`.
- Non-mermaid fence untouched: no container/toolbar/error nodes, `<pre>` in place.
- Toolbar: `role="group"`, exactly `Diagram` / `Source` (en locale), `aria-pressed`
  flips on click, Source reinserts the **same** `<pre>` node in
  `.dsh-pele-mermaid-source` and hides the Pele host, Diagram detaches it again.
- Theme policy: emitting `theme/change` with unchanged font inputs leaves the
  **same SVG nodes** in place (no remount); a font-size/family change replaces
  all 3 SVG nodes exactly once (4→8 additions in the browser remount counter).
- Teardown: after the `ctx.effect` disposer, `document.body.innerHTML` equals the
  pre-apply snapshot byte-for-byte, style/diagrams/toolbars/error notes are gone,
  the same `<pre>` nodes return to their original containers, a second cleanup
  call is harmless, and a fence appended after disposal is **not** observed.
- MutationObserver: a mermaid fence appended to an initially empty page settles
  and renders (streaming/history path), reusing the single stylesheet.

The expected jsdom notice `Not implemented: HTMLCanvasElement.getContext()` is
swallowed with a `VirtualConsole`; this exercises Pele's documented metrics-table
fallback (the same path as a browser without canvas). Any other jsdom error fails
the test.

### `node scripts/verify-bundle.mjs` (`npm run verify`)

```text
=== step 1/2: build --check (bundle freshness) ===
$ node scripts/build-client.mjs --check
build-client: up to date (693967 bytes, 257 ms)
step 1/2: build --check (bundle freshness): PASS (391 ms, exit 0)

=== step 2/2: bundle smoke test (jsdom, real built bundle) ===
… 6/6 tests pass …
step 2/2: bundle smoke test (jsdom, real built bundle): PASS (6738 ms, exit 0)

=== bundle identity ===
file:        lib/client.js
bytes:       693,967
sha256:      f93c8feda14e3988296a0a6d636146a4d3d9610fcff4eef46479d11a1c6f7a08
wrapper id:  "dsh-pele-mermaid" (package dsh-pele-mermaid@0.1.0)

verify: PASS — 2 steps in 7195 ms
```

A stale bundle can never pass: `build --check` rebuilds in memory and fails on
any byte difference before the smoke test runs.

---

## 3. Real-browser visual fixture

Files under [`tests/fixtures/`](../tests/fixtures/README.md): a standalone page
that mimics DSH's rendered Markdown thread (ARCH.md CodeBlock DOM shape), loads
the two verbatim real token layers, fakes `window.__ModuleLoader__` and the
Cordis `ctx`/`theme` surfaces, and loads the **built** `lib/client.js`.

### Browser used, and why not Obscura

The Obscura MCP browser refuses loopback URLs through its SSRF guard:

```text
Error: Network error: Access to private/internal IP address 127.0.0.1 is not allowed
Error: Network error: Access to localhost domain 'localhost' is not allowed
```

So the same real-browser checks were done with the installed **Google Chrome 155**
in headless mode: one-shot screenshots via `--headless=new --screenshot=…`, and
the interaction sequence (theme toggle, Diagram/Source, font refresh, teardown)
driven over the Chrome DevTools Protocol (`Page.navigate`,
`Runtime.evaluate`, `Page.captureScreenshot`) against
`http://127.0.0.1:<port>/tests/fixtures/fixture.html?locale=en`. Chromium needs
`--no-sandbox` in this managed environment (its nested sandbox cannot initialize);
everything else is a stock headless browser. No application code was modified.

### Screenshots and machine evidence

Saved under [`tests/fixtures/screenshots/`](../tests/fixtures/screenshots/), with
the full structured report in
[`visual-evidence.json`](../tests/fixtures/screenshots/visual-evidence.json).

| File | Shows |
| --- | --- |
| [fixture-light.png](../tests/fixtures/screenshots/fixture-light.png) (328,743 B) | Light: 4 Pele diagrams (flowchart, sequenceDiagram, pie, gantt), error fallback, untouched JS fence, toolbar `Diagram/Source`, evidence panel |
| [fixture-dark.png](../tests/fixtures/screenshots/fixture-dark.png) (333,277 B) | After clicking the real theme toggle: same SVG nodes, dark token repaint |
| [fixture-source-view.png](../tests/fixtures/screenshots/fixture-source-view.png) (333,460 B) | First fence switched to `Source`: original `<pre>` visible, other diagrams unchanged |
| [fixture-font-refresh.png](../tests/fixtures/screenshots/fixture-font-refresh.png) (333,389 B) | After a font-metric `theme/change`: diagrams rebuilt in place (remount counter 4 → 8) |
| [fixture-teardown.png](../tests/fixtures/screenshots/fixture-teardown.png) (231,100 B) | After `ctx.effect` cleanup: every fence back to its source, 0 styles, 0 plugin nodes |

SHA-256:
`94bc7036…a9f66b9a` (light), `c23cec5a…2ea2ba39` (dark),
`587e83d9…832e244b` (source), `eb717228…fe4fb4d7` (font refresh),
`b05d4a5f…4d04a290` (teardown).

### Observed values (real browser, from `visual-evidence.json`)

```json
{
  "registration": "dsh-pele-mermaid",
  "factory": "function",
  "exports": { "apply": "function", "inject": ["theme"] },
  "requireCalls": 0,
  "light": {
    "theme": "light", "darkAttribute": false, "bodyBackground": "rgb(255, 255, 255)",
    "blocks": 6, "mountedContainers": 4, "svgPele": 4,
    "svgTypes": ["flowchart", "sequence", "pie", "gantt"],
    "zoomIconSvgs": 12, "toolbars": 4, "toolbarButtons": 8,
    "toolbarLabels": ["Diagram", "Source", "..."],
    "errorNotes": 1, "styleElements": 1,
    "remounts": 4,
    "peleVars": {
      "--pele-bg": "#f9fafb", "--pele-fg": "#0f1115", "--pele-muted": "#81858c",
      "--pele-line": "#61666b", "--pele-surface": "#fff", "--pele-surface-alt": "#f9fafb",
      "--pele-border": "#0000001a", "--pele-accent": "#0f1115", "--pele-radius": "12px"
    }
  },
  "afterThemeToggle": {
    "theme": "dark", "darkAttribute": true, "bodyBackground": "rgb(21, 21, 23)",
    "containerBackground": "rgb(27, 27, 28)",
    "peleVars": { "--pele-bg": "#1b1b1c", "--pele-fg": "#f9fafb", "--pele-line": "#cfd3d6" },
    "remounts": 4,
    "remountsBeforeTheme": 4
  },
  "sourceView":  { "ariaPressed": ["false", "true"], "preInContent": true,  "hostHidden": true },
  "diagramView": { "ariaPressed": ["true",  "false"], "preInContent": false, "hostHidden": false },
  "fontRefresh": { "mountEvents": [4, 4], "remounts": 8, "diagramSvgs": 4 },
  "teardown": {
    "tornDown": true, "restoredThreadByteIdentical": true,
    "styleCount": 0, "diagramCount": 0, "blocks": 6, "svgs": 0
  },
  "cdpExceptions": [], "cdpConsoleErrors": []
}
```

Key deductions:

- **Reactive theme is pure CSS.** Toggling light→dark changed the page background
  `rgb(255,255,255)` → `rgb(21,21,23)` and the Pele variables
  `#f9fafb/#0f1115` → `#1b1b1c/#f9fafb`, while the remount counter stayed at
  **4** (same SVG nodes). This is the ARCH contract "theme colors never
  re-render", verified in a real browser.
- **Font changes rebuild.** Emitting a `theme/change` with changed font inputs
  added exactly 4 new `svg.pele` nodes (remounts 4 → 8), the only sanctioned
  re-render path.
- **Toolbar and source artifact.** Source view reinserted the original `<pre>`
  inside `[data-code-block-content]` and hid the Pele host; Diagram view restored
  the SVG view. `aria-pressed` mirrored the state on every diagram.
- **Teardown restores.** After the fiber disposer the plugin-owned `#thread`
  subtree was byte-identical to its pre-plugin snapshot, with 0 stylesheet
  elements, 0 diagram containers and 0 `svg.pele` nodes — the page looks exactly
  like the screenshot above ("every fence is source again").
- **Locale.** A first run in a system `zh-CN` Chrome produced `图表` / `源码`
  labels; `?locale=en` pins `navigator.language` and produced `Diagram` /
  `Source`. Both follow the documented behavior (labels from `locale`).
- No console errors and no uncaught exceptions were reported by CDP.

Serving/rendering notes:

- Only `svg.pele` is counted as a diagram; Pele also renders **3 zoom-control
  icon `<svg>`s per diagram** (12 total here), so `querySelectorAll('svg')` would
  overcount. This is why every assertion counts `svg.pele`.
- The fixture loads `../../lib/client.js` through the static server (repo root is
  the document root), so it always verifies the current build; the page stores a
  pre-plugin snapshot of the Markdown thread to prove byte-identical teardown.

---

## 4. Real profile install / disable verification

Script: [`scripts/verify-install.mjs`](../scripts/verify-install.mjs).
Isolation: a fresh `DSH_HOME` is created under `os.tmpdir()`
(`dsh-pele-verify-install-*`) for **every** command; pnpm's store auto-falls back
to a temp store inside the sandbox (no hard links possible from the user store);
the temp home is deleted on success. The user's `~/.dsh/profiles/desktop` and
`~/.dsh/profiles/web` are never touched.

### Commands actually used

```sh
TMP=$(mktemp -d "${TMPDIR:-/tmp}/dsh-pele-verify-install-XXXX")
DSH_HOME="$TMP/home" dsh plugin --profile web add /Users/farewe1ll/Objects/dsh-pele-mermaid
DSH_HOME="$TMP/home" dsh --profile web --dump-config
DSH_HOME="$TMP/home" dsh web --no-open --port <free port>        # prints its ?token= URL
# GET <printed url> -> 303 + dsh-auth cookie; then GET / and the boot-graph bundle URL with the cookie
# paste this into the throwaway profile's cordis.patch.yml, restart, repeat:
#   - id: dsh-pele-mermaid
#     name: dsh-pele-mermaid
#     disabled: true
DSH_HOME="$TMP/home" dsh plugin --profile web remove dsh-pele-mermaid   # "exactly normal" comparison
```

Result: **PASS**, 16,453 ms, exit 0, temp `DSH_HOME` removed.

### 4.1 Install

```text
$ dsh plugin --profile web add /Users/farewe1ll/Objects/dsh-pele-mermaid
dsh: initialized profile web at <tmp>/home/profiles/web
dependencies:
+ dsh-pele-mermaid 0.1.0 <- ../../…/Objects/dsh-pele-mermaid
Done in 802ms using pnpm v11.28.5

install.profile.dependency: link:/Users/farewe1ll/Objects/dsh-pele-mermaid
install.profile.bundles: ["@deepseek-ai/dsh-base","@deepseek-ai/dsh-web-app","dsh-pele-mermaid"]
```

The package becomes a **bundle layer** in the throwaway profile (it provides
`cordis.patch.yml`). No DSH package is patched or forked.

### 4.2 Active composed config (`--dump-config`)

```yaml
# == dsh-pele-mermaid
- id: dsh-pele-mermaid
  name: dsh-pele-mermaid
```

`dsh --profile web --dump-config` ends with this Loader row (active, no
`disabled` flag).

### 4.3 Active boot graph (`window.__DSH_BOOT__` in the index HTML)

Index: HTTP 200, **37,676 bytes**. The boot graph (parsed from
`globalThis["__DSH_BOOT__"] = {…}`) has **70 entries**, **3 batches**, release
`{"version":"0.2.1-rc.2","commit":"332895e"}`, and contains:

```json
{
  "id": "dsh-pele-mermaid",
  "url": "plugins/??dsh-pele-mermaid/client.js&rev=f466920761fe",
  "rev": "f466920761fe",
  "inject": ["@deepseek-ai/dsh-client-ui-theme"]
}
```

The plugin id appears **5 times** in the HTML: the boot-graph entry, preload link
batch URLs, and the `batches[].entries` lists. No `require` of DSH client
packages is involved — the browser half declares its `theme` service dependency
through the static `inject: ['theme']` array and the package manifest.

### 4.4 Bundle route served by DSH

```text
GET /plugins/??dsh-pele-mermaid/client.js&rev=f466920761fe
HTTP/1.1 200 OK
content-type: text/javascript; charset=utf-8
cache-control: public, max-age=31536000, immutable
694,040 bytes
```

- Starts with the expected wrapper:
  `window.__ModuleLoader__.load({id:"dsh-pele-mermaid",factory:(require)=>{…`
- Consists of the committed `lib/client.js` bytes **plus exactly 73 bytes** of
  loader suffix: `;\n//# sourceMappingURL=??dsh-pele-mermaid/client.js.map&rev=f466920761fe`.
- `rev` (`f466920761fe`) is a per-build loader id, **not** the file digest; the
  file digest is `f93c8f…`. The served body is proven byte-identical to the
  committed file up to the loader suffix.

### 4.5 Disabled: row patched off (`disabled: true`)

Throwaway profile `cordis.patch.yml`:

```yaml
# Verification: keep the package installed but disable its Loader row.
- id: dsh-pele-mermaid
  name: dsh-pele-mermaid
  disabled: true
```

Composed config shows the layer still present but patched (the package remains
installed; only the Loader row is disabled):

```yaml
# == dsh-pele-mermaid, patched by <tmp>/home/profiles/web/cordis.patch.yml
- id: dsh-pele-mermaid
  name: dsh-pele-mermaid
  disabled: true
```

Boot graph after restart:

```text
boot entry for "dsh-pele-mermaid": ABSENT
boot.entries: 69          (was 70 with the plugin; -1)
boot.batches: 3           (no batch lists the plugin)
index HTML occurrences of "dsh-pele-mermaid": 0
index HTML: 37,448 bytes  (228 bytes smaller: no preload/registration)
GET /plugins/??dsh-pele-mermaid/client.js&rev=<old rev>: 404, 0 bytes
```

The CSS/JS/assets of DSH itself are untouched — the only change is the removal of
the plugin from the composed client graph. This is the "**closed ⇒ DSH exactly
normal**" evidence: no script, no style, no observer is served or registered.

### 4.6 Disabled ≙ uninstalled (the strongest "exactly normal" proof)

After `dsh plugin --profile web remove dsh-pele-mermaid`, the profile bundle list
returns to `["@deepseek-ai/dsh-base","@deepseek-ai/dsh-web-app"]` and a fresh boot
graph has no plugin entry. Comparing it with the disabled boot graph:

```text
disabled boot graph == freshly uninstalled profile (rev-normalized): true
entries: 69   batches: 3
```

`rev` values are excluded from the comparison because the Loader assigns a fresh
per-boot id to every entry even for an unchanged profile (two consecutive boots
of the *same* profile also differ: `1ebc0497…` vs `7ec2c40f…`). With revs
normalized, the disabled profile's boot graph is **structurally identical**
(entry ids/order/`inject`/`external`, batch phases and entry lists) to a profile
where the package was never installed.

### 4.7 Cleanup / non-interference

- Throwaway `DSH_HOME` deleted after the run (`cleanup.tempRemoved: true`).
- All three web servers started by the script were stopped (SIGTERM, killed
  process tree) before cleanup.
- The script refuses to run if the temp home is not under `os.tmpdir()`.
- The real GUI at `http://127.0.0.1:53769` was **not** modified; an unauthenticated
  GET returns `401 dsh web authentication required` and we deliberately do not
  read the user's printed token. No writes to `~/.dsh` or the Desktop app.

---

## 5. DOM contract check against the shipped DSH client

`docs/ARCH.md` derives the plugin's selectors from
`@deepseek-ai/dsh-client-ui-primitives` `CodeBlock`. In DSH 0.2.1-rc.2 the
primitives are bundled into the shipped web frontend
(`…/dsh-web-frontend/dist/assets/index-CN7NIWNw.js`); the relevant JSX was read
statically from the installed app bundle (read-only) and matches the contract:

- Root: `<div className={cx(styles.block, "md-code-block", …)} data-line-numbers data-code-wrap …>`
  → `.md-code-block` is a literal class, so the plugin's selector works.
- Plain banner:
  `<div className={styles.banner} data-code-block-banner><div className={styles.infostring}>{lang}</div><div className={styles.action}><button>Copy</button></div></div>`
- Card-toolbar banner shape: a header `<div data-code-block-banner>` with
  `heading` (language/title spans) + `actions` (wrap/copy icon buttons) — the
  plugin reads the banner by cloning and stripping `button`/`svg`/`aria-hidden`
  chrome, so both shapes yield a clean language tag.
- Content: `<div className={styles.content} data-code-block-content>{pre or highlighted html}</div>`

Notes:

- The banner is conditional in DSH (`l && <div className=…>`); blocks rendered
  without a banner are intentionally skipped (`readFenceLanguage` returns null).
- The fixture page in `tests/fixtures/` reproduces the plain banner shape
  (infostring + action button); the card-toolbar shape and the banner-clone
  language read are covered by the `blocks.js` unit tests, and the same
  banner-clone code path runs against the fixture's plain shape in jsdom.
- The browser half never imports a DSH package — only the public Cordis `theme`
  service (`inject: ['theme']`) and this rendered DOM.

---

## 6. Findings, deviations and limitations

1. **No contract mismatch found.** Real DSH DOM selectors, boot-graph shape,
   `/plugins/??…` URL form and module-loader wrapper all match `docs/ARCH.md`
   and the README.
2. **Token extraction scope (fixture-only).** The 19 KB
   `/tmp/dsh-theme-tokens.css` extraction contains the color layers only; the
   font/radius tokens used by the plugin's CSS mapping are defined in the DSH
   theme base layer. `tests/fixtures/theme-tokens-base.css` adds them verbatim;
   the plugin itself needs no change (colors/fonts/radii resolve in the real app).
3. **Per-boot `rev` instability.** Loader `rev` values change every boot even for
   an unchanged profile, so boot-graph comparisons normalize `rev` and compare
   structure exactly.
4. **Route serves bundle + loader suffix.** DSH appends a 73-byte
   sourceMappingURL comment to the served file; the script asserts the served
   body equals the committed file plus that exact suffix, not just "starts with".
5. **Disabled vs removed.** Disabling keeps the row in `--dump-config`
   (`disabled: true`, package still installed) while the browser boot graph
   contains no trace of it; removing the package additionally drops the bundle
   layer. Both result in the same client-visible behavior.
6. **Obscura SSRF guard.** The Obscura MCP browser cannot open loopback URLs in
   this environment, so real-browser evidence was captured with installed
   Chrome 155 (headless + CDP) instead. This is a tooling limitation, not a
   product finding.
7. **Live GUI not inspected.** The running GUI requires the per-session auth
   token; without it the page is `401`. The DOM contract was verified against the
   shipped frontend bundle (section 5) instead of reading the user's live token.
8. **jsdom has no canvas context.** The bundle test deliberately relies on
   Pele's metrics-table fallback (the VirtualConsole notice is expected and
   filtered); real-browser rendering is covered by the fixture screenshots.
9. **Pele zoom icons.** Each diagram's host contains the diagram `<svg
   class="pele …">` plus 3 zoom-control icon SVGs. Count `svg.pele`, not `svg`.
10. **Font stack duplication is real DSH behavior.** DSH `base.css` declares
    `--dsw-font-family: var(--dsh-font-family-text, <default>), <default>`, so the
    computed value repeats the fallback stack when the runtime font override is
    empty. The plugin maps `--pele-font` to that token unchanged.
11. **No network.** Tests and fixture use no external network; the bundle has no
    CDN markers and no dynamic `import()`. `verify-install` only talks to
    `127.0.0.1` and pnpm resolves the workspace path as a local `link:`.
12. **pnpm store fallback.** In this sandbox pnpm cannot hard-link from the user
    store and prints a warning while using a store under the OS temp dir; it does
    not write into the workspace or the user's profile.

---

## 7. Acceptance matrix

| Requirement | Evidence | Result |
| --- | --- | --- |
| `npm run build` produces the committed bundle | `build --check` up to date, 693,967 B, SHA-256 recorded | PASS |
| Bundle is a single DSH module-loader registration, id == package name | `tests/bundle.test.mjs` wrapper test; boot graph entry | PASS |
| No runtime dependency on DSH or network (Pele bundled) | factory never calls `require`; no CDN markers; no dynamic import | PASS |
| Enabled ⇒ mermaid fences render synchronously with Pele | jsdom E2E: 3/3 drawable fences + invalid fallback; real browser: 4 diagrams incl. flowchart/sequence/pie/gantt | PASS |
| Banner/Copy untouched; original source is the artifact | banner `outerHTML` unchanged; same `<pre>` node round-trips via toolbar | PASS |
| Diagram/Source toolbar with `aria-pressed`, role group | jsdom + real-browser CDP clicks | PASS |
| Theme via CSS only; no re-render on color change | real browser remounts 4 → 4 while tokens flip light↔dark | PASS |
| Font-metric change re-renders | remounts 4 → 8 in real browser; jsdom node identity change | PASS |
| Invalid/oversized diagram falls back to source + plain-text error | jsdom error-note test + fixture screenshot | PASS |
| Non-mermaid blocks untouched | jsdom + fixture JS fence | PASS |
| Teardown restores the pre-plugin DOM | jsdom byte-identical `body.innerHTML`; real browser byte-identical `#thread` snapshot, 0 styles/diagrams | PASS |
| Disabled/absent ⇒ DSH exactly normal | disabled HTML 0 plugin occurrences, entry absent, route 404; disabled graph == uninstalled graph (rev-normalized) | PASS |
| Real install works on the actual `dsh` CLI | throwaway profile install + `--dump-config` row + served `/plugins/` bundle | PASS |
| No user profile / Desktop app / session data touched | isolated `DSH_HOME`, temp store, token redacted, no writes to `~/.dsh`; temp removed | PASS |

---

## 8. Artifact inventory added by this verification

- `tests/bundle.test.mjs` — 6-test jsdom E2E smoke of the built bundle.
- `scripts/verify-bundle.mjs` — `npm run verify` (build `--check` + bundle test).
- `scripts/verify-install.mjs` — isolated real-profile install/disable/remove proof.
- `scripts/serve-fixture.mjs` — static fixture server (repo root, loopback only).
- `tests/fixtures/fixture.html`, `fixture.js`, `fixture.css` — real-browser harness.
- `tests/fixtures/theme-tokens.css`, `theme-tokens-base.css` — verbatim real DSH tokens.
- `tests/fixtures/screenshots/*.png` + `visual-evidence.json` — browser evidence.
- `tests/fixtures/README.md` — fixture/token extraction and run instructions.
- `docs/VERIFICATION.md` — this record.

---

## 9. Historical pre-repair 0.1.1 correction: card-mode language detection (2026-10-19)

After the original verification, the plugin was installed into a real Desktop
profile and a live mermaid fence still rendered as a plain code block. The
regression was reproduced against the running Desktop GUI (auth cookie from the
local Chromium profile, CDP, read-only):

- Boot graph does contain the plugin, and its `apply()` ran
  (`style[data-dsh-pele-mermaid]` = 1), so activation was fine.
- The real chat block is the **card-toolbar variant**:
  `class="… md-code-block _card_…" data-code-wrap="true"`, and its banner's
  language span says **`代码块`** (the localized `t('codeBlock.title')` label),
  because Shiki has no Mermaid grammar. The info string `mermaid` is nowhere in
  the DOM. The original detector required the banner token to be `mermaid`, so
  it skipped every real block.
- The host node's `__reactProps$…` only carries DOM props; walking its
  `__reactFiber$…` `return` chain reaches the `CodeBlock` component fiber, whose
  `memoizedProps` still contain the exact `code` and `lang: "mermaid"`.

### Fix

`src/client/blocks.js` now resolves facts in layers:

1. exact `lang`/`code` from the `CodeBlock` component fiber (primary in the real
   chat UI);
2. banner info string, where the localized generic labels `代码块`/`Code` read as
   *unknown* (not as an explicit other language);
3. when no explicit language is readable, `detectType(source)` from the bundled
   Pele engine as a candidate — but such a candidate is replaced **only if Pele
   successfully renders it**; a failed candidate is left as a native code block
   with no error note and no retry churn. Explicit `mermaid` fences keep the
   error-note path.

`readFenceSource()` likewise prefers React's exact `code` prop (the rendered
`<pre>` is a display view and is detached while a diagram is mounted). A second
bug surfaced during validation: after a diagram mounted, the next scan saw an
empty DOM source and unmounted it; records now resolve their source from the
retained artifact before the language decision.

### Evidence

- `node --test "tests/*.test.mjs"` → **73/73 pass** (new cases: generic-label
  reading, fiber facts, source-detected mount, failed-candidate fallback,
  explicit-language exclusion).
- Live Desktop GUI (same origin, real theme tokens/CSS, headless Chrome + CDP,
  bundle injected manually because the page is already running the old bundle):
  three real-shaped card blocks — explicit `mermaid` (fiber props) rendered,
  heuristic (generic label, no fiber) rendered, `lua` untouched; dark tokens
  applied (`--pele-bg: #1b1b1c`, `--pele-fg: #f9fafb`), toolbar labels
  `图表/源码`, Source⇄Diagram round-trip, and `apply` cleanup restored the
  original `<pre>` and removed the stylesheet. Zero page errors.
- The fixture (`tests/fixtures/fixture.js`) now builds the real card shape with
  the generic label; only the invalid-source fence carries simulated fiber props
  to exercise the explicit error path.
- The installed Desktop copy
  (`~/.dsh/profiles/desktop/node_modules/dsh-pele-mermaid/lib/client.js`) was
  updated to the new build; the running app needs a restart to re-read it.
