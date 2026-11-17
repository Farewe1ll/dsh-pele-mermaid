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
| `fixture.js` | Builds the ARCH.md CodeBlock DOM (ten cards: eight valid diagrams, one invalid source, one JavaScript fence), fakes `window.__ModuleLoader__` + the Cordis `ctx`/`theme` service, loads `../../lib/client.js` (the BUILT bundle), and exposes `window.__fixture` (report API, theme toggle, toolbar helpers, `openViewer`/`closeViewer`, `scrollToDiagram`, `diagramFacts`, `emitTheme`, `teardown`). |
| `fixture.css` | Harness chrome only (layout, DSH-like code cards, sidebar). Uses DSH tokens; no plugin internals. |
| `theme-tokens.css` | Verbatim copy of the DSH 0.2.1-rc.2 **color token** layers (`--dsw-static-*`, `--dsw-alias-*`, light + dark). |
| `theme-tokens-base.css` | Verbatim copy of the DSH 0.2.1-rc.2 theme **base layer** (`:root`: font-family stacks, `--dsw-radius-*`, easings; `body`: font-family aliases). The plugin maps `--pele-font`, `--pele-font-mono` and `--pele-radius` to these tokens. |
| `screenshots/` | Real-browser captures + `visual-evidence.json` produced from the CDP run. |

## Fixture diagram cases (0.2.0 P1)

`fixture.js` builds ten code-block cards, in this order (the index used by the
harness helpers and by `diagramFacts()`):

| # | Case | Proves |
| --- | --- | --- |
| 1 | `flowchart LR` | baseline flowchart + toolbar |
| 2 | `sequenceDiagram` | second diagram type |
| 3 | `pie` | third diagram type |
| 4 | `gantt` | fourth diagram type |
| 5 | `flowchart (CJK wrapping)` | long Chinese labels wrap between characters without stretching the diagram; one label mixes an `English token` / `code` run into the CJK text; a label ends in `。` and the closing punctuation stays with its preceding line |
| 6 | `classDiagram (group wrapping)` | `direction LR` with three class groups: one row in the wide column, three rows in the narrow column (Pele `autoDirection`) |
| 7 | `flowchart (generic labels)` | `List<Diagram>`, `Map<String, Diagram>`, `Set<Diagram>` survive as literal label text |
| 8 | `flowchart (rich labels)` | `<sub>`, `<sup>`, `<code>`, `<kbd>`, `<samp>` render as `baseline-shift`/mono text runs (quoted labels, no scripts) |
| 9 | `mermaid (invalid)` | source fallback + plain-text `Pele: ...` note |
| 10 | `javascript` fence | non-mermaid fence stays untouched |

Cases 5–8 are the P1 visual checks. `window.__fixture.diagramFacts()` returns
the measured SVG facts (wrapped line counts, closing-punctuation retention,
class-diagram row count, angle-bracket label text, rich-text run counts), so
the verification asserts those facts instead of only comparing pixels.

## Where the token files come from (read-only extraction and version gate)

Both committed token files are pinned to `@deepseek-ai/dsh-client-ui-theme`
**`0.2.1-rc.2`** (read-only from `app.asar`; no user profile is touched):

- `tests/fixtures/theme-tokens.css` — 19,035 bytes, SHA-256
  `679d76601164388d80a80719bb49a06ac83e7aa3847f4e881225086a61bcfa76`
- `tests/fixtures/theme-tokens-base.css` — 1,797 bytes, SHA-256
  `fbde7d74dc5ec9b9f2b62032dfc6c114e8555ad4de5f4d0e8b27728a419289cf`

To verify or extract against an installed DSH archive, check the source package
version and asset digest first. **Do not overwrite these files from a
`0.2.2-rc.*` installation and label them as the `0.2.1-rc.2` fixture** — if the
`0.2.1-rc.2` app archive is unavailable locally, keep the committed files above
and treat exact archive re-extraction as a historical source limitation
(upgrading the fixture to a newer host version must be done as a separate,
re-verified change):

```sh
ELECTRON_RUN_AS_NODE=1 "/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness" -e '
  const fs = require("fs")
  const crypto = require("crypto")
  const base = "/Applications/DeepSeek Harness.app/Contents/Resources/app.asar/dsh/node_modules/@deepseek-ai/dsh-client-ui-theme"
  const pkg = JSON.parse(fs.readFileSync(base + "/package.json", "utf8"))
  const clientBytes = fs.readFileSync(base + "/lib/client.js")
  const clientSha256 = crypto.createHash("sha256").update(clientBytes).digest("hex")
  console.error("source package:", pkg.name + "@" + pkg.version, "lib/client.js sha256:", clientSha256)
  if (pkg.version !== "0.2.1-rc.2") {
    console.error("refusing to overwrite 0.2.1-rc.2 fixture tokens from host version " + pkg.version)
    process.exit(1)
  }
  const txt = clientBytes.toString("utf8")
  const readCssString = (marker) => {
    const m = txt.indexOf(marker)
    if (m < 0) throw new Error("missing marker: " + marker)
    const quote = txt.indexOf("\"", m + marker.length)
    let i = quote + 1, out = "", escaped = false
    for (; i < txt.length; i++) {
      const c = txt[i]
      if (escaped) { out += c === "n" ? "\n" : c === "t" ? "\t" : c; escaped = false }
      else if (c === "\\") escaped = true
      else if (c === "\"") break
      else out += c
    }
    return out
  }
  process.stdout.write(readCssString("var base_css_default = "))
'
```

`theme-tokens-base.css` stores that base layer verbatim under a provenance
comment, alongside the color-token layer in `theme-tokens.css`. Keeping the two
layers together means `--dsw-font-family`, `--ds-font-family-code` and
`--dsw-radius-md` resolve exactly as they do in DSH, so the fixture proves the
plugin's Pele-variable mapping instead of relying on Pele's fallbacks.

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
- toolbar contract: `toolbarButtons: 32` and `toolbarButtonsPerDiagram: [4, 4, 4, 4,
  4, 4, 4, 4]` in DOM order `[Diagram, Source, Download SVG icon, Fullscreen
  icon]`; `iconButtons: 16`, `downloadButtons: 8`, `fullscreenButtons: 8`, and
  `disabledToolbarButtons: 0` once every diagram is mounted;
- viewer contract while open: `viewerOverlays: 1`, `viewerDialogs: 1`
  (`role="dialog"`, `aria-modal="true"`), `viewerToolbarButtons: 4`, and
  `viewerViewBox` (`0 0 <w> <h>` at fit); after Escape/close all are back to
  zero and `viewerFocusRestored: true` reports that focus returned to the
  Fullscreen trigger;
- remount counter: initial mount adds `expectedDiagrams` (`8`) `svg.pele` nodes;
  a theme (colour) switch must add **zero**; a font-metric change adds 8 more
  (measured as a delta because a container resize also re-renders);
- resolved `--pele-*` custom properties and container background, i.e. the real
  token mapping in the active theme;
- teardown result: this fixture makes no host source updates, so its `#thread`
  subtree can be compared with the pre-plugin snapshot. Dynamic cleanup tests
  instead assert preservation of the latest host state.

## Reproducing the captured screenshots

```sh
npm run build
npm run verify:visual
# or write into a specific new staging directory:
node scripts/verify-visual.mjs --output-dir=.artifacts/visual-check
```

By default `npm run verify:visual` writes into a fresh `.artifacts/<run-id>/`
directory (and prints the resolved path on startup) so routine runs never
clobber the committed baseline in `tests/fixtures/screenshots/` or finalized
records under `docs/evidence/**`.

This command starts a loopback server and an isolated headless Chrome profile,
checks rendering, the 4-button toolbar, theme changes, source visibility/parent
identity, the fullscreen viewer (open, zoom/fit, Escape close, focus restore,
repeated open/close, and a live theme switch while open), the downloaded SVG
(light + dark background rectangle, dark file rendered on a white stand-in
page), the narrow-column P1 layout, font refresh and teardown, and regenerates
ten PNGs together with `visual-evidence.json`:

| PNG | Content |
| --- | --- |
| `fixture-light.png` | wide column, light theme (first screen: fences 1–5) |
| `fixture-wide-p1.png` | wide column, the P1 cards: CJK wrapping, three class groups on one row, generic/rich labels, invalid fallback, untouched JavaScript fence |
| `fixture-dark.png` | wide column, dark theme (CSS-only repaint, no remount) |
| `fixture-source-view.png` | Diagram/Source toggle keeps the host `<pre>` parent and text |
| `fixture-viewer.png` | fullscreen viewer overlay: one dialog, four controls, natural-size SVG viewBox |
| `fixture-viewer-dark.png` | same open overlay after switching to dark while open: both the diagram and the dialog chrome repaint (live `var(--dsw-*)` theme) |
| `fixture-export-dark-preview.png` | the downloaded dark SVG bytes rendered on a white stand-in page: the export paints its own background, so text stays readable outside DSH |
| `fixture-narrow.png` | 720×2200 narrow column scrolled to the P1 cards: class groups on three rows, CJK labels still wrapped |
| `fixture-font-refresh.png` | after a font-metric change (re-mount, +8 diagrams) |
| `fixture-teardown.png` | after teardown: zero diagrams, zero plugin styles |

The narrow capture uses 720×2200 rather than 760px because the harness content
column is ~602px wide there, which crosses Pele's 640px `autoDirection`
breakpoint for the class diagram; at 760px the column is ~642px and the three
class groups stay on one row. Both states are asserted from measured SVG facts,
not just captured.

The JSON records browser version, wide and narrow viewport, locale/query, bundle
hash, each PNG's size/hash, the wide/narrow P1 facts, the viewer open/closed
reports, and the remount delta. It also records the downloaded-SVG checks
(`exportLight`/`exportDark` background rectangle, the dark preview, and the
`viewerTheme` light/dark computed colors), and external requests from this
fixture page for these inputs; it does not claim complete network coverage of
all diagram types. Downloads are captured without writing files: the script
intercepts the temporary anchor click, keeps the Blob URL alive, and fetches the
exact SVG text back inside the page. Set `CHROME_BIN` to use another Chrome/Chromium binary. The
temporary profile and server are cleaned up after the run. No daily browser or
DSH profile is used.

In restricted sandbox environments (for example inside an agent sandbox) Chrome's
own renderer sandbox cannot start, the page target crashes after `Page.enable`,
and CDP calls time out. Run with
`DSH_VISUAL_CHROME_NO_SANDBOX=1 npm run verify:visual` there: that env var adds
only `--no-sandbox --disable-setuid-sandbox`. Normal runs keep Chrome's sandbox.

Current captures use `?locale=en`: the DSH card label remains `代码块`, while
plugin toolbar labels are `Diagram` / `Source`. The default viewport is
1400×2400. The sidebar is intentionally a live report and contains per-run timing
values.

`scripts/verify-install.mjs` separately validates DSH install/disable/remove with
an isolated `DSH_HOME`; see `docs/VERIFICATION.md`.
