# dsh-pele-mermaid — Roadmap

Status: draft
Last updated: 2026-11-09
Target release: 0.2.0
Current release: 0.1.1
Owner: repository maintainer

This document is the delivery plan for the next release. It records the current
baseline, the order of work, per-phase exit criteria, and the decisions that must
be made before a compatibility or performance claim is published. It is not a
commitment to dates; estimates are indicative.

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

### Compatibility matrix

Compatibility claims are scoped to a tuple of plugin version, host version, and
artifact hash. P0's `0.1.1` result does not transfer to `0.2.0`.

| Plugin | Host | Evidence | Status |
| --- | --- | --- | --- |
| 0.1.1 | 0.2.1-rc.2 | [VERIFICATION.md](VERIFICATION.md): 84 tests, host probe, isolated install, visual fixture | Verified (recorded 2026-10-19) |
| 0.1.1 | 0.2.2-rc.1 | P0 | Pending |
| 0.2.0 | 0.2.2-rc.1 | P7: final `.tgz`, served-route suffix check, live session | Pending |
| 0.2.0 | 0.2.1-rc.2 | Not tested | Unknown |

### Pre-work already measured

In a throwaway copy, upgrading only `pele` to 1.9.0 produced:

- `lib/client.js` 718,094 bytes (+24,036 bytes, +3.46%);
- 84/84 automated tests passing;
- `npm run verify` passing.

This is build-level evidence, not visual acceptance. The upgrade is planned in
P1, not assumed to be already shipped.

## 3. Principles

1. **Verify before claiming.** A compatibility statement in README requires a
   recorded check against that host version. Keep 0.2.1-rc.2 as the verified
   baseline until P0 passes on 0.2.2-rc.1.
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
| P0 | Real-session verification on DSH 0.2.2-rc.1 | 0.5 day | — | Planned |
| P1 | Pele 1.6.0 → 1.9.0 with visual checks | 1 day | P0 | Planned |
| P2 | Host probe v2 for 0.2.2-rc.1 | 1–2 days | P0, P1 | Planned |
| P3 | Explicit `mermaidjs` / `mmd` aliases | 0.25 day | P0 | Planned |
| P4 | Standalone SVG export | 1 day | P1 | Planned |
| P5 | Fullscreen viewer | 1.5–2 days | P4 | Planned |
| P6 | Lazy runtime — decision gate | 1–2 days | P0, P1 | Decision |
| P7 | Packaging, docs, 0.2.0 release | 0.5 day | all | Planned |

Indicative sequence: P0 → P1 → P3 → P2/P4 → P5 → P6 decision → P7. P3 can run in
parallel with P1/P2; P2 is not a blocker for starting P4.

## 5. Phase details

### P0 — Real-session verification on DSH 0.2.2-rc.1

**Goal:** establish whether 0.1.1 works in the installed 0.2.2-rc.1 app before
changing code or compatibility text.

**Preconditions**

- The Desktop profile lists `dsh-pele-mermaid@0.1.1` in its dependencies and in
  `dsh.profile.bundles`.
- `dsh plugin --profile desktop list` succeeds using the DSH app's bundled CLI.
  (A standalone `@deepseek-ai/dsh` CLI cannot manage the `desktop` profile; it
  can still manage `web`.)
- Restart the app or refresh the page after install/enable so the client boot
  graph is recomposed.

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
  0.2.1-rc.2 statement and adds a "0.2.2-rc.1: failing case" note.

**If it fails:** stop P1/P3 and treat the failure as the top priority. The
private-Fiber dependency (L1) and host DOM changes (L6) are the likely causes;
record the exact host shape before changing detection.

### P1 — Pele 1.6.0 → 1.9.0

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

- `npm test` passes; record the count (84 before P3, more after).
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

**Goal:** make the installed-host probe meaningful on 0.2.2-rc.1 instead of
failing with a raw minified-identifier error.

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

- `npm run verify:host` passes on 0.2.2-rc.1, or exits with the typed
  "unsupported host" diagnostic and records the limitation.
- The probe records the frontend version and asset hash.
- Its conclusion does not contradict P0; if they disagree, P0 wins.

**Release gate:** pass, or an explicit accepted limitation in
`KNOWN-LIMITATIONS.md` and `VERIFICATION.md`. Do not claim host compatibility
from the fixture probe alone.

### P3 — Explicit aliases

**Goal:** accept `mermaid`, `mermaidjs`, and `mmd` fences without widening
detection beyond explicit language metadata.

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
  `0.2.2-rc.1` row after P0; add the `0.2.0` / `0.2.2-rc.1` row only after the
  final tarball passes the live regression. Do not promote a `0.2.0` claim from
  P0's `0.1.1` evidence.
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
- Run a live chat regression on that installed tarball: explicit fence,
  generic-banner fence, Diagram/Source, Copy, theme switch, and one error case.
  P0's evidence is for `0.1.1`; it does not prove `0.2.0`.
- Disable and confirm the graph returns to baseline; then uninstall.
- Record the bundle SHA-256 and the installed route bytes.
- Confirm the wrapper id equals `package.json#name`; the patch row `name` is the
  package specifier; the row `id` is stable and independent.
- If a build-on-install step is ever added, use `prepack` and commit the built
  artifacts; do not add `prepare` (pnpm 11 rejects it for git dependencies).

**Exit criteria**

- Install, disable, and uninstall are reproducible from the final tarball.
- Package contents, hashes, tests, and compatibility text agree.
- The `0.2.0` / `0.2.2-rc.1` row is backed by a live regression on the final
  artifact.
- 0.2.0 is tagged; the GitHub Release carries the tarball and links to the
  evidence.

## 6. Decision gates

| Gate | Question | Rule |
| --- | --- | --- |
| DG1 | Does 0.1.1 work on 0.2.2-rc.1? | P0 pass required before any 0.2.2 compatibility claim. |
| DG2 | Is Pele 1.9 visually acceptable? | P1 pass; otherwise revert and document. |
| DG3 | Should Pele be lazy-loaded? | P6 thresholds; default is no. |
| DG4 | Is the host probe updated? | Pass or explicitly accepted limitation; never infer compatibility from the fixture probe. |

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

- [ ] P0 live verification recorded for the `0.1.1` / `0.2.2-rc.1` tuple.
- [ ] 84+ automated tests and `npm run verify` pass.
- [ ] Host probe passes on 0.2.2-rc.1, or its limitation is accepted in writing.
- [ ] Pele 1.9 visual checks recorded; bundle hash updated.
- [ ] Explicit aliases covered by tests and README.
- [ ] SVG export and fullscreen viewer have automated + live checks.
- [ ] P6 adopt/no-go decision recorded with raw, encoded, and timing measurements.
- [ ] README/ARCH/KNOWN-LIMITATIONS/VERIFICATION agree.
- [ ] Final `.tgz` installed in an isolated profile; served route contains the
      full tarball bundle plus only the loader source-map suffix; artifact and
      response hashes recorded separately; disable/uninstall restore the baseline.
- [ ] `0.2.0` / `0.2.2-rc.1` row backed by a live regression on the final tarball.
- [ ] `npm pack --dry-run` contents and bundle SHA recorded.
- [ ] `CHANGELOG.md` added and included in the tarball.
- [ ] GitHub Release published with the tarball and evidence links.

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

## 10. Open items

These do not block P0/P1 but should be settled before P6/P7:

1. **P6 thresholds.** Confirm the cold-start and first-diagram numbers that
   count as a win on the maintainer's reference machine. The provisional rule is
   ≥200 ms or ≥200 KB `encodedBodySize` cold-start improvement, with ≤150 ms
   first-diagram regression.
2. **Registry publication after 0.2.0.** Revisit npm or GitHub Packages only
   after the GitHub Release/tarball install path is stable; 0.2.0 does not
   publish to a registry.

## 11. References

- [ARCH.md](ARCH.md) — module contracts, build contract, non-goals.
- [VERIFICATION.md](VERIFICATION.md) — current evidence and reproduction steps.
- [VERIFICATION-HISTORY.md](VERIFICATION-HISTORY.md) — historical records.
- [KNOWN-LIMITATIONS.md](KNOWN-LIMITATIONS.md) — tracked risks and follow-ups.
- [README.md](../README.md) / [README.zh.md](../README.zh.md) — install and
  behavior documentation.
