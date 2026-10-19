# tests/fixtures — visual harness for dsh-pele-mermaid

This directory is a **standalone, real-browser harness** for the built browser
bundle (`lib/client.js`). It is not used by `node --test`; it exists so a human
or an automated browser can verify rendering, theming, toolbar interaction and
teardown using DSH-like DOM and copied host theme tokens. The card fixtures
carry static committed-shape Fiber objects for every Mermaid fence; they do
not run React. `tests/react-lifecycle.test.mjs` and the real-React bundle test
cover lifecycle separately; `scripts/verify-host.mjs` probes installed CodeBlock.

## Files

| File | Purpose |
| --- | --- |
| `fixture.html` | Harness page: DSH-like top bar, assistant Markdown thread, evidence sidebar. Loads `fixture.css` and both real token layers, then `fixture.js`. |
| `fixture.js` | Builds the ARCH.md CodeBlock DOM, fakes `window.__ModuleLoader__` + the Cordis `ctx`/`theme` service, loads `../../lib/client.js` (the BUILT bundle), and exposes `window.__fixture` (report API, theme toggle, toolbar helpers, `emitTheme`, `teardown`). |
| `fixture.css` | Harness chrome only (layout, DSH-like code cards, sidebar). Uses DSH tokens; no plugin internals. |
| `theme-tokens.css` | Verbatim copy of the DSH 0.2.1-rc.2 **color token** layers (`--dsw-static-*`, `--dsw-alias-*`, light + dark). |
| `theme-tokens-base.css` | Verbatim copy of the DSH 0.2.1-rc.2 theme **base layer** (`:root`: font-family stacks, `--dsw-radius-*`, easings; `body`: font-family aliases). The plugin maps `--pele-font`, `--pele-font-mono` and `--pele-radius` to these tokens. |
| `screenshots/` | Real-browser captures + `visual-evidence.json` produced from the CDP run. |

## Where the token files come from (read-only extraction)

Both are read from the installed DSH app bundle (no user profile is touched):

```sh
# COLOR layers (the 19 KB extraction)
cat /tmp/dsh-theme-tokens.css          # produced by the Lead from @deepseek-ai/dsh-client-ui-theme 0.2.1-rc.2
# BASE layer (fonts / radii / easings)
ELECTRON_RUN_AS_NODE=1 "/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness" -e '
  const fs = require("fs")
  const p = "/Applications/DeepSeek Harness.app/Contents/Resources/app.asar/dsh/node_modules/@deepseek-ai/dsh-client-ui-theme/lib/client.js"
  const txt = fs.readFileSync(p, "utf8")
  const marker = "var base_css_default = "
  const m = txt.indexOf(marker)
  const quote = txt.indexOf("\"", m + marker.length)
  let i = quote + 1, out = "", escaped = false
  for (; i < txt.length; i++) {
    const c = txt[i]
    if (escaped) { out += c === "n" ? "\n" : c === "t" ? "\t" : c; escaped = false }
    else if (c === "\\") escaped = true
    else if (c === "\"") break
    else out += c
  }
  process.stdout.write(out)
'
```

`theme-tokens-base.css` stores that base layer verbatim under a provenance
comment. Keeping the two layers together means `--dsw-font-family`,
`--ds-font-family-code` and `--dsw-radius-md` resolve exactly as they do in DSH,
so the fixture proves the plugin's Pele-variable mapping instead of relying on
Pele's fallbacks.

## Run it

```sh
npm run build
node scripts/serve-fixture.mjs --port 8123
# light:   http://127.0.0.1:8123/tests/fixtures/fixture.html
# dark:    http://127.0.0.1:8123/tests/fixtures/fixture.html?theme=dark
# english: append &locale=en   (the plugin's toolbar locale follows navigator.language)
```

Query parameters:

- `?theme=dark|light` — initial `body[data-ds-dark-theme]` state.
- `?locale=en|zh` — pins `navigator.language` so toolbar labels are deterministic
  (Diagram / Source vs 图表 / 源码).

The page must be served over HTTP (the bundle is loaded as a relative
`<script src="../../lib/client.js">`, and `file://` breaks it).

## What the page proves

The evidence sidebar is generated from live DOM measurements, so a screenshot is
self-describing. It reports:

- module-loader registration (`id="dsh-pele-mermaid"`, factory type),
  `{ apply, inject: ["theme"] }`, `requireCalls: 0` (Pele is bundled);
- block/diagram/svg counts, diagram types, zoom controls, toolbar buttons and
  `aria-pressed`, error-fallback count, single stylesheet;
- remount counter: initial mount adds `expectedDiagrams` (`4`) `svg.pele` nodes;
  a theme (colour) switch must add **zero**; a font-metric change adds 4 more;
- resolved `--pele-*` custom properties and container background, i.e. the real
  token mapping in the active theme;
- teardown result: this fixture makes no host source updates, so its `#thread`
  subtree can be compared with the pre-plugin snapshot. Dynamic cleanup tests
  instead assert preservation of the latest host state.

## Reproducing the captured screenshots

```sh
npm run build
npm run verify:visual
```

This command starts a loopback server and an isolated headless Chrome profile,
checks rendering, theme changes, source visibility/parent identity, font refresh
and teardown, and regenerates all five PNGs together with `visual-evidence.json`.
The JSON records browser version, viewport, locale/query, bundle hash and each
PNG's size/hash. It also records external requests from this fixture page for
these inputs; it does not claim complete network coverage of all diagram types.
Set `CHROME_BIN` to use another Chrome/Chromium binary. The temporary profile and
server are cleaned up after the run. No daily browser or DSH profile is used.

Current captures use `?locale=en`: the DSH card label remains `代码块`, while
plugin toolbar labels are `Diagram` / `Source`. The fixed viewport is 1400×2400.
The sidebar is intentionally a live report and contains per-run timing values.

`scripts/verify-install.mjs` separately validates DSH install/disable/remove with
an isolated `DSH_HOME`; see `docs/VERIFICATION.md`.
