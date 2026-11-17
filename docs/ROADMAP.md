# dsh-pele-mermaid — Roadmap

Status: 0.2.0 implementation complete; P0 live verification and the release
steps remain open.
Last updated: 2026-11-17
Target release: 0.2.0
Current release: 0.2.0 working build (verified compatibility baseline: 0.1.1)
Owner: repository maintainer

This document is the delivery plan for the next release. It records the current
baseline, the order of work, per-phase exit criteria, and the decisions that must
be made before a compatibility or performance claim is published. It is not a
commitment to dates; estimates are indicative. Phase status and evidence
were marked on 2026-11-17; the plan's scope and phase ordering are unchanged.

## 1. Purpose

The 0.1.1 plugin is intentionally small: it renders explicit Mermaid fences with
Pele, keeps the host source DOM intact, disables diagram images, and focuses on
being safe when disabled. The 0.2.0 line should improve day-to-day use without
weakening those boundaries:

- verify the current build on the installed DSH runtime, not only on the
  version the evidence was recorded against;
- gain the label/layout fixes in Pele 1.9;
- support explicit aliases without introducing source heuristics;
- add standalone SVG export and a fullscreen viewer;
- only then evaluate lazy-loading Pele, with measured startup and first-diagram
  costs.

Non-goals remain unchanged: no settings UI, no Markdown/session rewriting, no
second Mermaid engine, no source-language guessing, and no automatic diagram
image loading.

## 2. Baseline (2026-11-09)

| Item | Value |
| --- | --- |
| Package | `dsh-pele-mermaid@0.1.1` |
| Client bundle | `lib/client.js`, 694,058 bytes |
| Pele | 1.6.0, bundled into the client bundle |
| Automated tests | 84, all passing (`npm test`) |
| Bundle verification | `npm run verify` passes; wrapper id matches the package name |
| Documented host target | DSH 0.2.1-rc.2 / React 18.3.1 |
| Installed host under test | DSH 0.2.2-rc.1 (Desktop profile includes the plugin at 0.1.1) |
| Live 0.2.2 rendering | **Not yet recorded** |
| Host probe | `npm run verify:host` fails on 0.2.2-rc.1 with `ReferenceError: k is not defined` |
| Current constraints | Explicit fences only; `images: false`; conservative detection |

The host-probe failure is a harness/binding mismatch, not evidence that the
plugin is broken. It is also not evidence that the plugin is compatible: the
probe and a real chat exercise different paths.

### 0.2.0 iteration result (2026-11-17)

| Item | Value |
| --- | --- |
| Package | `dsh-pele-mermaid@0.2.0` working build; no registry publication |
| Client bundle | `lib/client.js`, 739,526 bytes, SHA-256 `906b1cc2…f1ea4af`; 10,474 bytes headroom under the 750,000-byte raw budget |
| Pele | `1.9.0`, exact pin, bundled inline (P6 no-go) |
| Automated tests | `npm test`: **123/123 pass**, 0 fail/skip/todo; `npm run verify`: PASS; `npm run verify:host`: PASS on `0.2.2-rc.3`; `npm run verify:visual`: PASS (10 screenshots) |
| Compatibility claim | Unchanged: only `0.1.1` / `0.2.1-rc.2` is verified. `0.2.2` rows are pending (P0). |
| P0 live 0.2.2 | **Not recorded**; blocked/deferred (DG1 unresolved) |
| P6 decision | **NO-GO**; keep Pele bundled inline |
| Release | P7 partial: version + `CHANGELOG.md` + packed-tarball (`824a8e06…`) install/served-route/disable-uninstall verified (re-pack required only if any of the 9 packaged files change before release); live regression and GitHub Release pending |

The plan was drafted against DSH `0.2.2-rc.1`; by this iteration the installed
desktop runtime is `0.2.2-rc.3`, so the status records and matrix below use
`0.2.2-rc.3`. Evidence for the result above is in
[`evidence/2026-11-17/`](evidence/2026-11-17/) and
[VERIFICATION.md](VERIFICATION.md).

### Compatibility matrix

Compatibility claims are scoped to a tuple of plugin version, host version, and
artifact hash. P0's `0.1.1` result does not transfer to `0.2.0`.

| Plugin | Host | Evidence | Status |
| --- | --- | --- | --- |
| 0.1.1 | 0.2.1-rc.2 | [VERIFICATION-HISTORY.md §10](VERIFICATION-HISTORY.md#10-historical-011-post-repair-baseline-2026-10-19): 84 tests, host probe, isolated install, visual fixture | Verified (recorded 2026-10-19) |
| 0.1.1 | 0.2.2-rc.3 | P0 — no controlled live session evidence (screenshot consent not granted) | Pending (blocked) |
| 0.2.0 | 0.2.1-rc.2 | Bundle/component tests only; no live session | Unknown |
| 0.2.0 | 0.2.2-rc.3 | P2 host probe PASS (fixture adapters); final `.tgz` and live regression pending | Pending |

### Pre-work already measured

**Historical pre-work (2026-11-09).** In a throwaway copy, upgrading only
`pele` to 1.9.0 produced:

- `lib/client.js` 718,094 bytes (+24,036 bytes, +3.46%);
- 84/84 automated tests passing;
- `npm run verify` passing.

This was build-level evidence, not visual acceptance; P1 confirmed the upgrade.
The final `0.2.0` bundle is 739,526 bytes after P3/P4/P5, still inside the
750,000-byte whole-inline budget (10,474 bytes headroom).

## 3. Principles

1. **Verify before claiming.** A compatibility statement in README requires a
   recorded check against that host version. Keep 0.2.1-rc.2 as the verified
   baseline until P0 passes on 0.2.2.
2. **Keep the safety boundary.** `images: false`, `textContent` for untrusted
   strings, Pele limits, and "disabled means exactly the shipped host" stay in
   place. New features must not add automatic external requests.
3. **No source heuristics; no class sniffing.** Only explicit `mermaid` fences
   (and the aliases in P3) are enhanced. Language comes from committed React
   `lang` props or an explicit banner tag; when neither yields a supported
   explicit language, the block stays native.
4. **One concern per phase.** Do not mix a renderer upgrade, a host-probe
   rewrite, and a new viewer in one change. Each phase has its own tests and
   evidence.
5. **Prefer measured complexity.** Lazy loading is a decision gate, not a
   default. The same applies to any new host route or cache layer.
6. **Borrow patterns, not architecture.** Prior art can inform export, viewer,
   and packaging details; it does not justify importing a runtime route,
   heuristic detection, or image policy that conflicts with this plugin.

## 4. Phase overview

| Phase | Goal | Estimate | Depends on | Status |
| --- | --- | --- | --- | --- |
| P0 | Real-session verification on DSH 0.2.2-rc.3 (planned as rc.1) | 0.5 day | — | **Blocked/deferred** — no live evidence, DG1 unresolved |
| P1 | Pele 1.6.0 → 1.9.0 with visual checks | 1 day | P0 | **Done** (visual checks recorded 2026-11-17) |
| P2 | Host probe v2 for 0.2.2-rc.3 | 1–2 days | P0, P1 | **Done** — PASS, DG4 accepted |
| P3 | Explicit `mermaidjs` / `mmd` aliases | 0.25 day | P0 | **Done** — tests + READMEs |
| P4 | Standalone SVG export | 1 day | P1 | **Done** — automated + browser fixture |
| P5 | Fullscreen viewer | 1.5–2 days | P4 | **Done** — automated + browser fixture; live-session check pending P0 |
| P6 | Lazy runtime — decision gate | 1–2 days | P0, P1 | **Decision: NO-GO** recorded |
| P7 | Packaging, docs, 0.2.0 release | 0.5 day | all | **Partially done** — packaging verified from the final tarball; live regression + GitHub Release pending |

Indicative sequence: P0 → P1 → P3 → P2/P4 → P5 → P6 decision → P7. P3 can run in
parallel with P1/P2; P2 is not a blocker for starting P4. In practice P1–P6 were
implemented and evidenced before P0 could run; the compatibility consequences of
that deviation are recorded under P0, DG1, and the Definition of Done.

[MAINTENANCE.md](MAINTENANCE.md) defines evidence handling, documentation
ownership, and structural cleanup alongside these phases. Evidence repair and
documentation work can proceed alongside P0 using fixed test inputs.

## 5. Phase details

### P0 — Real-session verification on DSH 0.2.2-rc.3 (planned as rc.1)

**Status (2026-11-17): Blocked/deferred — not completed.** A sample diagram
message was posted to a running session, but desktop screenshot consent was not
granted, so no controlled live-chat evidence (screenshots, recording, console,
DOM checks) was captured. DG1 stays unresolved and no `0.2.2` compatibility row
is claimed. The installed Desktop profile still runs plugin `0.1.1` and was not
replaced in this iteration.

**Follow-up (required before any 0.2.2 claim):**

1. Reproduce the preconditions below on the installed Desktop app.
2. Run the full 10-case matrix on `0.1.1`, capturing screenshots/recording,
   console output, boot graph, frontend asset hash, bundle hash, and DOM checks.
3. Write `docs/VERIFICATION-0.2.2.md` with per-case results and link it from
   `docs/VERIFICATION.md`; only if all cases pass and the loaded client identity
   is verified, close `DG1` and promote `0.1.1 / 0.2.2-rc.3` to `Verified`.
4. Repeat on the final `0.2.0` tarball in P7 (adding the `0.2.0` alias, export,
   and viewer checks) before adding a `0.2.0` / `0.2.2` row.
5. **Release policy alternative (superseding the `0.1.1` live baseline):** the
   maintainer may choose not to invest a separate live run in `0.1.1` and
   instead concentrate the full 10-case base matrix plus the `0.2.0` P3/P4/P5
   checks onto the final `0.2.0` tarball. Under that choice, `DG1` is recorded as
   **Superseded** (never `Pass`), `0.1.1 / 0.2.2-rc.3` remains `Not verified` in
   this release cycle, and the corresponding wording in the packaged files
   (`docs/KNOWN-LIMITATIONS.md` L10 and `CHANGELOG.md`) must be updated **before**
   freezing and packing the final `0.2.0` tarball.

**Goal:** establish whether 0.1.1 works in the installed 0.2.2 app before
changing code or compatibility text.

**Preconditions**

- The Desktop profile lists `dsh-pele-mermaid@0.1.1` in its dependencies and in
  `dsh.profile.bundles`.
- `dsh plugin --profile desktop list` succeeds using the DSH app's bundled CLI.
  (A standalone `@deepseek-ai/dsh` CLI cannot manage the `desktop` profile; it
  can still manage `web`.)
- Restart the app or refresh the page after install/enable so the client boot
  graph is recomposed.
- Identify the fixed source, dependencies, bundle, and host and reserve a run
  directory under the [capture conventions](MAINTENANCE.md#3-p0-capture-and-manifest-timing).
  Verify the client actually loaded by the session. P0 does not wait for all
  documentation cleanup or a historical manifest rewrite.

**Test matrix**

| # | Case | Expected | Evidence |
| --- | --- | --- | --- |
| 1 | Explicit `mermaid` fence with Chinese labels | Diagram renders; toolbar present | screenshot |
| 2 | Mermaid fence shown under the generic `代码块` / `Code` banner | React props identify `mermaid`; diagram renders | screenshot + console |
| 3 | Streaming response containing a mermaid fence | Final diagram matches the final source; a pause longer than the 180 ms settle window may show an intermediate state (L8), recorded rather than treated as a surprise | screen recording |
| 4 | Invalid Mermaid syntax | Source remains; plain-text note `Pele: <message>` (the message is Pele's raw text, not localized; only toolbar labels are localized) | screenshot |
| 5 | Source over Pele's 50,000-character limit | The plugin calls `mount()`; Pele rejects the source with a "longer than the limit" style error; source remains; no SVG; note shows the raw message. `0.1.1` has no plugin-level precheck | screenshot |
| 6 | Light/dark theme switch | Colors change without a Pele re-render | before/after |
| 7 | Diagram / Source toggle and host Copy | Original `<pre>` parent preserved; Copy matches host behavior | screenshot + DOM check |
| 8 | Non-mermaid fence and inline `code` | No toolbar, no styles, no DOM change | screenshot |
| 9 | Several diagrams in one long response; scroll | All render; no duplicate toolbars; page stays responsive | recording |
| 10 | Disable the bundle, restart | No plugin entry in the boot graph; no observer, style, or DOM additions | boot graph + DOM |

Localization boundary: toolbar labels have `zh`/`en` catalogs; error notes are
`Pele: <raw message>` with `textContent`, never HTML.

**Deliverable:** `docs/VERIFICATION-0.2.2.md` with the plugin version, host
version, frontend asset hash, bundle hash/URL, per-case result, console
observations, and screenshots. Link it from `docs/VERIFICATION.md`. Record that
this evidence covers `0.1.1`; the final `0.2.0` tarball is rechecked in P7.

**Exit criteria**

- All cases pass, or each failure is recorded with impact and a follow-up phase.
- No unexplained console errors or external requests.
- Distinguish a host regression from documented behavior: raw Pele error text
  and Pele's own limit rejection are current behavior, not P0 failures.
- README compatibility text is updated only after a pass. A failure keeps the
  0.2.1-rc.2 statement and adds a "0.2.2: failing case" note.

**If it fails:** stop P1/P3 and treat the failure as the top priority. The
private-Fiber dependency (L1) and host DOM changes (L6) are the likely causes;
record the exact host shape before changing detection. This phase is currently
deferred, so the failure path has not been exercised; the P2 probe passes and
does not contradict a future P0 result (P0 wins if they disagree).

### P1 — Pele 1.6.0 → 1.9.0

**Status (2026-11-17): Done.** `pele` is pinned to exact `1.9.0` in
`package.json#devDependencies` and the lockfile was refreshed; the bundle was
rebuilt and version references updated. Pele 1.9.0 alone measured 718,094 bytes;
the final `0.2.0` bundle with P3/P4/P5 is 739,526 bytes, inside the
750,000-byte whole-inline budget. The extended fixture (10 cards / 9 diagram
cases / 8 rendered diagrams) and `npm run verify:visual` PASS assert the P1
benefits: CJK labels wrap between characters with closing punctuation retained,
class groups sit on one row wide / three rows narrow, `List<T>`/`Map<K,V>` text
survives, and `<sub>`/`<sup>`/`<code>`/`<kbd>`/`<samp>` labels render. Evidence:
[`visual-evidence.json`](../tests/fixtures/screenshots/visual-evidence.json),
the ten screenshots under `tests/fixtures/screenshots/`, and
[`evidence/2026-11-17/PUBLICATION.md`](evidence/2026-11-17/PUBLICATION.md). The
old 1.6.0 captures were historical and have
since been overwritten, so "match or improve on 1.6.0" is supported by asserted
layout facts, not a pixel diff.

**Goal:** take the renderer fixes that matter in a narrow chat column without
regressing existing behavior.

**Changes**

- Pin `pele` to `1.9.0` (exact version, not a range) and refresh the lockfile.
- Rebuild `lib/client.js`; commit the generated bundle.
- Update the version references in `README.md`, `README.zh.md`, and
  `docs/ARCH.md`.
- Refresh the bundle hash and evidence records.

**Visual checks** (extend the fixture first; the current script is not enough)

The current `tests/fixtures/fixture.js` covers flowchart, sequence, pie, gantt,
one invalid diagram, and a non-mermaid block. It does not cover CJK wrapping,
class-diagram groups, `List<T>`/`Map<K,V>`, or rich-text labels. A green
`verify:visual` on that fixture does not prove the 1.9 benefits.

- Add CJK long-label, class-diagram, `List<T>`/`Map<K,V>` and `<sub>`/`<sup>`/
  `<code>` cases to the fixture (and update the script's counts/assertions), or
  capture equivalent manual screenshots in a real DSH session.
- Chinese/Japanese labels wrap between characters instead of stretching the
  diagram; closing punctuation stays with the preceding line.
- Class diagrams wrap separate groups onto new rows in the narrow column.
- `List<T>` / `Map<K,V>` labels keep the angle-bracket part.
- Labels support `<sub>`, `<sup>`, `<code>`, `<kbd>`, `<samp>`.
- Container resize / zoom produces no `ResizeObserver loop` console errors.

**Exit criteria**

- `npm test` meets the [behavior-based gate](MAINTENANCE.md#6-behavior-based-test-gate);
  record actual results and explain changes to test coverage or organization.
- `npm run verify` passes.
- The visual cases match or improve on 1.6.0; no clipped/overlapping labels.
- Bundle size is recorded (expected 718,094 bytes). The 0.2.0 raw budget of
  750,000 bytes applies to the **whole inline bundle**; Pele 1.9 leaves 31,906
  bytes of headroom for export and viewer. If P6 adopts a split, record the
  client, runtime, and first-diagram total separately; do not apply the inline
  budget to the reduced client alone.
- If a visual regression appears, revert to 1.6.0 and record the reason; do not
  ship a mixed renderer.

### P2 — Host probe v2

**Status (2026-11-17): Done — DG4 pass.** Bindings are versioned by installed
frontend version: the audited `0.2.1-rc.2` map is retained and a `0.2.2-rc.3`
adapter added. `npm run verify:host` PASSES on the installed `0.2.2-rc.3` host
(frontend asset `index-Ciz7DZxv.js`, 1,093,870 bytes, SHA-256 `65411dab…92d308b`;
component `99afefb4…4b09839`; React 18.3.1; six checks) and records the
version/hash. An unknown version fails with the typed `UnsupportedHostError`
(code `unsupported-host`) and an actionable message instead of a raw
`ReferenceError`; `tests/host-bindings.test.mjs` covers that path. Evidence:
[`host-probe.json`](evidence/2026-11-17/host-probe.json) (and the archived
console wrapper in
[`evidence/2026-11-17/PUBLICATION.md`](evidence/2026-11-17/PUBLICATION.md)). The
optional one-off
live CDP probe from approach step 2 was not performed — the controlled live
session remains P0's job and its result wins if they disagree. The
`0.2.1-rc.2` map is unit-tested but no longer render-verified because that host
bundle is not installed (tracked as L9).

**Goal:** make the installed-host probe meaningful on 0.2.2 instead of failing
with a raw minified-identifier error.

**Context:** 0.2.2 renamed the minified React/JSX bindings used by the extracted
CodeBlock. `k` is only the first missing symbol; the function also references
`By`, `M4`, `SA`, `qF`, `kA`, `Wo`, `Un`, `JF`, `y8`, and others. The current
`installedComponentBindings()` map was written for 0.2.1-rc.2.

**Approach**

1. Keep the fixture probe, but make the binding map versioned by frontend
   version or bundle hash. Unknown versions must fail with an actionable
   message ("host bundle changed; update the binding map"), not a raw
   `ReferenceError`.
2. Run a one-off live probe (for example, a CDP/Playwright check against the
   running GUI) that reads the committed `lang`/`code` props from a rendered
   code block. Record it in the verification document; do not add an
   Electron-dependent live probe to CI in 0.2.0. The committed fixture probe
   remains the repeatable regression check.
3. Document the split in `docs/ARCH.md` and the version-sensitivity limits in
   `docs/KNOWN-LIMITATIONS.md`.

**Exit criteria**

- `npm run verify:host` passes on the installed `0.2.2` host, or exits with
  the typed "unsupported host" diagnostic and records the limitation.
- The probe records the frontend version and asset hash.
- Its conclusion does not contradict P0; if they disagree, P0 wins.

**Release gate:** pass, or an explicit accepted limitation in
`KNOWN-LIMITATIONS.md` and `VERIFICATION.md`. Do not claim host compatibility
from the fixture probe alone.

### P3 — Explicit aliases

**Status (2026-11-17): Done.** `mermaid`, `mermaidjs`, and `mmd` render through
the existing committed-React-props-first / explicit-banner-fallback path via
`MERMAID_LANGS` / `isMermaidLanguage`; no source heuristics or
`language-*` sniffing were added and near-miss languages stay native. Detection,
lifecycle, and non-mermaid regression tests cover the aliases, and both READMEs
list the three accepted languages. Evidence: `tests/blocks.test.mjs` and the
README behavior tables.

**Goal:** accept `mermaid`, `mermaidjs`, and `mmd` fences without widening
detection beyond explicit language metadata.

If host identification is extracted under the maintenance plan, review and
verify that change after P0 and before adding aliases. The extraction is optional;
P3's required dependency remains P0.

**Changes**

- Extend the accepted `lang` values in the existing detection path
  (`readFenceFacts` → `scanBlock`). The contract is **committed React
  `lang`/`code` props first, explicit banner tag as fallback**, not
  `language-*` class inspection.
- Keep the rules: `.md-code-block` with a banner and a host-owned `pre` inside
  `[data-code-block-content]`; a generic banner (`代码块` / `Code`) without
  props stays unknown; inline `code` is untouched; no source heuristics.
- Add detection, lifecycle, and non-mermaid regression tests for all three
  aliases. Cover the alias under a generic banner via React props, and the
  banner-only path where it is available.
- Update the behavior table in both READMEs.

**Exit criteria**

- All three explicit aliases render from the same props-first/banner-fallback
  path.
- Other languages and inline code produce zero DOM changes.
- No class-based detection branch and no source-keyword check is added.

### P4 — Standalone SVG export

**Status (2026-11-17): Done (automated + real-browser fixture).** New
`src/client/export.js` and a localized icon control export the pristine
natural-size SVG (never the zoom/pan-mutated inline view), restore
width/height/`viewBox`, insert a first-child background rectangle covering the
natural canvas (resolved `--pele-bg` fill for downloads), and support two theme
modes: `resolved` (default; freeze today's colors into the file) and `inherit`
(token expressions for an in-app surface that follows the live theme). The clone
is sanitized (scripts/foreignObject/frames/objects/media/`on*`/`src`/unsafe
style removed), keeps `https`/`mailto`/`tel`/`#` links, uses the
`pele-<type>-YYYYMMDD-HHmmss.svg` name, and revokes the object URL.
`tests/export.test.mjs` has 9 tests (sanitization, sizing, filename, download,
background rectangle, dark/light luminance and inherit-mode tokens); the browser
fixture captures real downloaded light/dark bytes, asserts the background equals
the resolved `--pele-bg`, and renders the dark download on a white page
(`fixture-export-dark-preview.png`). The exit criterion "opens in a vector
tool" was **not independently verified** — exported output is asserted to be
well-formed XML with the expected geometry/background via
DOMParser/XMLSerializer plus a browser-rendered preview.

**Goal:** let a reader save a diagram that opens correctly outside DSH.

**Changes**

- Add a toolbar "Download SVG" control with an icon, localized `aria-label`,
  and `title`.
- Export from the pristine SVG (never from the zoom/pan-transformed inline
  view). Set the resolved `--pele-*` theme variables on the exported root so it
  looks the same outside DSH.
- Keep the whole diagram at natural size; zooming or panning before export must
  not crop it.
- Sanitize the clone: remove scripts, event-handler attributes, and
  `foreignObject`; do not introduce remote images. `images: false` remains in
  force.
- Filename: `pele-<type>-YYYYMMDD-HHmmss.svg`.
- Revoke object URLs after download.

**Tests**

- XML parses; root has expected dimensions/`viewBox` and theme variables.
- No `<script>`, `on*` attributes, or external image references.
- Export after zoom/pan still contains the full diagram.
- Button is keyboard reachable, localized, and disabled when no diagram exists.

**Exit criteria**

- The exported file opens in a browser and a vector tool with the same colors
  and complete geometry.
- Manual + automated checks cover success and no-diagram paths.

### P5 — Fullscreen viewer

**Status (2026-11-17): Done (automated + real-browser fixture).** New
`src/client/viewer.js` provides one reusable overlay dialog
(`role="dialog"`, `aria-modal="true"`) with zoom out/in/fit/close, opens at the
inline zoom factor, Ctrl/Cmd + wheel zoom at the pointer, bounded drag pan,
Escape close, Tab focus trap, focus restore, scroll lock + restore,
`prefers-reduced-motion` support, and full teardown. It reuses the sanitized SVG
and never re-renders Pele; the overlay receives the `inherit` export mode, so it
keeps token expressions and repaints with live theme switches while open (the
downloaded file keeps its captured colors). `tests/viewer.test.mjs` has 13 tests;
the browser fixture asserts viewer open/zoom/fit/Escape/focus, captures
`fixture-viewer.png`, and switches theme while the viewer is open to assert the
diagram background and dialog chrome repaint (`fixture-viewer-dark.png`). The
exit criterion "live check on the `0.2.0` build with the P0 fixture set" is
**pending with P0/P7** because no live chat evidence exists.

**Goal:** make wide diagrams usable without changing the inline source DOM.

**Changes**

- New `src/client/viewer.js`: overlay dialog, zoom in/out/reset/fit, drag pan,
  Ctrl/Cmd + wheel zoom at the pointer.
- Open at the inline zoom and restore inline scroll/zoom on close.
- Keyboard and focus: `Escape` closes; focus is trapped while open and returns
  to the trigger; `role="dialog"`, `aria-modal="true"`; background scroll is
  locked; `prefers-reduced-motion` is respected.
- Reuse the rendered SVG (clone or reparent safely); do not re-render Pele.
- Dispose listeners, observers, and timers on close and on plugin teardown.

**Tests**

- Open/close via mouse and keyboard; Escape; Tab/Shift+Tab loop; focus restore.
- Zoom anchor under pointer; fit-to-window; pan bounds.
- No duplicate overlays after repeated open/close; teardown removes everything.
- Theme switch and font change do not break the viewer.

**Exit criteria**

- Keyboard-only operation is complete.
- No residual nodes, listeners, or scroll locks after close.
- Live check on the `0.2.0` build passes with the P0 fixture set. If P6 changes
  the loading path, repeat this check on the final artifact.

### P6 — Lazy runtime — decision gate

**Status (2026-11-17): NO-GO recorded.** Final bundle 739,526 raw / 276,084
`gzip -9` / 223,848 brotli bytes; whole-inline budget met with 10,474 bytes
headroom. On a local plain-HTTP route (no `Content-Encoding`,
`cache-control: no-cache`) bundle request+eval completed by ~34 ms cold, and the
first diagram was ready in ~395 ms cold / ~370 ms warm — dominated by the fixed
150 ms scan debounce + 180 ms settle window, not bundle size. Installed-route
`Content-Encoding`/`encodedBodySize`/cache metrics and a split-prototype
first-diagram regression were not measured, so the adopt rule cannot be
satisfied; the default no stands. The reference split table below is historical
comparison data from another implementation, not this plugin's measurement.
Evidence: [`p6-measurement.json`](evidence/2026-11-17/p6-measurement.json);
decision recorded in [ARCH.md](ARCH.md#lazy-runtime-decision-p6-no-go-for-020).
Revisit only with authenticated installed-route `PerformanceResourceTiming` and
a split prototype.

**Goal:** decide whether to split Pele out of the client bundle, based on
measurements rather than bundle aesthetics.

**Current cost**

| Scenario | Raw bytes | gzip -9 bytes (local estimate) |
| --- | --- | --- |
| Inline bundle, any page (current) | 694,058 | 256,652 |
| Reference split client, no diagram | 65,390 | 20,990 |
| Reference split runtime, first diagram | 706,153 | 262,309 |
| Reference split, first diagram total | 771,543 | 283,299 |
| Delta vs inline, first diagram | +77,485 | +26,647 |
| Delta vs inline, no diagram | −628,668 | −235,662 |

The split figures are reference points from a comparable implementation; P6
must measure this plugin's actual client size, request time, and parse/eval
cost. The gzip column is a local `gzip -9` measurement, not the DSH route's
actual encoding; treat the prose numbers as gzip estimates until the route is
measured. Raw and encoded numbers are both useful, but they must not be mixed
in one comparison. Cold, no-diagram pages save about 629 KB raw / ~236 KB gzip
estimate. The first diagram costs about 78 KB raw / ~27 KB gzip estimate more
than the inline bundle, plus one same-origin request and evaluation time. This
is a startup optimization, not a universal download reduction.

**Measure**

- Record `PerformanceResourceTiming.encodedBodySize`, `transferSize`,
  `decodedBodySize`, the route's actual `Content-Encoding`, and cache status.
  `encodedBodySize` and `transferSize` are different metrics; a cache hit can
  report `transferSize = 0`. DSH may serve the bundle uncompressed.
- Cold start with no diagrams: time to interactive and main-thread work.
- First diagram: request, parse/eval, and time to first rendered SVG.
- Repeat on a mid-range machine and with a warm cache; record variance.

**Proposed decision rule** (thresholds provisional; confirm with measurements)

- Use one metric consistently on both sides of the comparison.
- Adopt only if cold-start improvement is material (for example, ≥200 ms or
  ≥200 KB `encodedBodySize`) **and** first-diagram latency regression is
  acceptable (for example, ≤150 ms locally). The earlier 500 KB threshold was
  written against the raw-byte table; it is not a transferred-byte threshold.
- Otherwise keep the inline bundle and record a no-go in `docs/ARCH.md`.

**If adopted**

- Host half registers a same-origin route, injected via `webServer`, cleaned up
  in `ctx.effect`; GET/HEAD only, 404/405 otherwise.
- **Cache-busting is mandatory:** `?v=<package version or content hash>` with
  `immutable` caching. A fixed URL plus `immutable` can serve a stale runtime
  after an upgrade; do not rely on the app changing ports.
- Failure fallback: keep the source visible, show a plain-text notice, and never
  block the page.
- Tests: route, cache key, 404/405, cleanup, runtime failure, first-diagram
  rendering.

**Exit criteria**

- A recorded adopt/no-go decision with numbers.
- If adopted, the cold-start and first-diagram budgets are met and the fallback
  is tested.

### P7 — Packaging, docs, 0.2.0 release

**Status (2026-11-17): Partially done — packaging/install verified from a packed
tarball, release steps pending.** Completed: version bumped to `0.2.0`;
`CHANGELOG.md` created and listed in `package.json#files`; both READMEs updated
with the installation matrix (desktop uses the app's bundled `dsh`, standalone
CLI cannot manage desktop; uninitialized vs lock distinction; restart/refresh)
and the pending compatibility wording; `scripts/verify-install.mjs` gained
`--source=<tarball>` for the final check. A packed
`dsh-pele-mermaid-0.2.0.tgz` was installed into an isolated `DSH_HOME` web
profile: the boot graph contains the plugin entry, the served route is 200 with
739,599 bytes = the full 739,526-byte bundle plus a 73-byte loader source-map
suffix, and disable/uninstall restores the baseline structurally
(rev-normalized). Tarball size/SHA-256 and the full install transcript are
recorded in `docs/evidence/2026-11-17/install.json`, `install.log`, and
`package-dry-run.json`; the post-review re-pack for the final bundle (the two
review fixes changed it) is
`dsh-pele-mermaid-0.2.0.tgz` = 297,759 bytes, SHA-256 `824a8e06…acc630`, and
`install.json` is authoritative for the shipped artifact. **Pending:** live
chat regression on that tarball (blocked with P0), the `0.2.0` / `0.2.2`
compatibility row,
GitHub Release, and tag. No npm/GitHub Packages publication in 0.2.0.

**Goal:** make installation instructions match real CLI behavior and produce a
reproducible 0.2.0 artifact.

**Documentation**

- Installation matrix:
  - `desktop`: use the DSH app's bundled `dsh` command; a standalone
    `@deepseek-ai/dsh` CLI cannot manage `desktop` (it can still manage `web`).
  - If the CLI reports the profile as **uninitialized**: open Desktop once so it
    creates the profile, fully quit, then retry.
  - If the CLI reports a **lock**: close the app/process holding the profile and
    retry. Do not use the uninitialized-profile recipe for a lock.
  - Otherwise: restart or refresh after install.
- Compatibility matrix: keep the `0.1.1` / `0.2.1-rc.2` row; add the `0.1.1` /
  `0.2.2` row after P0; add the `0.2.0` / `0.2.2` row only after the final
  tarball passes the live regression. Do not promote a `0.2.0` claim from P0's
  `0.1.1` evidence.
- Create `CHANGELOG.md` with the 0.2.0 entry and add it to `package.json#files`
  so the tarball ships it.
- Publish a **GitHub Release with the packed tarball** and release notes that
  link to the evidence. Do not publish to npm or GitHub Packages in 0.2.0;
  revisit that channel after the install path is stable.
- Update `docs/KNOWN-LIMITATIONS.md` for the probe status, export/viewer
  behavior, and any P6 outcome.

**Release checks**

- `npm test`, `npm run verify`, `npm run verify:host` (if P2 is complete).
- `npm pack --dry-run --json`; confirm the file list and sizes, then `npm pack`.
- Install the **final `.tgz`** (not the workspace path) into an isolated
  `DSH_HOME` profile; verify the boot graph contains the plugin. Fetch the
  served route and assert its body starts with the full tarball `lib/client.js`
  and appends only the host's loader source-map suffix. Historical evidence:
  694,058-byte bundle → 694,131-byte response (+73 bytes). Record the artifact
  SHA-256 and the response SHA-256 separately; do **not** require them to be
  equal. Teach `scripts/verify-install.mjs` to accept a tarball source, or add
  an equivalent wrapper for this check.
- Run a live chat regression on that installed tarball (explicitly naming the
  tested profile, e.g., Desktop profile managed by the app's bundled `dsh` CLI):
  explicit fence, generic-banner fence, Diagram/Source, Copy, theme switch, one
  error case, plus the `0.2.0` additions (`P3` `mermaidjs`/`mmd` aliases, `P4`
  light/dark SVG export with background rectangle readable on a white standalone
  page, and `P5` fullscreen viewer open/zoom/fit/Escape/focus/live-theme
  repaint/teardown). P0's evidence is for `0.1.1`; it does not prove `0.2.0`.
- **Re-pack and final-tarball rule:** any edit to any of the 9 packaged files
  (`package.json`, `index.js`, `cordis.patch.yml`, `lib/client.js`,
  `README.md`, `README.zh.md`, `CHANGELOG.md`, `LICENSE`,
  `docs/KNOWN-LIMITATIONS.md`) produces a new `.tgz` SHA-256. Whenever a new
  candidate `.tgz` is packed, re-run `scripts/verify-install.mjs
  --source=<final-tgz>` and complete the P7 live regression on that newly
  installed `.tgz` (earlier `0.2.0` feature-specific checks may be cited as
  supplementary evidence only after verifying byte equality of all runtime files
  in the tarball: `index.js`, `cordis.patch.yml`, `lib/client.js`, and
  `package.json` runtime fields). Freeze all packaged documentation before the
  final pack, and record post-regression verification reports in non-packaged
  files (`docs/VERIFICATION*.md`, `docs/evidence/<run-id>/`) so the verified
  tarball SHA-256 matches the GitHub Release asset exactly.
- **Tag verification (`0.2.0`):** after committing the finalized non-packaged
  evidence and creating the `0.2.0` Git tag, verify via `git show 0.2.0:<path>`
  that all 9 packaged files in the tagged commit match the verified `.tgz`
  entries byte-for-byte (if running `npm pack` as a check, pass
  `--pack-destination <isolated-temp-dir>` so `dist/` is never overwritten).
- Disable and confirm the graph returns to baseline; then uninstall.
- Record the bundle SHA-256 and the installed route bytes.
- Confirm the wrapper id equals `package.json#name`; the patch row `name` is the
  package specifier; the row `id` is stable and independent.
- If a build-on-install step is ever added, use `prepack` and commit the built
  artifacts; do not add `prepare` (pnpm 11 rejects it for git dependencies).

**Exit criteria**

- Install, disable, and uninstall are reproducible from the final tarball.
- Package contents, hashes, tests, and compatibility text agree.
- The `0.2.0` / `0.2.2` row is backed by a live regression on the final
  artifact.
- 0.2.0 is tagged; the GitHub Release carries the tarball and links to the
  evidence.

## 6. Decision gates

| Gate | Question | Rule | Result (2026-11-17) |
| --- | --- | --- | --- |
| DG1 | Does 0.1.1 work on 0.2.2? | P0 pass required before any 0.2.2 compatibility claim. | **Unresolved** — P0 blocked/deferred; no live evidence |
| DG2 | Is Pele 1.9 visually acceptable? | P1 pass; otherwise revert and document. | **Accepted** — P1 visual facts pass in the real-browser fixture |
| DG3 | Should Pele be lazy-loaded? | P6 thresholds; default is no. | **No-go** — keep Pele bundled inline |
| DG4 | Is the host probe updated? | Pass or explicitly accepted limitation; never infer compatibility from the fixture probe. | **Pass** — `verify:host` PASS on `0.2.2-rc.3`; probe scope limitation documented (L9) |

## 7. Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Private React Fiber changes | Generic-banner detection stops working | P0 live test; versioned probe; keep explicit-language fallback |
| Host DOM/selector changes | Toolbar or source ownership breaks | P0 matrix; preserve host `<pre>`; cleanup tests |
| Pele 1.9 visual regression | Labels clipped or mis-wrapped | P1 visual cases; revert if needed |
| SVG export leaks active content | Exported file runs script or loads remote assets | Sanitize clone; keep `images: false`; parse-and-assert tests |
| Viewer focus/scroll bugs | Keyboard users trapped or lost | Focus-trap/restore tests; teardown checks |
| Lazy runtime serves stale Pele | Old renderer after upgrade | Version/hash query; immutable cache; no reliance on port changes |
| Rename/scope mismatch | Client loader silently never registers | Build id from `package.json#name`; sync patch and install checks |
| Documentation drift | Users follow an unsupported path | Install matrix; evidence links; update only after pass |

## 8. Definition of done for 0.2.0

- [ ] P0 live verification recorded for the `0.1.1` / `0.2.2` tuple.
- [x] Automated tests meet the [behavior-based gate](MAINTENANCE.md#6-behavior-based-test-gate),
      actual results are recorded (123/123 pass, 0 fail/skip/todo), and
      `npm run verify` passes.
- [x] Host probe passes on 0.2.2-rc.3, or its limitation is accepted in writing
      (PASS with fixture-adapter scope accepted; DG4).
- [x] Pele 1.9 visual checks recorded; bundle hash updated (739,526 bytes,
      `906b1cc2…f1ea4af`).
- [x] Explicit aliases covered by tests and README.
- [x] SVG export and fullscreen viewer have automated + real-browser checks
      (the live-session check remains part of P0/P7).
- [x] P6 adopt/no-go decision recorded with raw, encoded, and timing measurements
      (NO-GO).
- [x] README/ARCH/KNOWN-LIMITATIONS/VERIFICATION agree.
- [x] Packed `.tgz` installed in an isolated profile; served route contains the
      full tarball bundle plus only the loader source-map suffix; disable/uninstall
      restore the baseline (bundle SHA-256 `906b1cc2…f1ea4af`, route 739,599 bytes;
      final tarball 297,759 bytes, SHA-256 `824a8e06…acc630`; evidence
      `docs/evidence/2026-11-17/install.json` records the bundle hash, route byte
      length, and suffix text, from which the `rev=203a6529fd35` response SHA-256
      is deterministically derived post-hoc as `60ad9cf4…304304e` in
      `docs/evidence/2026-11-17/PUBLICATION.md`; `scripts/verify-install.mjs` now
      records `active.route.sha256` directly for subsequent runs).
- [ ] `0.2.0` / `0.2.2` row backed by a live regression on the final tarball.
- [x] `npm pack --dry-run` contents and bundle SHA recorded
      (`docs/evidence/2026-11-17/package-dry-run.json`, 9 files, final
      297,759-byte tarball).
- [x] `CHANGELOG.md` added and included in the tarball (verified in the packed
      file list).
- [ ] GitHub Release published with the tarball and evidence links.

0.2.0 is not released while the unchecked items above remain open (P0 live
verification, the live tarball row, and the GitHub Release).

## 9. Decisions

Recorded 2026-11-09:

| Decision | Choice | Consequence |
| --- | --- | --- |
| Target release | 0.2.0 | Features are additive; keep the 0.1.1 baseline until P7. |
| Release channel | GitHub Release + tarball | No registry authentication; install docs use the tarball or a source checkout. |
| Changelog | Add `CHANGELOG.md` | Include it in `package.json#files` and the tarball. |
| Probe scope | Versioned fixture probe + one-off live probe | No Electron-dependent live probe in CI for 0.2.0. |
| Aliases | `mermaidjs` and `mmd` in 0.2.0 | P3 is in scope. |
| Lazy runtime | P6 decision gate | Default is no; adopt only if measurements support it. |

Recorded 2026-11-17:

| Decision | Choice | Consequence |
| --- | --- | --- |
| P1 renderer | Pele 1.9.0, exact pin | Label/layout fixes shipped; bundle rebuilt and recorded |
| P4/P5 scope | Ship export + fullscreen viewer in 0.2.0 | Two new browser-half modules, 22 new tests (export 9 + viewer 13), browser evidence |
| Alias set | `mermaid`, `mermaidjs`, `mmd` | P3 done; no heuristics added |
| P2 probe | Versioned binding map with `0.2.2-rc.3` adapter + typed `unsupported-host` error | DG4 accepted; probe stays a component check, not compatibility proof |
| P6 | NO-GO; keep Pele bundled inline | No host route/cache layer in 0.2.0 |
| P0 ordering | P1–P6 implemented/evidenced before P0 | DG1 unresolved; no `0.2.2` compatibility row; P0 remains required |
| Release | P7 partial: docs/version + tarball packaging verified; live regression and publication pending | 0.2.0 not announced/released yet |

## 10. Open items

These remain open after the 2026-11-17 iteration:

1. **P0 live verification (highest priority).** No controlled live chat run on
   DSH `0.2.2-rc.3` exists; desktop screenshot consent was not granted for the
   sample that was posted. Run the 10-case matrix, record
   `docs/VERIFICATION-0.2.2.md`, then repeat on the final `0.2.0` tarball.
2. **P6 threshold evidence.** The no-go stands for 0.2.0. Reconsider only with
   authenticated installed-route `PerformanceResourceTiming`/`Content-Encoding`/
   cache data and a split prototype measuring first-diagram regression.
3. **P7 release steps.** Packaging/install is verified from the packed `.tgz`
   (`824a8e06…acc630`) containing the final `906b1cc2…f1ea4af` bundle in
   `docs/evidence/2026-11-17/install.json`. If any of the 9 packaged files are
   modified before release, re-pack and re-run `verify-install.mjs` + the live
   regression on that new tarball. Remaining: the live chat regression on the
   final installed tarball (blocked with P0), then the GitHub Release with that
   exact tarball and evidence links, and the `0.2.0` tag.
4. **Registry publication after 0.2.0.** Revisit npm or GitHub Packages only
   after the GitHub Release/tarball install path is stable; 0.2.0 does not
   publish to a registry.

## 11. Post-0.2.0 engineering proposals (D1–D4)

These follow-ups are scoped outside the `0.2.0` release and each requires its
own preconditions and acceptance checks:

1. **Proposal D1 — Fix `L4` shared scan/refresh timer race (recommended first):**
   - `src/client/index.js` currently shares one `timer` between `scheduleScan`
     and `scheduleRefresh`, allowing a DOM mutation within the 150 ms debounce
     window to cancel a pending font-metric `refreshAll()`.
   - Precondition & acceptance: add a failing reproduction test first ("font
     change followed by DOM mutation within 150 ms"), then split the timer or
     track a `pendingRefresh` flag so the expiry runs `manager.refreshAll()`,
     rebuild `lib/client.js`, and run full verification.
2. **Proposal D2 — Scoped JSDoc static type checking (`tsc --noEmit`):**
   - Clean up non-standard JSDoc type names (`DOMWindow` → `Window`) and provide
     local ambient declarations for `@deepseek-ai/cordis` `Context` before
     enabling a `jsconfig.json` check over `src/client/*.js`.
3. **Proposal D3 — `L2` scan and settle-timer consolidation:**
   - Profile multi-block streaming histories to establish a baseline before
     consolidating per-record settle timers or filtering `MutationObserver`
     records. Any change must preserve 100% of existing block insertion/removal,
     nested static-Shiki `<pre>` replacement, language reuse, 1 s props-audit,
     and `destroy()` self-healing tests.
4. **Proposal D4 — Evidence storage slimming and bundle budget review:**
   - Future runs omit duplicate wrapper logs (`host-probe.log`, `visual.log`).
   - Evaluating an incremental format for `visual-evidence.json` requires
     defining an explicit baseline locator and verifying that a run's full state
     can still be reconstructed independently.
   - Re-evaluating the `750,000` B raw bundle budget or revisiting P6 lazy
     loading requires authenticated installed-route `PerformanceResourceTiming`
     (`Content-Encoding`, `encodedBodySize`, cache hit behavior) and a split
     prototype.

## 12. References

- [MAINTENANCE.md](MAINTENANCE.md) — evidence handling, documentation ownership,
  structural cleanup boundaries, and behavior-based test acceptance.
- [ARCH.md](ARCH.md) — module contracts, build contract, non-goals.
- [VERIFICATION.md](VERIFICATION.md) — current evidence and reproduction steps.
- [VERIFICATION-HISTORY.md](VERIFICATION-HISTORY.md) — historical records.
- [KNOWN-LIMITATIONS.md](KNOWN-LIMITATIONS.md) — tracked risks and follow-ups.
- [CHANGELOG.md](../CHANGELOG.md) — 0.2.0 changes and remaining release steps.
- [README.md](../README.md) / [README.zh.md](../README.zh.md) — install and
  behavior documentation.
