# dsh-pele-mermaid

Render Mermaid diagrams in the DeepSeek Harness (DSH) Web chat with
[Pele](https://pele.run) — a synchronous, dependency-free Mermaid renderer.

> **Decoupling guarantee.** This is a standard DSH **bundle plugin** in its own
> package. It never patches, forks, or imports DSH source at runtime. The
> renderer is bundled and diagram image loading is disabled. When the plugin row is disabled or absent, DSH is exactly
> the shipped product: no boot-graph entry, no stylesheet, no observer, no DOM
> changes. When active, settled ` ```mermaid ` code fences become interactive
> Pele diagrams.

## Why Pele

- **Synchronous, zero runtime dependencies** — bundled into one browser script,
  no CDN, no async engine, no `mermaid` global. Pele image resources are
  disabled, so the bundle performs no automatic image fetches.
- **CSS-variable theming** — diagrams take `--pele-*` variables that this plugin
  maps to DSH `--dsw-*` tokens. Light/dark or theme switches change colors
  through CSS only; **diagrams are not re-rendered** for color changes.
- **Interactive** — zoom, pan, and keyboard controls (Pele `mount()`, zoom
  enabled), which helps with wide diagrams in the chat's narrow column.
- **Safe with untrusted diagrams** — Pele escapes text, filters links/styles,
  and enforces source/SVG/edge limits. Diagram authors cannot pass options or
  supply icons.

## Install

DSH plugins are installed per profile. From this checkout:

```sh
# Web profile (auto-initialized from the shipped template on first use)
dsh plugin --profile web add /path/to/dsh-pele-mermaid

# Desktop profile: use the Desktop-installed dsh command (the app's runtime),
# then restart the app so the Host rescans the loader rows.
dsh plugin --profile desktop add /path/to/dsh-pele-mermaid
```

A packaged tarball or npm/git source works the same way:

```sh
dsh plugin --profile web add ./dsh-pele-mermaid-0.1.1.tgz
dsh plugin --profile web add dsh-pele-mermaid
```

The bundle layer inserts one Loader row (`id: dsh-pele-mermaid`) and the
package's `dsh.client` declaration makes DSH serve the browser half at
`/plugins/dsh-pele-mermaid/client.js`. Restart the profile (or the Desktop app)
after installing, uninstalling, or toggling the row: the client boot graph is
composed at Host start.

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

- Only **settled** fenced code blocks whose info string is `mermaid`
  (case-insensitive). A 180 ms stable-source window reduces partial renders
  during streaming; a longer pause can still expose an incomplete diagram.
- Each diagram keeps a small toolbar: **Diagram / Source** toggle. The DSH code
  block banner and its Copy button keep working; the original source `<pre>`
  stays in its React-owned position and is temporarily hidden in Diagram view.
- If Pele cannot draw a diagram (syntax/limit), the original code block stays
  visible and a short plain-text note shows the error. An edit to the source
  retries automatically.
- Language detection matches the real chat DOM: DSH shows a localized generic
  label (`代码块` / `Code`) instead of `mermaid` for fences Shiki cannot
  highlight, so the plugin reads the exact committed `lang`/`code` props from
  React. Committed props take precedence; only when they are unavailable does
  the plugin read a non-generic banner. Without explicit `mermaid`, the block
  stays native; source heuristics are not used.
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
no plugin code changes are needed.

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

## Compatibility

- Target: DSH `0.2.1-rc.2`, React/React DOM `18.3.1`. In addition to the public
  `theme` service and Markdown DOM, generic banners depend on private React
  Fiber fields. These are version-sensitive; unknown or unreadable languages
  stay native. Re-run the host probe before claiming support for a new host.
  The current evidence includes an isolated install and component/browser
  harnesses, not a fresh live Desktop conversation test.
- Pure props changes are checked approximately once per second in addition to
  DOM observation; background timer throttling can delay them. See the
  [remaining limitations](docs/KNOWN-LIMITATIONS.md).
- Pele `1.6.0` is bundled (MIT). Mermaid syntax support follows Pele: every
  diagram type built into Mermaid 12.1.0.
- Do not enable another Mermaid-fence renderer at the same time; two plugins
  post-processing the same code blocks will fight over the DOM.

## Verified

`docs/VERIFICATION.md` records the full evidence; the measured highlights:

- **84 automated tests** (`npm test`): engine, theme CSS, block manager, real
  React 18.3.1 lifecycle cases, and built-bundle smoke; `npm run verify` also
  fails on a stale `lib/client.js`.
- **Installed-host probe** (`npm run verify:host`): read-only extraction of the
  installed DSH CodeBlock function, with real React 18.3.1, checks committed
  Fiber props, Copy newline behavior, and plain/static/streaming `<pre>` shapes.
  Styling, toolbar and tokenization helpers are fixture adapters; this does not
  exercise the whole running DSH app.
- **Real DSH install** (`scripts/verify-install.mjs`, isolated `DSH_HOME`): the
  boot graph contains
  `{"id":"dsh-pele-mermaid","url":"plugins/??dsh-pele-mermaid/client.js&rev=…","inject":["@deepseek-ai/dsh-client-ui-theme"]}`,
  and that route serves the verified working-tree bundle.
- **"Off ⇒ exactly normal"**: with the row disabled, the boot graph has zero
  plugin entries, the index HTML has zero occurrences, and the old bundle route
  returns 404; the disabled graph is structurally identical to a freshly
  uninstalled profile.
- **Real browser** (Chrome headless fixture, screenshots in
  `tests/fixtures/screenshots/`): flowchart, sequence, pie, and gantt render;
  light↔dark flips the mapped Pele tokens with **zero re-renders**, a font
  change re-renders, source toggling keeps the same host-owned `<pre>` node,
  and teardown removes only plugin additions.

## Develop

```sh
npm install
npm run build      # build lib/client.js (esbuild; Pele bundled)
npm test           # node:test unit tests (engine, theme CSS, block manager)
npm run verify     # build --check + bundle smoke test
npm run verify:host # installed CodeBlock probe (macOS app required)
npm run verify:visual # isolated Chrome screenshots + matching JSON
```

`docs/ARCH.md` documents the module contracts, the Markdown DOM shape, the
build wrapper, and the disable/cleanup guarantees. `docs/VERIFICATION.md`
records the real-profile install and boot-graph evidence.

## License

MIT. Pele is MIT licensed; see its repository for details.
