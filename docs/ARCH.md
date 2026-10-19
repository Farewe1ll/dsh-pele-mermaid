# dsh-pele-mermaid — Architecture

Scope: current 0.1.1 working build targeting DSH `0.2.1-rc.2` / React `18.3.1`. This file is the single
source of truth for module boundaries, interfaces, DOM assumptions, and the
constraints that keep the plugin decoupled from DSH. The recorded evidence for
every acceptance claim lives in [`docs/VERIFICATION.md`](VERIFICATION.md).

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
half post-processes settled ` ```mermaid ` code blocks into Pele diagrams.

We intentionally do **not** patch, fork, require, or otherwise touch any
`@deepseek-ai/*` package at runtime. Runtime integration uses the public
Cordis service `theme` (`inject: ['theme']`), the rendered Markdown DOM, and
private React Fiber fields for generic-banner language identification. No DSH
package is imported, but framework-internal compatibility remains a dependency.

## Pele facts that drive the design

Pele is **synchronous** and has **zero runtime dependencies**.

- Bundle `pele` into our single client bundle with esbuild. No CDN, no async
  load, no `pele/lazy`, no `mermaid` global. `images: false` prevents diagram
  image embeds; user-activated links keep Pele's filtering.
- `mount(container, source, options)` renders synchronously and returns a
  handle. It re-lays out on container resize and owns zoom/pan/keyboard.
- Colors/fonts are CSS variables (`--pele-*`), and **color changes do not need a
  re-render**: theme switches are pure CSS. Source changes, host node replacement
  and *text measurement inputs* (font family / font size events) can rebuild a diagram. Appearance
  font size is not yet forwarded to Pele; see the limitations register.
- Built-in safety: escapes label text, filters links and styles, rejects
  oversized source/SVG/edge counts. We do not expose options or `config` to
  diagram authors, and we never insert icons.

## Package layout

```
dsh-pele-mermaid/
├── package.json            # dsh.bundle.patch + dsh.client (platform web)
├── cordis.patch.yml        # insert row `dsh-pele-mermaid`
├── index.js                # Host half: empty apply()
├── lib/client.js           # BUILT browser bundle (committed; `npm run build`)
├── scripts/build-client.mjs
├── src/client/
│   ├── index.js            # Cordis browser plugin: observer + theme policy
│   ├── engine.js           # Pele adapter (mount / error / refresh / destroy)
│   ├── theme-css.js        # --pele-* ← --dsw-* mapping + card CSS + installStyles
│   └── blocks.js           # code-block detection, settle, mount, toggle, cleanup
├── tests/                  # node:test + jsdom; no test runner beyond Node
└── docs/ARCH.md
```

## Browser-half contracts

### `src/client/engine.js`

```js
/**
 * @typedef {Object} DiagramHandle
 * @property {boolean} ok          // false when the source could not be drawn
 * @property {string | null} error // plain-text error message, null when ok
 * @property {() => void} refresh  // re-layout in place (fonts/width changed)
 * @property {() => void} destroy  // stop observers, clear the container
 */

/**
 * Mount one Mermaid source into `container` with Pele.
 * Synchronous; never throws for diagram errors (returns ok:false instead).
 * Options are engine-owned constants, never author-supplied.
 * @param {HTMLElement} container
 * @param {string} source
 * @returns {DiagramHandle}
 */
export function mountDiagram(container, source)

/** Pele display options used by mountDiagram (exported for tests/docs). */
export const DIAGRAM_OPTIONS
```

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
- `destroy()` must be idempotent and must call Pele's `handle.destroy()` when
  present.
- No `document`/`window` access at module import time; resolve at call time.

### `src/client/theme-css.js`

```js
/** Install/reuse the plugin stylesheet for exactly one owner. */
export function installStyles(doc = document): () => void

/** Build the stylesheet text (pure; used by tests and installStyles). */
export function buildStyles(): string

/** Attribute marking our installed <style> element (single owner, reused). */
export const STYLE_ATTR

/** Class names used by blocks.js / index.js. */
export const CLASS = {
  diagram: 'dsh-pele-mermaid-diagram',
  toolbar: 'dsh-pele-mermaid-toolbar',
  error: 'dsh-pele-mermaid-error',
  source: 'dsh-pele-mermaid-source',
  active: 'dsh-pele-mermaid-active',
}
```

Rules:

- Styles only use existing DSH design tokens (`--dsw-*`, `--ds-font-family-code`
  when present) plus values we define ourselves. **No hardcoded palette
  colors.** The one exception: inline SVG icons use `currentColor`.
- The mapping block sets `--pele-*` on our diagram container:
  `--pele-bg`, `--pele-fg`, `--pele-muted`, `--pele-line`, `--pele-surface`,
  `--pele-surface-alt`, `--pele-border`, `--pele-accent`, `--pele-critical`,
  `--pele-error`, `--pele-font`, `--pele-font-mono`, `--pele-radius`.
  Series colors stay Pele's defaults (documented; they are theme-neutral).
- Theme switching is **CSS only**. Do not listen to dark-mode DOM attributes
  here; the tokens flip under us.
- `installStyles` is idempotent per document: remove a previous element with
  `STYLE_ATTR` before adding, return an idempotent disposer that only removes
  the element it installed.
- Class names are prefixed `dsh-pele-mermaid-`; never reuse DSH's hashed
  markdown classes for our own styling.

### `src/client/blocks.js`

```js
export const MERMAID_LANG = 'mermaid'

/** Read committed React language, falling back to the banner when unavailable. */
export function readFenceLanguage(block): string | null

/** Read committed React code, falling back to host pre text, or null. */
export function readFenceSource(block): string | null

/**
 * Create one page's block manager.
 * @param {Object} options
 * @param {Document} options.document
 * @param {(container: HTMLElement, source: string) => import('./engine.js').DiagramHandle} [options.mountDiagram]
 * @param {(fn: () => void, ms: number) => void} [options.schedule] // settle timer, test seam
 * @param {() => number} [options.now]                              // test seam
 * @param {number} [options.settleMs]                               // default 180
 * @param {string} [options.locale]                                 // 'zh' | 'en'
 * @param {string} [options.errorPrefix]                            // default 'Pele: '
 */
export function createBlockManager(options)

// manager surface:
//   scan(): void          // sync pass; renders blocks whose source Settled
//   refreshAll(): void    // rebuild mounted diagrams (font metrics changed)
//   destroy(): void       // remove plugin additions, preserve latest host state
//   get count(): number   // mounted diagram count (diagnostics/tests)
```

Behavior:

1. `scan()` walks `document.querySelectorAll('.md-code-block')`.
2. A candidate must have a banner, a host-owned `<pre>`,
   `readFenceLanguage(block) === 'mermaid'`, and non-blank source. Unknown
   language is never inferred from source text.
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
5. **DOM shape** (shipped DSH `0.2.1-rc.2` CodeBlock; earlier live observation
   is historical evidence, not a fresh end-to-end check of this build):
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
   those props are unavailable does it read a non-generic banner language (`代码块` / `Code` means unknown). A generic or
   missing language is left as a native code block, even when its source happens
   to look like Mermaid. This avoids rendering arbitrary unlabeled code and
   removes the failed-candidate cache. Root membership is checked through
   parent child-lists and alternates against `root.current` (up to 512 root
   ancestors); the CodeBlock search itself is bounded to 40 ancestors.
   Committed props remain authoritative even when their language is empty.
   With no usable props, source comes from the original `<pre>`.

   Banner-less `.md-code-block` nodes (other UI surfaces) are never treated as
   fences, even when their text happens to look like Mermaid.
6. Error handling: when `mountDiagram` returns `ok:false`, keep the source
   `<pre>` visible exactly as DSH rendered it and append a small
   `.dsh-pele-mermaid-error` note whose text is assigned via `textContent`
   (`errorPrefix + message`). The record stays so a later source edit retries.
7. Re-render policy: source changed → destroy old diagram and re-settle.
   Same source with healthy nodes → do nothing. Host node replacement can
   rebuild unchanged source; `refreshAll()` also rebuilds for font-input events.
   Theme color changes do not request rebuilds.
8. `destroy()` removes only plugin containers, toolbars, error notes and the
   temporary source marker, unmounts every Pele handle, and is idempotent. It
   does not restore an old snapshot or move a host node. If React changed the
   source or replaced a subtree during plugin lifetime, the latest host DOM is
   preserved.
9. React re-render self-healing: if a later React pass replaces our wrapper
   (source changed or node recreated), the next `scan()` re-applies. We never
   throw into React: all DOM work is wrapped defensively.
10. Accessibility: toolbar is a `role="group"` with two `button`s using
    `aria-pressed`; labels come from `locale` (`zh`: 图表/源码, `en`:
    Diagram/Source). Focus style uses `--dsw-alias-border-l2`.

### `src/client/index.js`

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
  timers cleared, manager destroyed (preserving current host DOM), styles removed, theme
  listener disposed. Disabling the plugin row only takes effect on the next
  page load (boot graph), but unloading the fiber must still restore the page.
- If `document.body` is unavailable at apply time, wait for
  `DOMContentLoaded` (real boot scripts can run before body children exist).
- No `require()` of any DSH client package; Pele is bundled.

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
- Report the byte size. A ~700 KB bundle is expected (Pele 1.6.0 main entry).

## Testing contract

- `node --test "tests/*.test.mjs"`, Node ≥ 20, jsdom for DOM tests.
- Unit tests import `src/client/*.js` directly (ESM).
- jsdom fixture blocks must match the DOM contract above (the primitives source
  is the reference).
- `tests/bundle.test.mjs` evaluates the built bundle in a jsdom + vm sandbox:
  fake `window.__ModuleLoader__`, assert `factory(require)` never calls
  `require`, returns `{ inject: ['theme'], apply }`, and that `apply` mounts a
  diagram into a fixture.
- Real React 18.3.1 tests cover source-only updates, props-only language changes,
  three pre shapes, Copy parity, replacement/unmount, alternate branches and
  suspended updates. Static Fiber fixtures only exercise language recognition.
- `scripts/verify-host.mjs` separately executes the installed CodeBlock body
  with fixture helpers and pinned React; it does not run a live DSH chat.
- No network in any test.

## Non-goals

- No settings UI, no per-user config, no locale service, no side-bar panel.
- No modification of Markdown/session data — the source artifact is rendered
  DOM only.
- No second Mermaid engine; if another Mermaid renderer plugin is active, only
  one should be enabled (documented).

## Remaining limitations

See [KNOWN-LIMITATIONS.md](KNOWN-LIMITATIONS.md) for private-Fiber compatibility,
scan cost, timer scheduling, font size and the scope of external-resource tests.
