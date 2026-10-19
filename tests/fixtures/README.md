# tests/fixtures — visual harness for dsh-pele-mermaid

This directory is a **standalone, real-browser harness** for the built browser
bundle (`lib/client.js`). It is not used by `node --test`; it exists so a human
or an automated browser can verify rendering, theming, toolbar interaction and
teardown against the same DOM/token environment the real DSH Web client uses.

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
- teardown result: the plugin-owned `#thread` subtree must be byte-identical to
  its pre-plugin snapshot after `ctx.effect` cleanup, with 0 styles/diagrams.

## Reproducing the captured screenshots

The committed PNGs in `screenshots/` were produced with the installed Google
Chrome (155) driven over CDP against the local server. The Obscura MCP browser
blocks loopback URLs by default (`Access to private/internal IP address … is not
allowed`), so the same real-browser checks were done with headless Chrome:

```sh
node scripts/serve-fixture.mjs --port 8123 &

# One-shot screenshots (light/dark) with a virtual time budget for the settle gate:
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless=new --no-sandbox --disable-gpu --disable-crash-reporter --disable-breakpad \
  --user-data-dir="$(mktemp -d)" --window-size=1400,2400 --hide-scrollbars \
  --virtual-time-budget=8000 \
  --screenshot="$PWD/tests/fixtures/screenshots/fixture-light.png" \
  "http://127.0.0.1:8123/tests/fixtures/fixture.html?locale=en"

# Interaction sequence (theme toggle, Diagram/Source, font refresh, teardown)
# was driven over the DevTools protocol: launch Chrome with
#   --remote-debugging-port=<port> about:blank
# and use Page.navigate / Runtime.evaluate / Page.captureScreenshot.
```

`scripts/verify-install.mjs` is the unrelated real-profile install proof; see
`docs/VERIFICATION.md`.
