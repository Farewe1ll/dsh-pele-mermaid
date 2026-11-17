# dsh-pele-mermaid

Render Mermaid diagrams in the DeepSeek Harness (DSH) Web chat with
[Pele](https://pele.run) — a synchronous, dependency-free Mermaid renderer.

> **Decoupling guarantee.** This is a standard DSH **bundle plugin** in its own
> package. It never patches, forks, or imports DSH source at runtime. The
> renderer is bundled and diagram image loading is disabled. When the plugin row
> is disabled or absent, DSH is exactly the shipped product: no boot-graph entry,
> no stylesheet, no observer, no DOM changes. When active, settled
> `mermaid` (or explicit `mermaidjs` / `mmd`) code fences become
> interactive Pele diagrams.

## Why Pele

- **Synchronous, zero runtime dependencies** — bundled into one browser script,
  no CDN, no async engine, no `mermaid` global. Pele image resources are
  disabled, so the bundle performs no automatic image fetches.
- **CSS-variable theming** — diagrams take `--pele-*` variables that this plugin
  maps to DSH `--dsw-*` tokens. Light/dark or theme switches change colors
  through CSS only; **diagrams are not re-rendered** for color changes.
- **Label/layout fixes in Pele 1.9** — CJK labels wrap between characters
  instead of stretching the diagram, closing punctuation stays with the
  preceding line, class-diagram groups wrap in narrow columns, and
  `List<T>`/`Map<K,V>` and rich-text labels (`<sub>`, `<sup>`, `<code>`,
  `<kbd>`, `<samp>`) render.
- **Interactive** — zoom, pan, and keyboard controls (Pele `mount()`, zoom
  enabled), which helps with wide diagrams in the chat's narrow column; a
  fullscreen viewer gives the diagram the whole window.
- **Portable output** — download the whole diagram as a standalone, sanitized
  SVG that opens outside DSH with the same geometry and colors.
- **Safe with untrusted diagrams** — Pele escapes text, filters links/styles,
  and enforces source/SVG/edge limits. Diagram authors cannot pass options or
  supply icons.

## Install

DSH plugins are installed per profile. This release is the `0.2.0` working
build; install it from this checkout (the GitHub Release tarball is part of the
pending release steps).

```sh
# Web profile (auto-initialized from the shipped template on first use)
dsh plugin --profile web add /path/to/dsh-pele-mermaid

# Desktop profile: use the dsh command installed by the Desktop app (the app's
# runtime). A standalone @deepseek-ai/dsh CLI cannot manage the desktop profile
# (it can still manage the web profile).
dsh plugin --profile desktop add /path/to/dsh-pele-mermaid
```

A packaged tarball or git source works the same way:

```sh
dsh plugin --profile web add ./dsh-pele-mermaid-0.2.0.tgz
dsh plugin --profile web add dsh-pele-mermaid
```

Restart the profile (or the Desktop app) after installing, uninstalling, or
toggling the row: the client boot graph is composed at Host start, and a plain
page refresh does not re-read a changed loader row.

### If the CLI refuses to manage the profile

- **Profile reports "uninitialized"**: open the Desktop app once so it creates
  the profile, fully quit it, then retry the command. Do not use this recipe for
  a lock error.
- **Profile reports "lock"**: close the app or process holding the profile, then
  retry. Do not run the uninitialized-profile recipe for a lock.
- Otherwise: install, then restart the app or refresh the profile's page.

The bundle layer inserts one Loader row (`id: dsh-pele-mermaid`) and the
package's `dsh.client` declaration makes DSH serve the browser half at
`/plugins/dsh-pele-mermaid/client.js`.

### Turn it off / remove it

```yaml
# In the profile's cordis.patch.yml — keep the package, disable the row:
- id: dsh-pele-mermaid
  name: dsh-pele-mermaid
  disabled: true
```

Or remove it entirely:

```sh
dsh plugin --profile web remove dsh-pele-mermaid
```

Either way DSH returns to its unmodified behavior. No data, session content, or
Markdown source is ever rewritten by this plugin.

## What it renders

Explicit fence languages (case-insensitive, first token only):

| Fence info string | Behavior |
| --- | --- |
| `mermaid` | Rendered with Pele (toolbar, export, viewer) |
| `mermaidjs` | Rendered with Pele — explicit alias |
| `mmd` | Rendered with Pele — explicit alias |
| Anything else | Left exactly as the host rendered it |

- Only **settled** fenced code blocks with one of the explicit languages above.
  A 180 ms stable-source window reduces partial renders during streaming; a
  longer pause can still expose an incomplete diagram. There is no source-text
  guessing and no `language-*` class sniffing; near-miss names such as `mmdx`,
  `mermaid.js`, `mermaid-js`, or `mermaidjsx` stay native.
- Each diagram keeps a small toolbar: **Diagram / Source** toggle plus two
  localized icon controls, **Download SVG** and **Fullscreen**. The DSH code
  block banner and its Copy button keep working; the original source `<pre>`
  stays in its React-owned position and is temporarily hidden in Diagram view.
- **Download SVG** saves `pele-<type>-YYYYMMDD-HHmmss.svg` built from Pele's
  pristine render result: the whole diagram at natural size (an inline zoom/pan
  can never crop the file) with the resolved `--pele-*` theme variables written
  onto the root. A background rectangle covering the full natural canvas is
  inserted first, filled with the resolved `--pele-bg`, so a dark-theme export
  is readable on a white standalone page instead of being light text on a
  transparent background; the file keeps the colors it was saved with. The
  clone is sanitized: scripts, event handlers,
  `foreignObject`, frames, embedded objects, media/image elements, `src`, and
  unsafe style/`url()` values are removed; `https`/`mailto`/`tel`/`#` links are
  kept. The button is disabled until a diagram renders.
- **Fullscreen** opens a reusable overlay dialog at the inline zoom factor with
  zoom out / zoom in / fit / close controls. Ctrl/Cmd + wheel zooms at the
  pointer; dragging pans within the diagram bounds; Escape closes; Tab focus is
  trapped and returns to the trigger; background scrolling is locked and the
  previous scroll position restored; `prefers-reduced-motion` is respected. The
  viewer reuses the sanitized SVG and never re-renders Pele. It keeps
  `var(--dsw-*)` token expressions instead of frozen colors, so an open viewer
  repaints its diagram background and dialog chrome when the host theme switches.
- If Pele cannot draw a diagram (syntax/limit), the original code block stays
  visible and a short plain-text note shows the error. An edit to the source
  retries automatically; export and viewer stay disabled for that block.
- Language detection matches the real chat DOM: DSH shows a localized generic
  label (`代码块` / `Code`) instead of `mermaid` for fences Shiki cannot
  highlight, so the plugin reads the exact committed `lang`/`code` props from
  React. Committed props take precedence; only when they are unavailable does
  the plugin read a non-generic banner. Without an explicit aliased language the
  block stays native.
- Non-Mermaid fences and inline code stay untouched. Pele filters user-activated
  links, while diagram image resources are disabled (`images: false`).

## Theming

The plugin stylesheet defines Pele's variables on each diagram container from
DSH design tokens, for example:

| Pele variable | DSH token |
| --- | --- |
| `--pele-bg` | `--dsw-alias-markdown-code-block` |
| `--pele-fg` | `--dsw-alias-label-primary` |
| `--pele-line` | `--dsw-alias-label-secondary` |
| `--pele-border` | `--dsw-alias-border-l2` |
| `--pele-accent` | `--dsw-alias-brand-primary` |
| `--pele-error` | `--dsw-alias-state-error-primary` |
| `--pele-font` / `--pele-font-mono` | `--dsw-font-family` / `--dsh` code font stack |
| `--pele-radius` | `--dsw-radius-md` |

Theme/scheme changes are pure CSS. Source changes, host node replacement and
font-input changes can rebuild diagrams. Appearance font size is not yet passed
to Pele: a font-size event can request a rebuild without changing Pele's default
16 px size. Scan/refresh scheduling also has a known race; see
[known limitations](docs/KNOWN-LIMITATIONS.md). Peer plugins that change colors
by overriding tokens work too. To tune diagram colors, override
the `--pele-*` variables on `.dsh-pele-mermaid-diagram` in your own stylesheet;
no plugin code changes are needed. The exported SVG captures the resolved
variables at download time, so it keeps the current theme but does not follow
later theme switches; the fullscreen viewer is the opposite — it keeps token
expressions and follows live theme changes while open.

## Security

- Diagram source is untrusted assistant output. Pele escapes text and filters
  links and styles; `javascript:`, `data:`, and `vbscript:` URLs are always
  blocked; default link schemes are `http`, `https`, `mailto`, `tel`.
- This plugin passes no author-controlled options, no icons, and no HTML; error
  text is rendered with `textContent`.
- Limits are Pele's defaults: 50,000 source characters, 4,000,000 SVG
  characters, 5,000 edges. Oversized diagrams fall back to source.
- No telemetry or external renderer downloads. `images: false` blocks diagram
  image resources, including relative paths. Filtered `<a href>` links require
  user activation. The browser fixture observes requests for its sample inputs;
  this is not an exhaustive proof for every future renderer feature.
- Exported SVG files are sanitized with a conservative allow-list and contain no
  remote assets by construction. They do keep `https`/`mailto`/`tel` links, so
  an exported file can navigate when a reader clicks a link.

## Compatibility

- **Verified target:** DSH `0.2.1-rc.2`, React/React DOM `18.3.1` (the
  `0.1.1` / `0.2.1-rc.2` row). The installed-host component probe was also run
  against DSH `0.2.2-rc.3` and passes, but that is a fixture-adapter probe of the
  installed CodeBlock, not a live chat session. **DSH `0.2.2` is pending
  verification**: do not assume it works end to end, and no `0.2.2` row is
  claimed yet. The installed Desktop profile still runs plugin `0.1.1` and was
  not replaced in the `0.2.0` iteration.
- In addition to the public `theme` service and Markdown DOM, generic banners
  depend on private React Fiber fields. These are version-sensitive; unknown or
  unreadable languages stay native. The host probe resolves minified bindings by
  installed frontend version and fails with an actionable error on an unknown
  version; re-run it before claiming support for a new host.
- Pure props changes are checked approximately once per second in addition to
  DOM observation; background timer throttling can delay them. See the
  [remaining limitations](docs/KNOWN-LIMITATIONS.md).
- Pele `1.9.0` is bundled (MIT), pinned to the exact version. Mermaid syntax
  support follows Pele: every diagram type built into Mermaid 12.1.0.
- Do not enable another Mermaid-fence renderer at the same time; two plugins
  post-processing the same code blocks will fight over the DOM.

## Verified

`docs/VERIFICATION.md` records the full evidence; the measured highlights for
`0.2.0` (`lib/client.js` 739,526 bytes, SHA-256
`906b1cc2f77c99a41e8453d85bd1554e60ff36b7a9d12558b3e998a56f1ea4af`):

- **123 automated tests** (`npm test`): 123 pass, 0 fail, 0 skipped — engine,
  theme CSS, block manager, export, viewer, installed-host bindings, real React
  18.3.1 lifecycle cases, and built-bundle smoke. `npm run verify` also fails on
  a stale `lib/client.js`.
- **Installed-host probe** (`npm run verify:host`): PASS on DSH `0.2.2-rc.3`
  (frontend asset `index-Ciz7DZxv.js`, 1,093,870 bytes, SHA-256
  `65411dab…92d308b`) with six checks: committed props, mermaid-only mount,
  unmount removing props, card banner + host Copy, and plain/static/streaming
  source shapes with Copy parity. Styling, toolbar and tokenization helpers are
  fixture adapters; this does not exercise the whole running DSH app.
- **Real-browser fixture** (`DSH_VISUAL_CHROME_NO_SANDBOX=1 npm run verify:visual`,
  headless Chrome 157.0.8103.79): eight diagrams (including the Pele 1.9 CJK,
  class-group, generic-label and rich-label cases), a four-control toolbar,
  light↔dark flips with **zero re-renders**, source toggling that keeps the same
  host-owned `<pre>`, the fullscreen viewer (open/zoom/fit/Escape/focus),
  a 720×2200 narrow-column capture, ten recorded screenshots, and teardown that
  removes only plugin additions. The browser run also captures the real
  downloaded SVG bytes in light and dark themes (background rectangle equals the
  resolved `--pele-bg`: `#f9fafb` / `#1b1b1c`), renders the dark download on a
  white stand-in page, and switches theme while the viewer is open to confirm
  the diagram and dialog repaint.
- **P6 decision: NO-GO for lazy loading in `0.2.0`** — Pele stays bundled
  inline. Raw/gzip/brotli sizes are 739,526 / 276,084 / 223,848 bytes; the local
  route's bundle request+eval finishes by ~34 ms cold and the first diagram is
  ready in ~395 ms cold / ~370 ms warm (dominated by the 150 ms scan debounce +
  180 ms settle window). Installed-route encoding/cache metrics and a split-prototype
  first-diagram regression were not measured, so the roadmap adopt rule cannot
  be satisfied. Evidence: `docs/evidence/2026-11-17/p6-measurement.json`.
- **"Off ⇒ exactly normal"** (historical `0.1.1` install record): with the row
  disabled the boot graph has zero plugin entries, the index HTML has zero
  occurrences, and the old bundle route returns 404; the disabled graph is
  structurally identical to a freshly uninstalled profile.
- **Not verified:** a live DSH `0.2.2` conversation (P0) — a sample was posted to
  a running session but desktop screenshot consent was not granted, so no
  evidence was captured. The packaging/install path (tarball, served route,
  disable/uninstall) is verified in an isolated profile; the release step
  re-packs the final bundle and the live regression on that tarball is still
  pending.

## Develop

```sh
npm install
npm run build      # build lib/client.js (esbuild; Pele 1.9.0 bundled)
npm test           # node:test unit tests (engine, theme CSS, blocks, export, viewer)
npm run verify     # build --check + bundle smoke test
npm run verify:host # installed CodeBlock probe (macOS app required)
npm run verify:visual # isolated Chrome screenshots + matching JSON
```

In restricted sandboxes where Chrome's renderer sandbox cannot start, run the
visual verification with `DSH_VISUAL_CHROME_NO_SANDBOX=1` (adds only
`--no-sandbox --disable-setuid-sandbox`); normal runs keep the sandbox.

`docs/ARCH.md` documents the module contracts, the Markdown DOM shape, the
build wrapper, export/viewer internals, the host-probe version map, and the
disable/cleanup guarantees. `docs/VERIFICATION.md` records the current evidence
and reproduction steps; [CHANGELOG.md](CHANGELOG.md) lists the `0.2.0` changes.

## License

MIT. Pele is MIT licensed; see its repository for details.
