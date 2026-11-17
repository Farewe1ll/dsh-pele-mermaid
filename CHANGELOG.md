# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
semantic versioning. This project has not published to a registry; versions are
repository working builds unless a GitHub Release says otherwise.

## [0.2.0] — 2026-11-17

### Added

- **Standalone SVG export (P4).** A localized icon control in the diagram
  toolbar saves the diagram as `pele-<type>-YYYYMMDD-HHmmss.svg`. The file is
  built from Pele's pristine render result (never from the zoom/pan-mutated
  inline SVG), keeps the full natural width/height and `viewBox`, and writes the
  resolved `--pele-*` theme variables onto the root, so it opens outside DSH
  with the same geometry and colors. The clone is sanitized: `script`,
  `foreignObject`, `iframe`, `object`, `embed`, `image`, `audio`, `video`,
  `on*` attributes, `src`, and unsafe `style`/`url()` values are removed;
  `https`/`mailto`/`tel`/`#` links are kept. Object URLs are revoked. The control
  is disabled until a pristine render exists. New module:
  `src/client/export.js`; 7 tests in `tests/export.test.mjs`.
- **Fullscreen viewer (P5).** A localized icon control opens one reusable
  overlay dialog (`role="dialog"`, `aria-modal="true"`) with zoom out, zoom in,
  fit-to-window, and close controls. It opens at the inline zoom factor,
  supports Ctrl/Cmd + wheel zoom at the pointer, drag panning clamped to the
  diagram bounds, Escape to close, a Tab/Shift+Tab focus trap, focus return to
  the trigger, background scroll lock with scroll-position restore, and
  `prefers-reduced-motion` support. It reuses the sanitized SVG and never
  re-renders Pele. New module: `src/client/viewer.js`; 13 tests in
  `tests/viewer.test.mjs`; browser evidence `fixture-viewer.png`.
- **Explicit fence aliases (P3).** `mermaidjs` and `mmd` are accepted in
  addition to `mermaid`, through the existing committed-React-props-first /
  explicit-banner-fallback path. No source heuristics and no `language-*` class
  sniffing were added; near-miss languages (`mmdx`, `mermaid.js`,
  `mermaid-js`, `mermaidjsx`) stay native. New exports: `MERMAID_LANGS` and
  `isMermaidLanguage`; `MERMAID_LANG` remains `'mermaid'`.
- **Versioned installed-host probe (P2).** `npm run verify:host` now resolves the
  minified CodeBlock bindings by installed frontend version: the audited
  `0.2.1-rc.2` map is retained and a `0.2.2-rc.3` adapter is added. An unknown
  version throws a typed `UnsupportedHostError` (code `unsupported-host`) with
  an actionable update message instead of a raw `ReferenceError`; the
  `0.2.2-rc.3` evidence records the frontend asset version/hash and six probe
  checks. New tests: `tests/host-bindings.test.mjs`.
- **P1 visual cases.** The browser fixture now covers ten cards: nine diagram
  cases (eight rendered diagrams plus one invalid fallback) and one untouched
  JavaScript fence. The new cases are CJK long-label wrapping and closing
  punctuation, `classDiagram` group wrapping in the wide and narrow columns,
  `List<T>`/`Map<K,V>` labels, and rich `<sub>`/`<sup>`/`<code>`/`<kbd>`/`<samp>`
  labels. Two new captures: `fixture-wide-p1.png` and `fixture-narrow.png`.
- Launcher icons (`src/client/icons.js`) for the export and viewer controls:
  decorative inline SVGs, `currentColor`, no font/sprite/remote resource.
- Evidence for this iteration under `docs/evidence/2026-11-17/`: host probe,
  visual run, and P6 measurements.

### Changed

- **Pele 1.9.0**, pinned to the exact version (not a range) in
  `package.json#devDependencies`; the lockfile was refreshed. This brings the
  label/layout fixes exercised by the P1 cases; the plugin adds no text shaping
  or heuristics of its own.
- **Client bundle:** `lib/client.js` is 738,710 bytes, SHA-256
  `3259e916e0017a66090781493376b982ef2ab373be062bbb8795ec54cd913c82`, wrapper id
  `dsh-pele-mermaid`. The whole-inline-bundle raw budget is 750,000 bytes, so
  11,290 bytes of headroom remain. Pele 1.9.0 alone produced 718,094 bytes before
  P3/P4/P5 were added.
- **Version 0.2.0** and a new `CHANGELOG.md`, included in `package.json#files` so
  the tarball ships it.
- `npm run verify:visual` now asserts the P1 layout facts, the four-control
  toolbar, the viewer open/zoom/fit/Escape/focus path, a 720×2200 narrow-column
  capture, and eight screenshots. Restricted sandboxes opt into Chrome's
  `--no-sandbox --disable-setuid-sandbox` flags explicitly with
  `DSH_VISUAL_CHROME_NO_SANDBOX=1`; normal runs keep Chrome's sandbox.
- `scripts/verify-install.mjs` accepts `--source=<tarball>` so the final release
  check can install the packed artifact instead of the workspace.
- Base target for compatibility claims remains DSH `0.2.1-rc.2` / React
  `18.3.1`; no `0.2.2` compatibility claim is made from the component probe
  alone.

### Fixed

- Host-probe failure on DSH `0.2.2-rc.3`: the renamed minified bindings no longer
  crash the probe with `ReferenceError: k is not defined`; adapters are resolved
  by frontend version and unknown versions fail with a typed, actionable error.
- Label layout in the narrow chat column via Pele 1.9.0: CJK labels wrap between
  characters instead of stretching the diagram, closing punctuation stays with
  its preceding line, class-diagram groups wrap onto new rows, generic
  `List<T>`/`Map<K,V>` text survives, and rich-text labels render.
- Viewer state: closing the overlay releases every listener, scroll lock, and
  node; a backdrop click closes it while a click inside the dialog does not; the
  same overlay instance is reused and teardown destroys it.

### Security

- Export and viewer reuse a sanitized clone: no scripts, event-handler
  attributes, `foreignObject`, frames, embedded objects, or external
  image/asset references. Remote image loading remains disabled in the live
  renderer (`images: false`), and the exported file contains no remote assets by
  construction.
- Exported links keep only `https`/`http`/`mailto`/`tel` schemes plus in-document
  `#` references; `javascript:`, `data:`, and `vbscript:` links are removed, as
  are `use` references to external sprites.
- No new network requests, no telemetry, no author-controlled options, and no
  changes to the safety boundary: disabled or absent, DSH is exactly the shipped
  product.

### Verification

- `npm test`: **120 tests, 120 pass, 0 fail, 0 cancelled, 0 skipped, 0 todo**
  (about 7.5 s). New suites: export (7), viewer (13), host bindings (6).
- `npm run verify`: **PASS** — build freshness (`build --check` up to date,
  738,710 bytes) and the 7-test built-bundle smoke suite.
- `npm run verify:host`: **PASS** on installed DSH `0.2.2-rc.3` — frontend asset
  `index-Ciz7DZxv.js` (1,093,870 bytes, SHA-256
  `65411dabad4de33466b12643cf30376d3d41ea1b7ce10ce329e97c89992d308b`), component
  SHA-256 `99afefb4fe88333ec0f28540cf0381523922abbde7559c3ca15ca43914b09839`,
  React 18.3.1, six checks (plain banner props/mount, unmount props, card banner
  + Copy, plain/static/streaming source shapes + Copy). Scope: fixture adapters,
  not a live DSH session.
- `DSH_VISUAL_CHROME_NO_SANDBOX=1 npm run verify:visual`: **PASS** with headless
  Chrome 157.0.8103.79; eight screenshots with recorded sizes/hashes, P1 layout
  facts, the four-control toolbar, viewer evidence, and byte-identical fixture
  teardown.
- **P6 lazy-runtime decision: NO-GO for 0.2.0** — keep Pele bundled inline.
  Final bundle: raw 738,710 bytes, `gzip -9` 275,784, brotli 223,454; local
  plain-HTTP route bundle request+eval by ~40 ms cold, first diagram ready
  ~411 ms cold / ~368 ms warm (dominated by the 150 ms scan debounce + 180 ms
  settle window). Installed-route `Content-Encoding`/`encodedBodySize`/cache
  metrics and a split-prototype first-diagram regression were not measured, so
  the roadmap adopt rule cannot be satisfied; the default no stands. Evidence:
  `docs/evidence/2026-11-17/p6-measurement.json`.
- **Packaging verified from the final tarball** (`dist/dsh-pele-mermaid-0.2.0.tgz`;
  `dist/` is not committed): installed into an isolated `DSH_HOME` web profile,
  boot graph entry present, served route 200 with 738,783 bytes = the full
  738,710-byte bundle plus the 73-byte loader source-map suffix,
  disable/uninstall restored the baseline (rev-normalized). Tarball size and
  SHA-256 are recorded in `docs/evidence/2026-11-17/install.json`, together with
  the full transcript (`install.log`) and the packed file list
  (`package-dry-run.json`).
- Compatibility unchanged: `0.1.1` / `0.2.1-rc.2` remains the only verified
  row. `0.1.1` / `0.2.2-rc.3` and `0.2.0` / `0.2.2-rc.3` are **pending** until a
  controlled live chat run; the installed Desktop profile still runs plugin
  `0.1.1` and was not replaced in this iteration.

### Still pending

- **P0 live verification** of `0.1.1` on DSH `0.2.2-rc.3` (and then of `0.2.0`)
  in a controlled live chat session with the 10-case matrix and screenshots. A
  sample was posted to a running session, but desktop screenshot consent was
  not granted, so no evidence was captured. `DG1` stays unresolved.
- **P7 release steps**: the live chat regression on the installed tarball
  (blocked with P0), then the GitHub Release with the tarball and evidence links,
  and the `0.2.0` tag. Packaging itself is verified — see Verification above.
- **GitHub Release** with the packed tarball and evidence links; no npm or
  GitHub Packages publication in 0.2.0.
- Live check of export and viewer in a real `0.2.0` DSH session (currently
  covered by automated tests and the real-browser fixture only).

---

Earlier versions were working-tree builds without a changelog; the 0.1.0 and
0.1.1 verification records are preserved in
[docs/VERIFICATION-HISTORY.md](docs/VERIFICATION-HISTORY.md) and
[docs/VERIFICATION.md](docs/VERIFICATION.md).
