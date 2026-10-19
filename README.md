# dsh-pele-mermaid

Render Mermaid diagrams in the DeepSeek Harness (DSH) Web chat with
[Pele](https://pele.run) — a synchronous, dependency-free Mermaid renderer.

> **Decoupling guarantee.** This is a standard DSH **bundle plugin** in its own
> package. It never patches, forks, or imports DSH source, and it loads nothing
> from the network. When the plugin row is disabled or absent, DSH is exactly
> the shipped product: no boot-graph entry, no stylesheet, no observer, no DOM
> changes. When active, settled ` ```mermaid ` code fences become interactive
> Pele diagrams.

## Why Pele

- **Synchronous, zero runtime dependencies** — bundled into one browser script,
  no CDN, no async engine, no `mermaid` global. Works fully offline.
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
dsh plugin --profile web add ./dsh-pele-mermaid-0.1.0.tgz
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
  (case-insensitive). While a reply streams, the fence is left alone until its
  source stops changing, so partial diagrams and transient parse errors never
  flash.
- Each diagram keeps a small toolbar: **Diagram / Source** toggle. The DSH code
  block banner and its Copy button keep working; the original source `<pre>` is
  kept as the source of truth and restored when the diagram is toggled to
  source.
- If Pele cannot draw a diagram (syntax/limit), the original code block stays
  visible and a short plain-text note shows the error. An edit to the source
  retries automatically.
- Everything else (non-Mermaid fences, inline code, links, images) is
  untouched.

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

Theme/scheme changes are pure CSS and never re-render a diagram. The only
rebuild trigger is a **font-family or font-size** change from Appearance
settings, because Pele measures label text at render time. Peer plugins that
change colors by overriding tokens work too. To tune diagram colors, override
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
- No telemetry, no network access from the plugin.

## Compatibility

- Verified against DSH `0.2.1-rc.2` Web/Desktop (`dsh-client-ui-primitives`
  `0.2.1-rc.2`). The plugin only depends on the public `theme` Cordis service
  and the rendered Markdown DOM contract; it never imports a DSH client package.
- Pele `1.6.0` is bundled (MIT). Mermaid syntax support follows Pele: every
  diagram type built into Mermaid 12.1.0.
- Do not enable another Mermaid-fence renderer at the same time; two plugins
  post-processing the same code blocks will fight over the DOM.

## Verified

`docs/VERIFICATION.md` records the full evidence; the measured highlights:

- **67 automated tests** (`npm test`): engine, theme CSS, block manager, and a
  6-case jsdom end-to-end smoke of the real built bundle; `npm run verify`
  also fails on a stale `lib/client.js`.
- **Real DSH install** (`scripts/verify-install.mjs`, isolated `DSH_HOME`): the
  boot graph contains
  `{"id":"dsh-pele-mermaid","url":"plugins/??dsh-pele-mermaid/client.js&rev=…","inject":["@deepseek-ai/dsh-client-ui-theme"]}`,
  and that route serves the committed bundle.
- **"Off ⇒ exactly normal"**: with the row disabled, the boot graph has zero
  plugin entries, the index HTML has zero occurrences, and the old bundle route
  returns 404; the disabled graph is structurally identical to a freshly
  uninstalled profile.
- **Real browser** (Chrome headless fixture, screenshots in
  `tests/fixtures/screenshots/`): flowchart, sequence, pie, and gantt render;
  light↔dark flips the mapped Pele tokens with **zero re-renders**, a font
  change re-renders, source toggling round-trips the same `<pre>` node, and
  teardown restores the thread DOM byte-identically.

## Develop

```sh
npm install
npm run build      # build lib/client.js (esbuild; Pele bundled)
npm test           # node:test unit tests (engine, theme CSS, block manager)
npm run verify     # build --check + bundle smoke test
```

`docs/ARCH.md` documents the module contracts, the Markdown DOM shape, the
build wrapper, and the disable/cleanup guarantees. `docs/VERIFICATION.md`
records the real-profile install and boot-graph evidence.

## License

MIT. Pele is MIT licensed; see its repository for details.
