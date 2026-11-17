# dsh-pele-mermaid — Architecture

Scope: current `0.2.0` working build. The verified compatibility target remains
DSH `0.2.1-rc.2` / React `18.3.1`; the installed-host component probe also
supports and passes on DSH `0.2.2-rc.3`, but no live `0.2.2` chat session was
recorded (P0). This file is the single source of truth for module boundaries,
interfaces, DOM assumptions, and the constraints that keep the plugin decoupled
from DSH. Evidence for every acceptance claim lives in
[`docs/VERIFICATION.md`](VERIFICATION.md).

## Why this shape

`dsh` (DeepSeek Harness) is a Cordis "everything is a plugin" host. A Web UI
plugin is an npm package with **two halves**:

- **Host half** — `index.js`, an ordinary Cordis plugin loaded from a profile
  patch row. Ours is intentionally empty: it only keeps the Loader row alive.
- **Browser half** — the built bundle at `exports["./client"]`, served by
  `@deepseek-ai/dsh-client-modules` under
  `/plugins/dsh-pele-mermaid/client.js` and registered through
  `window.__ModuleLoader__.load({ id, factory })`.

When the patch row is absent or `disabled: true`, the package never enters
`window.__DSH_BOOT__`: no script is served, no style is added, no observer
exists. DSH is exactly the shipped product. When the row is active, the browser
half post-processes settled explicit `mermaid`, `mermaidjs`, or `mmd` code
blocks into Pele diagrams.

We intentionally do **not** patch, fork, require, or otherwise touch any
`@deepseek-ai/*` package at runtime. Runtime integration uses the public Cordis
service `theme` (`inject: ['theme']`), the rendered Markdown DOM, and private
React Fiber fields for generic-banner language identification. No DSH package is
imported, but framework-internal compatibility remains a dependency.

`0.2.0` adds export and viewer modules **inside the same browser half**. The P6
decision below keeps the renderer bundled inline, so there is still no host
route, no lazy runtime, and no second half.

## Pele facts that drive the design

Pele is **synchronous** and has **zero runtime dependencies**; `0.2.0` pins the
exact version `1.9.0`.

- Bundle `pele` into our single client bundle with esbuild. No CDN, no async
  load, no `pele/lazy`, no `mermaid` global. `images: false` prevents diagram
  image embeds; user-activated links keep Pele's filtering.
- `mount(container, source, options)` renders synchronously and returns a
  handle. It re-lays out on container resize and owns inline zoom/pan/keyboard.
  The handle also exposes the *pristine* render result (SVG text, natural width
  and height, diagram type) plus the current zoom state; our adapter surfaces
  those as `snapshot()` / `zoom()` without re-running the renderer.
- Colors/fonts are CSS variables (`--pele-*`), and **color changes do not need a
  re-render**: theme switches are pure CSS. Source changes, host node replacement
  and *text measurement inputs* (font family / font size events) can rebuild a
  diagram. Appearance font size is not yet forwarded to Pele; see the
  limitations register.
- Pele 1.9 fixes the label layout this release targets: CJK wrapping between
  characters, closing punctuation, class-diagram group wrapping, generic
  `List<T>`/`Map<K,V>` labels, and rich `<sub>`/`<sup>`/`<code>`/`<kbd>`/`<samp>`
  labels. The plugin adds no text shaping or heuristics of its own.
- Built-in safety: escapes label text, filters links and styles, rejects
  oversized source/SVG/edge counts. We do not expose options or `config` to
  diagram authors, and we never insert icons. Export/viewer reuse a sanitized
  clone of Pele's output and add no renderer input.

## Package layout

```
dsh-pele-mermaid/
├── package.json            # 0.2.0; dsh.bundle.patch + dsh.client (platform web)
├── cordis.patch.yml        # insert row `dsh-pele-mermaid`
├── index.js                # Host half: empty apply()
├── lib/client.js           # BUILT browser bundle (committed; `npm run build`)
├── CHANGELOG.md            # 0.2.0 release notes; shipped via package.json#files
├── scripts/build-client.mjs
├── src/client/
│   ├── index.js            # Cordis browser plugin: observer + theme policy
│   ├── engine.js           # Pele adapter (mount / error / refresh / snapshot / zoom / destroy)
│   ├── theme-css.js        # --pele-* ← --dsw-* mapping, toolbar/viewer CSS, installStyles
│   ├── blocks.js           # detection, settle, mount, toolbar, export/viewer wiring, cleanup
│   ├── icons.js            # decorative inline SVG icons (no font/sprite/network)
│   ├── export.js           # pristine SVG → sanitized standalone SVG download
│   └── viewer.js           # reusable fullscreen overlay over the sanitized SVG
├── tests/                  # node:test + jsdom; no test runner beyond Node
├── docs/ARCH.md
└── docs/evidence/          # per-run evidence records
```

## Browser-half contracts

Exact JSDoc types and parameter signatures live in the source modules under
[`src/client/`](../src/client/); this section summarizes each module's exported
surface and the rules it must obey.

### [`src/client/engine.js`](../src/client/engine.js)

Exports: `mountDiagram(container, source) -> DiagramHandle` (`{ ok, error, refresh, destroy, snapshot, zoom }`) and `DIAGRAM_OPTIONS`.

Rules:

- `mountDiagram` appends nothing else; the caller owns the container element
  and its classes.
- On `ok:false`, the container is left empty (the block layer decides how to
  show the source and the error) and `error` carries `PeleError.message` as
  plain text. Never put the message in HTML.
- `DIAGRAM_OPTIONS` enables interaction: `zoom: true`, `autoDirection: true`,
  `responsive: true`, and `images: false`. There are no
  `icons`/`sanitize`/author-driven options. User-activated links remain
  subject to Pele's link filtering; image resources are not embedded.
- `snapshot()` returns Pele's pristine `result` (`result.svg`, `result.width`,
  `result.height`, `result.type`) and `null` when the handle failed, was
  disposed, or lost its result. It must never read the live inline SVG: Pele's
  zoom/pan mutates `viewBox`, which would crop the exported file. A failed
  handle exposes `snapshot() -> null` and neutral zoom.
- `zoom()` reports `{ scale, fit, factor }` where `factor = scale / fit` is the
  inline zoom relative to the fit-to-column view; invalid or missing values fall
  back to `1`. The viewer uses `factor` to open at the inline zoom.
- `destroy()` must be idempotent and must call Pele's `handle.destroy()` when
  present.
- No `document`/`window` access at module import time; resolve at call time.

### [`src/client/theme-css.js`](../src/client/theme-css.js)

Exports: `installStyles(doc) -> () => void`, `buildStyles() -> string`,
`STYLE_ATTR`, `SOURCE_HIDDEN_ATTR`, `PELE_VARIABLES`, `PELE_VARIABLE_NAMES`, and
the `CLASS` namespace map (`diagram`, `toolbar`, `error`, `source`, `active`,
`icon`, `viewer`, `viewerBackdrop`, `viewerDialog`, `viewerToolbar`,
`viewerStage`, `viewerCanvas`, `viewerSvg`).

Rules:

- Styles only use existing DSH design tokens (`--dsw-*`, `--ds-font-family-code`
  when present) plus values we define ourselves. **No hardcoded palette
  colors.** The one exception: inline SVG icons use `currentColor`.
- The mapping block sets `--pele-*` on our diagram container:
  `--pele-bg`, `--pele-fg`, `--pele-muted`, `--pele-line`, `--pele-surface`,
  `--pele-surface-alt`, `--pele-border`, `--pele-accent`, `--pele-critical`,
  `--pele-error`, `--pele-font`, `--pele-font-mono`, `--pele-radius`.
  Series colors stay Pele's defaults (documented; they are theme-neutral).
  `PELE_VARIABLE_NAMES` is derived from the same list so export stays in sync.
- Theme switching is **CSS only**. Do not listen to dark-mode DOM attributes
  here; the tokens flip under us.
- Toolbar icon CSS sizes the decorative 14 px icons and gives disabled buttons a
  token-based state. Viewer chrome is scoped to the viewer classes: fixed
  overlay, backdrop mask, flex dialog, compact 28 px icon buttons, a stage with
  `cursor: grab`, `touch-action: none`, and `[data-panning]` for drag state.
- `prefers-reduced-motion` is respected with a `no-preference` media query
  around the only animation (the dialog fade-in); nothing else animates.
- `installStyles` is idempotent per document: remove a previous element with
  `STYLE_ATTR` before adding, return an idempotent disposer that only removes
  the element it installed.
- Class names are prefixed `dsh-pele-mermaid-`; never reuse DSH's hashed
  markdown classes for our own styling.

### [`src/client/blocks.js`](../src/client/blocks.js)

Exports: `MERMAID_LANG` (`'mermaid'`), `MERMAID_LANGS` (`['mermaid', 'mermaidjs', 'mmd']`),
`isMermaidLanguage(lang)`, `readFenceFacts(block)`, `readFenceLanguage(block)`,
`readFenceSource(block)`, and `createBlockManager(options) -> { scan, refreshAll, destroy, count, locale }`.
The injected `options.mountDiagram` accepts the simplified `BlockDiagramHandle`
contract (`{ ok, error?, destroy?, snapshot?, zoom? }`) rather than requiring a
full engine handle (`refresh()` is not called by `blocks.js`).

Behavior:

1. `scan()` walks `document.querySelectorAll('.md-code-block')`.
2. A candidate must have a banner, a host-owned `<pre>`,
   `isMermaidLanguage(readFenceLanguage(block))`, and non-blank source. Only the
   three explicit aliases render; unknown language is never inferred from source
   text and `language-*` classes are never sniffed. Near-miss names such as
   `mmdx`, `mermaid.js`, `mermaid-js`, or `mermaidjsx` stay native.
3. **Settle gate**: a block renders only after its source has been unchanged
   for `settleMs`. New/changed source records `{ source, since: now() }` and
   schedules another scan. A streaming pause longer than the settle window
   can still render partial source; this is a stability heuristic, not a
   completion signal from the host.
4. **Source stays host-owned**: the original `<pre>` remains in its React-owned
   parent and is marked with the plugin's temporary
   `data-dsh-pele-mermaid-source-hidden` attribute while Diagram view is shown.
   Source view removes that marker and hides the Pele host. The DSH banner and
   Copy handler therefore keep their original DOM lookup and trailing-newline
   behavior.
5. **DOM shape** (shipped DSH `0.2.1-rc.2` CodeBlock; the `0.2.2-rc.3`
   component keeps the same `[data-code-block-banner]` /
   `[data-code-block-content]` hooks, verified by the host probe):
   ```html
   <div class="md-code-block ... _card_...">
     <div class="...">
       <div class="..." data-code-block-banner>
         <div class="...heading"><span class="...language">代码块</span></div>
         <div class="...actions"><button>wrap</button><button>copy</button></div>
       </div>
     </div>
     <div class="..." data-code-block-content>
       <pre class="..."><code>flowchart LR ...</code></pre>
     </div>
   </div>
   ```
   `[data-code-block-banner]` and `[data-code-block-content]` are the stable
   hooks (hashed CSS-module classes are never used). We insert our wrapper
   **inside** `[data-code-block-content]` and keep the banner untouched.

   **Language resolution is explicit.** The reader first checks the committed
   React 18 fiber branch for the `CodeBlock` `lang`/`code` props. Only when
   those props are unavailable does it read a non-generic banner language
   (`代码块` / `Code` means unknown). A generic or missing language is left as a
   native code block, even when its source happens to look like Mermaid. Root
   membership is checked through parent child-lists and alternates against
   `root.current` (up to 512 root ancestors); the CodeBlock search itself is
   bounded to 40 ancestors. Committed props remain authoritative even when their
   language is empty. With no usable props, source comes from the original
   `<pre>`. Banner-less `.md-code-block` nodes (other UI surfaces) are never
   treated as fences.
6. **Toolbar contract.** One `role="group"` toolbar with exactly four buttons,
   in this order:
   - `Diagram` / `Source` text buttons (localized; `aria-pressed` marks the
     active view);
   - two icon-only buttons, **`Download SVG` / `下载 SVG`** and
     **`Fullscreen` / `全屏查看`**, each with a localized `aria-label` and
     `title` and a decorative (`aria-hidden`) SVG icon from `icons.js`.

   The icon buttons are disabled from creation and enabled only when a mount
   produced a pristine render result (`snapshot() !== null`); a failed or
   stub handle keeps them disabled, and clicking a disabled button is inert.
7. **Export operation.** `downloadRecordDiagram(record)` takes
   `record.handle.snapshot()`, renders it through
   `buildExportSvg(snapshot, { document, view, container, theme: 'resolved' })`
   (download mode: freeze today's resolved colors and background), names it with
   `exportFilename(snapshot.type)`, and calls `downloadSvg(text, filename)`.
   Any missing snapshot, rejected export, or download failure is a silent no-op
   (the controls are disabled, not error UI). The builder/downloader are
   injectable seams for tests.
8. **Viewer operation.** A single lazily created viewer instance per page opens
   on the sanitized SVG text rendered with `theme: 'inherit'` (token
   expressions + `var(--pele-bg)` background, so the open overlay follows live
   theme switches) with the snapshot's natural size and `zoom.factor`. Opening a different diagram closes the previous overlay; a
   record rebuild/unmount closes the overlay owned by that record; manager
   `destroy()` closes and destroys the viewer before releasing block DOM. The
   viewer gets explicit parameters and owned nodes; it never touches the
   manager's records.
9. Error handling: when `mountDiagram` returns `ok:false`, keep the source
   `<pre>` visible exactly as DSH rendered it and append a small
   `.dsh-pele-mermaid-error` note whose text is assigned via `textContent`
   (`errorPrefix + message`). The record stays so a later source edit retries;
   export/viewer stay disabled because no snapshot exists.
10. Re-render policy: source changed → close any viewer owned by the record,
    destroy old diagram and re-settle. Same source with healthy nodes → do
    nothing. Host node replacement can rebuild unchanged source;
    `refreshAll()` also rebuilds for font-input events. Theme color changes do
    not request rebuilds.
11. `destroy()` removes only plugin containers, toolbars, error notes and the
    temporary source marker, closes/destroys the viewer, unmounts every Pele
    handle, and is idempotent. It does not restore an old snapshot or move a
    host node. If React changed the source or replaced a subtree during plugin
    lifetime, the latest host DOM is preserved.
12. React re-render self-healing: if a later React pass replaces our wrapper
    (source changed or node recreated), the next `scan()` re-applies. We never
    throw into React: all DOM work is wrapped defensively.
13. Accessibility: labels come from `locale` — toolbar `zh`: 图表操作/图表/源码/
    下载 SVG/全屏查看, `en`: Diagram controls/Diagram/Source/Download SVG/
    Fullscreen. Focus style uses `--dsw-alias-border-l2`.

### [`src/client/icons.js`](../src/client/icons.js)

Exports: `ICON_PATHS` (`download`, `fullscreen`, `close`, `zoomIn`, `zoomOut`, `fit`)
and `createIcon(doc, name) -> SVGElement`.

Rules: inline SVG only — no icon font, sprite, data URL, or network request; the
owning button carries the accessible name; a missing path name still returns a
usable empty icon rather than throwing.

### [`src/client/export.js`](../src/client/export.js)

Exports: `collectThemeVariables(container, view)`,
`buildExportSvg(snapshot, { document, view, container, theme = 'resolved' })`,
`BACKGROUND_ATTR` (`'data-dsh-pele-mermaid-background'`), `BACKGROUND_CLASS`
(`'pele-export-background'`), `exportFilename(type, date)`,
`downloadSvg(svgText, filename, { document, view, url })`, and `viewOf(doc)`.

Rules:

- Input is only the engine snapshot. Parse with `DOMParser`; reject a parser
  error, a non-`svg` root, missing dimensions, or oversized markup; fail closed
  (`null`/`false`) instead of throwing.
- Restore natural size: `width`/`height` and `viewBox="0 0 w h"` from the
  snapshot (fallback to root attributes) always override the inline zoom/pan
  state; the complete diagram is exported.
- Sanitize every element: remove `script`, `foreignObject`, `iframe`,
  `object`, `embed`, `image`, `audio`, `video`; remove `on*` attributes,
  `src`, unsafe `style` (`expression(`, `javascript:`, `vbscript:`,
  `@import`) and non-local `url()`; keep `href`/`xlink:href` only for
  `#fragment`, `https?`, `mailto:`, `tel:` (`use` allows only fragments).
- Insert a first-child `<rect>` covering the natural-size canvas
  (`x/y=0`, natural width/height, `pointer-events="none"`, marked with
  `data-dsh-pele-mermaid-background` and class `pele-export-background`).
  Download mode fills it with the resolved `--pele-bg` (fallback
  `var(--pele-bg, #ffffff)`) so dark exports stay readable on a white page;
  `inherit` mode fills it with `var(--pele-bg)` so the viewer repaints with the
  theme.
- Download mode writes the resolved theme variables onto the root `style`,
  preserving Pele's own declarations; reject values containing `;`, braces,
  angle brackets, or external `url()`. `inherit` mode instead writes the
  `--pele-*: var(--dsw-*)` mapping from `PELE_VARIABLES`, so the SVG has no
  frozen colors and follows the host tokens like the inline card.
- The background is an enhancement: when it cannot be inserted the export still
  returns a valid SVG (no throw, no failed download).
- `downloadSvg` builds a `Blob` of type `image/svg+xml;charset=utf-8`, creates
  a temporary hidden anchor, clicks it, removes it, and revokes the object URL
  on the next tick. It returns `false` (no throw) when Blob/URL/anchor support
  is missing.
- No network access and no renderer re-run. Filename uses the client's local
  time.

### [`src/client/viewer.js`](../src/client/viewer.js)

Exports: `createViewer({ document, view, locale, measureStage, maxScale }) -> { open, close, destroy, isOpen, scale, zoomIn, zoomOut, fit }`.

Rules:

- Structure: root `div[data-dsh-pele-mermaid-viewer]` with a backdrop and a
  dialog (`role="dialog"`, `aria-modal="true"`, localized `aria-label`); a
  `role="toolbar"` with exactly four icon buttons — zoom out, zoom in, fit,
  close — then a stage containing the imported SVG. Exactly one overlay exists:
  `open()` closes a previous instance before creating the next.
- The SVG passed in is the already-sanitized `inherit`-mode export text (token
  expressions, `var(--pele-bg)` background); the viewer parses it, sets natural
  `width`/`height` and the full `viewBox`, marks it with `viewerSvg`, removes
  `tabindex`, and never re-renders Pele or reads inline zoom/pan state. Because
  the tokens are live, the diagram background repaints with the host theme while
  the overlay is open; the dialog chrome uses DSH tokens directly and repaints
  too. A downloaded file is the opposite by design: `resolved` colors frozen at
  download time.
- Zoom: opens at `zoomFactor` clamped to `[1, 8]`; button steps are ×1.25;
  fit resets to scale 1 and viewBox 0 0 w h; zoom is anchored at the pointer for
  Ctrl/Cmd + wheel (plain wheel is left to the page); the viewBox is cropped and
  clamped so blank space is never exposed.
- Pan: pointer drag with capture (when available) moves within the diagram
  bounds; arrow keys pan by 48 px; `data-panning` marks drag state.
- Keyboard: `Escape` closes, `Tab`/`Shift+Tab` trap focus among enabled
  controls, `+`/`=` and `-`/`_` zoom, `0` fits. Focus moves to the close
  button on open and returns to the saved trigger on close.
- Lifecycle: opening saves focus, body/html overflow and scroll position, locks
  scrolling, and closes on backdrop click (not on clicks inside the dialog);
  close removes the overlay, restores overflow/scroll/focus, removes every
  listener, and is idempotent. `destroy()` closes and permanently disables the
  instance (`open()` then returns `false`). Invalid SVG, bad dimensions, or a
  missing body fail closed without touching the page.
- Labels come from `locale` (`zh`/`en`, default `navigator.language`);
  `prefers-reduced-motion` is handled by the stylesheet, not JS.
- jsdom has no layout engine; `measureStage(stage)` is the documented test seam
  returning the available inner box.

### [`src/client/index.js`](../src/client/index.js)

- `export const inject = ['theme']` — static array, exactly the services used.
- `apply(ctx)` installs one `MutationObserver` on `document.body`
  (`childList`, `subtree`, `characterData`), debounces `scan()` (~150 ms,
  native `setTimeout`; no extra service), installs styles, and does an initial
  scan. One additional 1,000 ms timer scans for props-only updates that change
  neither generic banner nor source DOM. It is cancelled on disposal; browser
  throttling can delay this check.
- `ctx.on('theme/change', snapshot)` compares **only font inputs**
  (`snapshot.fontSizes` + `snapshot.fontFamilies`, JSON-serialized) with the
  last observed values. Colors/scheme changes are ignored by design (CSS
  handles them). Font changes request `manager.refreshAll()`, debounced. The
  shared scan/refresh timer can lose a refresh during mutation bursts; this is
  tracked as a remaining limitation.
- All resources are released through `ctx.effect()`: observer disconnected,
  timers cleared, manager destroyed (which closes/destroys the viewer), styles
  removed, theme listener disposed. Disabling the plugin row only takes effect
  on the next page load (boot graph), but unloading the fiber must still restore
  the page.
- If `document.body` is unavailable at apply time, wait for
  `DOMContentLoaded` (real boot scripts can run before body children exist).
- No `require()` of any DSH client package; Pele is bundled.

## Installed-host bindings and version sensitivity (P2)

`npm run verify:host` executes the **installed** CodeBlock function under pinned
React. Its free identifiers are minified names baked into one frontend build, so
the binding layer is versioned in `tests/helpers/react-code-block.mjs`:

- `SUPPORTED_HOST_VERSIONS` currently lists `0.2.1-rc.2` (retained, audited map)
  and `0.2.2-rc.3` (added for the installed host).
- `resolveInstalledBindings({ version, jsxRuntime, onCopy, assetSha256 })` returns
  the binding map and the extraction boundary matcher for that version.
- An unknown version throws `UnsupportedHostError` (name
  `UnsupportedHostError`, code `unsupported-host`, fields `version` and
  `assetSha256`) whose message names the supported versions and tells the
  maintainer to update the map in `tests/helpers/react-code-block.mjs` (see this
  file). `scripts/verify-host.mjs` prints that diagnostic and exits with code 1
  instead of surfacing a raw `ReferenceError`; a known-version extraction that
  references an undeclared identifier raises `StaleBindingMapError`.
- The probe records the installed frontend version and asset SHA-256, the
  extracted component SHA-256, React version, and six checks. Scope: installed
  CodeBlock function with fixture adapters for styling/toolbar/visibility/
  tokenization; **not** a live DSH session. The `0.2.1-rc.2` map is unit-tested
  but no longer render-verified because that host bundle is not installed.
- `DG4` is accepted on this basis; it never implies host compatibility on its
  own.

## Lazy-runtime decision (P6): no-go for 0.2.0

The decision gate proposed splitting Pele out of the client bundle only if
measurements justified the added host route. **Decision: keep Pele bundled
inline; do not split in 0.2.0.** Recorded in
[`evidence/2026-11-17/p6-measurement.json`](evidence/2026-11-17/p6-measurement.json):

- Final inline bundle: 739,526 raw, 276,084 `gzip -9`, 223,848 brotli bytes;
  the whole-inline budget (750,000 raw) is met with 10,474 bytes headroom.
- Local plain-HTTP route (no `Content-Encoding`, `cache-control: no-cache`):
  bundle request+eval completes by ~34 ms cold / ~24 ms warm after navigation;
  first diagram ready ~395 ms cold / ~370 ms warm, dominated by the fixed
  150 ms scan debounce + 180 ms settle window, not by bundle size.
- Installed DSH route `Content-Encoding`/`encodedBodySize`/cache metrics were not
  measurable in this iteration, and no split prototype was built to measure the
  first-diagram regression. With one metric required on both sides, the roadmap
  adopt rule cannot be satisfied; the default no stands.

If revisited: measure `PerformanceResourceTiming` + cache/encoding on the
authenticated installed `/plugins` route, build a split prototype, and compare
cold-start time and first-diagram regression on the same metric before adding a
`webServer` route, cache-busting `?v=<hash>` + `immutable` caching, and a
failure fallback.

## Build contract (`scripts/build-client.mjs`)

- esbuild, `bundle: true`, `platform: 'browser'`, `format: 'cjs'`,
  `target: ['chrome110', 'safari16']`, `minify: true`, `write: false`,
  `legalComments: 'none'`, no externals, no CDN references.
- Wrap exactly as the DSH client Loader expects:

  ```js
  window.__ModuleLoader__.load({
    id: "dsh-pele-mermaid",
    factory: (require) => {
      var module = { exports: {} };
      var exports = module.exports;
      // …esbuild CJS output…
      return module.exports;
    }
  });
  ```

- Write `lib/client.js`; fail loudly if the package name, wrapper id, or
  `exports["./client"]` target disagree.
- Optional `--check` mode: build to memory and require byte equality with
  `lib/client.js`. Both modes check the wrapper/id and a fixed list of CDN
  markers; these checks are not a general network-policy audit.
- Report the byte size. `0.2.0` ships 739,526 bytes with Pele 1.9.0 plus export
  and viewer; the whole-inline-bundle raw budget is 750,000 bytes.

## Testing contract

- `node --test "tests/*.test.mjs"`, Node ≥ 20, jsdom for DOM tests.
- Unit tests import `src/client/*.js` directly (ESM). `0.2.0` totals **123
  tests, 123 pass, 0 fail, 0 cancelled, 0 skipped, 0 todo**: engine, theme CSS,
  block manager (45), export (9), viewer (13), installed-host bindings (6), real
  React 18.3.1 lifecycle, and built-bundle smoke (7).
- jsdom fixture blocks must match the DOM contract above (the primitives source
  is the reference). Export tests use a hostile SVG fixture to assert
  sanitization, natural sizing, theme variables, filename shape, and download
  dispatch/revocation, plus the background rectangle and both theme modes
  (`resolved` dark/light fills and `inherit` token expressions) with luminance
  checks. Block-manager tests cover resolved-vs-inherit routing and a real
  export-builder integration. Viewer tests inject a stage box through
  `measureStage` and cover structure, zoom/pan/fit, keyboard/focus/scroll,
  backdrop close, reuse, and teardown.
- `tests/bundle.test.mjs` evaluates the built bundle in a jsdom + vm sandbox:
  fake `window.__ModuleLoader__`, assert `factory(require)` never calls
  `require`, returns `{ inject: ['theme'], apply }`, that `apply` mounts
  diagrams with the four-button toolbar, and that teardown restores the page.
- Real React 18.3.1 tests cover source-only updates, props-only language changes,
  three pre shapes, Copy parity, replacement/unmount, alternate branches and
  suspended updates. Static Fiber fixtures only exercise language recognition.
- `scripts/verify-host.mjs` separately executes the installed CodeBlock body
  with versioned bindings and pinned React; it does not run a live DSH chat.
- `scripts/verify-visual.mjs` drives the real built bundle in isolated headless
  Chrome against the fixture: P1 layout facts (CJK wrapping, class-group rows
  in wide/narrow columns, generic/rich labels), four-control toolbar, viewer,
  theme/font behavior, narrow 720×2200 capture, and teardown. It also captures
  the real downloaded SVG bytes in light and dark themes, asserts the background
  rectangle equals the resolved `--pele-bg` (with luminance checks), renders
  the dark download on a white stand-in page, and switches theme with the viewer
  open to assert the diagram and dialog repaint; ten screenshots are recorded.
  Restricted sandboxes must set `DSH_VISUAL_CHROME_NO_SANDBOX=1` to add
  Chrome's `--no-sandbox --disable-setuid-sandbox`; default runs keep the
  sandbox.
- No network in any test.

## Non-goals

- No settings UI, no per-user config, no locale service, no side-bar panel.
- No modification of Markdown/session data — the source artifact is rendered
  DOM only.
- No second Mermaid engine; if another Mermaid renderer plugin is active, only
  one should be enabled (documented).
- No lazy runtime in 0.2.0 (P6 no-go above); no host route, no cache layer.
- No automatic diagram image loading, no author options, no source heuristics.

## Remaining limitations

See [KNOWN-LIMITATIONS.md](KNOWN-LIMITATIONS.md) for private-Fiber compatibility,
host-probe version sensitivity, scan cost, timer scheduling, font size,
export/viewer scope, the missing live `0.2.2` verification (P0), the P6 no-go,
and the scope of external-resource tests.
