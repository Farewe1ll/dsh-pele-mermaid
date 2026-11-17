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

Current release candidate: **0.2.0**. See the [verification record](https://github.com/Farewe1ll/dsh-pele-mermaid/blob/main/docs/VERIFICATION.md) for the current bundle identity and checks.

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

DSH plugins are installed per profile. Version `0.2.0` is prepared for npm;
registry publication is a separate release step. Until it is published, install
the locally packed tarball or a source checkout.

```sh
# From this checkout: verifies the release and writes the .tgz
npm ci
npm pack

# Web profile (initialized from the shipped template on first use)
dsh plugin --profile web add ./dsh-pele-mermaid-0.2.0.tgz

# Desktop: use the dsh CLI installed by the Desktop app, then restart the app
dsh plugin --profile desktop add ./dsh-pele-mermaid-0.2.0.tgz
```

After npm publication, install the pinned version by package name:

```sh
dsh plugin --profile web add dsh-pele-mermaid@0.2.0
dsh plugin --profile desktop add dsh-pele-mermaid@0.2.0
```

A checkout also works: `dsh plugin --profile web add /path/to/dsh-pele-mermaid`.
The standalone `@deepseek-ai/dsh` CLI can manage the web profile; the Desktop
profile requires the app's bundled CLI.

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
  zoom out / zoom in / fit / close controls. Its SVG viewport fills the stage
  content area: fit centers the complete diagram, while zoom uses the whole
  viewport without stretching the diagram. Smaller axes stay centered; larger
  axes can pan to their bounds. Resize preserves relative-to-fit zoom and the
  diagram-space center where bounds allow. Plain wheel is ignored. Ctrl/Cmd + wheel zooms at the
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
[known limitations](https://github.com/Farewe1ll/dsh-pele-mermaid/blob/main/docs/KNOWN-LIMITATIONS.md). Peer plugins that change colors
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

- **Tested integration:** DSH `0.2.2-rc.3` installed CodeBlock component
  probe and isolated web-profile tarball installation, route serving,
  disable/uninstall checks. React lifecycle tests use `18.3.1`. Results and
  exact scope are in the [verification record](https://github.com/Farewe1ll/dsh-pele-mermaid/blob/main/docs/VERIFICATION.md).
- In addition to the public `theme` service and Markdown DOM, generic banners
  depend on private React Fiber fields. These are version-sensitive; unknown or
  unreadable languages stay native. The host probe resolves minified bindings by
  installed frontend version and fails with an actionable error on an unknown
  version; re-run it before claiming support for a new host.
- Pure props changes are checked approximately once per second in addition to
  DOM observation; background timer throttling can delay them. See the
  [remaining limitations](https://github.com/Farewe1ll/dsh-pele-mermaid/blob/main/docs/KNOWN-LIMITATIONS.md).
- Pele `1.9.0` is bundled (MIT), pinned to the exact version. Mermaid syntax
  support follows Pele: every diagram type built into Mermaid 12.1.0.
- Do not enable another Mermaid-fence renderer at the same time; two plugins
  post-processing the same code blocks will fight over the DOM.

## Verified

The current client bundle is **739,776 bytes**, SHA-256
`1862b3d0363c068f940fe660569cdafb23e5b608200477ab61f5215ef41379cb`.

- Automated tests cover rendering, source ownership, React lifecycle, export,
  viewer controls, cleanup and release safeguards.
- `npm run verify` rebuilds in memory and checks the committed bundle, then
  runs the built-bundle smoke tests.
- `npm run verify:package` creates and unpacks a temporary tarball, verifies
  its ten-file inventory and complete third-party notices, checks its bytes
  against the checkout, and exercises the host and client entry points.
- The installed-host probe checks the real DSH `0.2.2-rc.3` CodeBlock with
  fixture adapters. Isolated profile checks cover install, the served bundle,
  disabled-route 404 and disabled/uninstalled boot-graph parity.

[Current results](https://github.com/Farewe1ll/dsh-pele-mermaid/blob/main/docs/VERIFICATION.md) and [historical measurements](https://github.com/Farewe1ll/dsh-pele-mermaid/blob/main/docs/VERIFICATION-2026-11-17-BASELINE.md)
are kept separately. See the [release checklist](https://github.com/Farewe1ll/dsh-pele-mermaid/blob/main/docs/RELEASING.md) for reproduction.

## Develop

```sh
npm ci
npm run build      # build lib/client.js (esbuild; Pele 1.9.0 bundled)
npm test           # node:test unit tests (engine, theme CSS, blocks, export, viewer)
npm run verify     # build --check + bundle smoke test
npm run verify:host # installed CodeBlock probe (macOS app required)
npm run verify:visual # isolated Chrome screenshots + matching JSON
npm run verify:release # tests + bundle check + actual package verification
```

In restricted sandboxes where Chrome's renderer sandbox cannot start, run the
visual verification with `DSH_VISUAL_CHROME_NO_SANDBOX=1` (adds only
`--no-sandbox --disable-setuid-sandbox`); normal runs keep the sandbox.

`docs/ARCH.md` documents the module contracts, the Markdown DOM shape, the
build wrapper, export/viewer internals, the host-probe version map, and the
disable/cleanup guarantees. `docs/VERIFICATION.md` records the current evidence
and reproduction steps; [CHANGELOG.md](CHANGELOG.md) lists the `0.2.0` changes.

Development uses the latest Node LTS through mise (`mise use node@lts`);
CI follows `lts/*`. Consumers receive a prebuilt bundle and need no devDependencies.
`npm pack` and directory-based `npm publish` run `verify:release` through
`prepack`. CI runs the same checks; the Desktop-specific probe is a local check.

## License

MIT. [THIRD-PARTY-NOTICES.txt](THIRD-PARTY-NOTICES.txt) contains the complete
Pele MIT and bundled Lucide icon ISC notices.
