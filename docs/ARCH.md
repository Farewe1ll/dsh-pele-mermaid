# dsh-pele-mermaid — Architecture

Status: implemented and verified (DSH `0.2.1-rc.2`). This file is the single
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
`@deepseek-ai/*` package at runtime. The only shared contract is the public
Cordis service `theme` (`inject: ['theme']`) and the rendered Markdown DOM.

## Pele facts that drive the design

Pele is **synchronous** and has **zero runtime dependencies**.

- Bundle `pele` into our single client bundle with esbuild. No CDN, no async
  load, no `pele/lazy`, no `mermaid` global, no network at runtime.
- `mount(container, source, options)` renders synchronously and returns a
  handle. It re-lays out on container resize and owns zoom/pan/keyboard.
- Colors/fonts are CSS variables (`--pele-*`), and **color changes do not need a
  re-render**: theme switches are pure CSS. We only rebuild a diagram when the
  *text measurement inputs* change (font family / font size), which is the only
  case where labels can be laid out incorrectly.
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
│   └── blocks.js           # code-block detection, settle, replace, toggle, restore
├── tests/                  # node:test + jsdom; no test runner beyond Node
└── docs/ARCH.md
```

### Ownership map (parallel build)

| Path | Owner |
| --- | --- |
| `src/client/engine.js`, `src/client/theme-css.js`, `tests/engine.test.mjs`, `tests/theme-css.test.mjs` | engine-dev |
| `src/client/blocks.js`, `tests/blocks.test.mjs` | dom-dev |
| `src/client/index.js`, `scripts/build-client.mjs`, `package.json`, `index.js`, `cordis.patch.yml`, `lib/client.js`, README, ARCH | lead |
| `tests/bundle.test.mjs`, `tests/fixtures/**`, `scripts/verify-*.mjs`, `docs/VERIFICATION.md` | verify-dev |

Nobody edits another owner's files. Cross-module changes go through the lead.

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
  `responsive: true`, and no `icons`/`sanitize`/author-driven options.
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

/** Read the settled fence language from a CodeBlock banner, lowercased. */
export function readFenceLanguage(block): string | null

/** Read the fence source from the settled code-block content, or null. */
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
//   destroy(): void       // restore every block, unmount every diagram
//   get count(): number   // mounted diagram count (diagnostics/tests)
```

Behavior:

1. `scan()` walks `document.querySelectorAll('.md-code-block')`.
2. A candidate must have `readFenceLanguage(block) === 'mermaid'` and a
   non-blank `readFenceSource(block)`.
3. **Settle gate**: a block renders only after its source has been unchanged
   for `settleMs`. New/changed source records `{ source, since: now() }` and
   schedules another scan. This prevents half-streamed fences from flashing
   partial diagrams or syntax errors; settled message history renders on the
   first debounced pass.
4. **Source is the artifact**: the original `<pre>` is detached and kept in the
   record. A per-diagram toolbar toggles `Diagram ⇄ Source`. Copy in the
   DSH banner keeps working (CodeBlock falls back to its source prop when no
   `<pre>` is present).
5. **DOM shape** (from `@deepseek-ai/dsh-client-ui-primitives` `CodeBlock`):
   ```html
   <div class="md-code-block ...">
     <div class="...">
       <div class="..." data-code-block-banner>
         <div class="...infostring">mermaid</div>
         <div class="...action"><button>Copy</button></div>
       </div>
     </div>
     <div class="..." data-code-block-content>
       <pre class="..."><code>flowchart LR ...</code></pre>
     </div>
   </div>
   ```
   Language = banner text with `button`/`svg` removed (banner may also be the
   card toolbar shape; cloning and stripping chrome makes both read cleanly).
   We insert our wrapper **inside** `[data-code-block-content]` and keep the
   banner untouched.
6. Error handling: when `mountDiagram` returns `ok:false`, keep the source
   `<pre>` visible exactly as DSH rendered it and append a small
   `.dsh-pele-mermaid-error` note whose text is assigned via `textContent`
   (`errorPrefix + message`). The record stays so a later source edit retries.
7. Re-render policy: source changed → destroy old diagram and re-settle.
   Same source → do nothing (no re-render). `refreshAll()` is the *only* path
   that rebuilds an unchanged diagram (font measurement change). Theme color
   changes never reach this layer.
8. `destroy()` restores every block to its original DOM (original `<pre>`
   reinserted at its original position), unmounts every Pele handle, removes
   toolbars/error notes, and is idempotent. React must observe the same node
   tree as before the plugin ran.
9. React re-render self-healing: if a later React pass replaces our wrapper
   (source changed or node recreated), the next `scan()` re-applies. We never
   throw into React: all DOM work is wrapped defensively.
10. Accessibility: toolbar is a `role="group"` with two `button`s using
    `aria-pressed`; labels come from `locale` (`zh`: 图表/源码, `en`:
    Diagram/Source). Focus style uses `--dsw-alias-border-l2`.

### `src/client/index.js` (Lead)

- `export const inject = ['theme']` — static array, exactly the services used.
- `apply(ctx)` installs one `MutationObserver` on `document.body`
  (`childList`, `subtree`, `characterData`), debounces `scan()` (~150 ms,
  native `setTimeout`; no extra service), installs styles, and does an initial
  scan.
- `ctx.on('theme/change', snapshot)` compares **only font inputs**
  (`snapshot.fontSizes` + `snapshot.fontFamilies`, JSON-serialized) with the
  last observed values. Colors/scheme changes are ignored by design (CSS
  handles them). Font changes call `manager.refreshAll()` once, debounced.
- All resources are released through `ctx.effect()`: observer disconnected,
  timer cleared, manager destroyed (restoring DOM), styles removed, theme
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
- Optional `--check` mode: build to memory and verify the wrapper, the id, and
  that the output contains no `http://`/`https://` asset URLs (no CDN).
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
- No network in any test.

## Non-goals

- No settings UI, no per-user config, no locale service, no side-bar panel.
- No modification of Markdown/session data — the source artifact is rendered
  DOM only.
- No second Mermaid engine; if another Mermaid renderer plugin is active, only
  one should be enabled (documented).
