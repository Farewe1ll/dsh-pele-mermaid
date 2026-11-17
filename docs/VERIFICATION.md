# dsh-pele-mermaid — Current verification

**Status: PASS for the checks and environments listed below. The live DSH
`0.2.2` chat path is NOT verified (P0), and no `0.2.2` compatibility claim is
made.** Date: 2026-11-17 (Asia/Shanghai). Package:
`dsh-pele-mermaid@0.2.0`, working build; no package was published to a
registry.

Historical 0.1.0 and pre-repair 0.1.1 records are preserved in
[VERIFICATION-HISTORY.md](VERIFICATION-HISTORY.md); the 2026-10-19 `0.1.1`
baseline that previously lived in this file is kept as
[Appendix A](#appendix-a--historical-011-record-2026-10-19). Its old counts,
hashes and screenshots do not describe the `0.2.0` build. Current evidence is
under [`evidence/2026-11-17/`](evidence/2026-11-17/) and
[`screenshots/`](../tests/fixtures/screenshots/).

## 1. Scope: what is and is not verified

| Claim | State | Evidence |
| --- | --- | --- |
| Built bundle is fresh, single-loader, dependency-free | **Verified** | `npm run verify`: build `--check` + 7-test bundle smoke |
| Automated behavior suite passes | **Verified** | `npm test`: 120/120, 0 fail/skip/todo (section 3) |
| Installed CodeBlock (DSH `0.2.2-rc.3`) keeps its props/DOM/Copy contracts | **Verified (component probe)** | `evidence/2026-11-17/host-probe.{log,json}` (section 4) |
| Pele 1.9 visual cases, toolbar, export/viewer browser behavior | **Verified (real-browser fixture)** | `evidence/2026-11-17/visual.log`, `screenshots/` (section 5) |
| Lazy-runtime decision has measurements | **Recorded: NO-GO** | `evidence/2026-11-17/p6-measurement.json` (section 6) |
| `0.1.1` / DSH `0.2.1-rc.2` install/disable/absent behavior | **Verified historically** | Appendix A; [`evidence/manifest.json`](evidence/manifest.json) |
| `0.1.1` or `0.2.0` in a live DSH `0.2.2` conversation | **NOT verified** | P0: no screenshots/recording; consent was not granted |
| Final `0.2.0` `.tgz` install + served-route suffix + disable/uninstall | **Verified** | `evidence/2026-11-17/install.json`, `install.log` (section 7) |
| `0.2.0` live chat regression on the installed tarball | **NOT verified** | P0/P7 live step blocked (section 7) |
| Installed-route `Content-Encoding`/`encodedBodySize`/cache metrics; split prototype | **NOT measured** | P6 route caveat (section 6) |
| Exported SVG opens in a vector editor | **NOT verified** | Automated parse/sanitize assertions only |
| `0.2.1-rc.2` binding map still render-verified | **NOT currently** | Map is unit-tested only; that host bundle is not installed |

The installed Desktop profile still runs plugin `0.1.1`; it was not replaced
during this iteration.

## 2. Artifact identity and environment

| Item | Verified value |
| --- | --- |
| Package | `dsh-pele-mermaid@0.2.0` (working build, not published) |
| Bundle | `lib/client.js`, **738,710 bytes** |
| Bundle SHA-256 | `3259e916e0017a66090781493376b982ef2ab373be062bbb8795ec54cd913c82` |
| Wrapper ID | `dsh-pele-mermaid` |
| Raw budget | 750,000 bytes for the whole inline bundle; **11,290 bytes headroom** |
| Pele | `1.9.0` (exact devDependency, bundled) |
| Node / npm | `v26.13.1` / `11.20.0` |
| Installed DSH desktop runtime | `@deepseek-ai/dsh-desktop-runtime` `0.2.2-rc.3` (app.asar); `dsh` CLI `0.2.2-rc.3` |
| Installed web frontend | `0.2.2-rc.3`; asset `dsh/node_modules/@deepseek-ai/dsh-web-frontend/dist/assets/index-Ciz7DZxv.js`, 1,093,870 bytes, SHA-256 `65411dabad4de33466b12643cf30376d3d41ea1b7ce10ce329e97c89992d308b` |
| Extracted CodeBlock | SHA-256 `99afefb4fe88333ec0f28540cf0381523922abbde7559c3ca15ca43914b09839`, 2,981 bytes |
| React used by component tests | `18.3.1` |
| Browser fixture | `Chrome/157.0.8103.79` (headless=new), isolated temporary profile |
| Installed Desktop profile plugin | `0.1.1` (not replaced) |

## 3. Automated verification

### `npm test` — 120/120 PASS

```text
ℹ tests 120
ℹ pass 120
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 7465.07775
```

The behavior-based gate is met with actual totals recorded above: engine,
theme CSS, block manager, export (7 tests), viewer (13), installed-host
bindings (6), real React 18.3.1 lifecycle, and the built-bundle smoke suite
(which is also run by `npm run verify`).

### `npm run verify` — PASS

```text
step 1/2: build --check (bundle freshness): PASS
step 2/2: bundle smoke test (jsdom, real built bundle): PASS (7/7 tests)

=== bundle identity ===
file:        lib/client.js
bytes:       738,710
sha256:      3259e916e0017a66090781493376b982ef2ab373be062bbb8795ec54cd913c82
wrapper id:  "dsh-pele-mermaid" (package dsh-pele-mermaid@0.2.0)

verify: PASS — 2 steps
```

A stale bundle cannot pass: `build --check` rebuilds in memory and fails on any
byte difference before the smoke test runs.

## 4. Installed-host probe (P2) — PASS

Command: `npm run verify:host -- --output=docs/evidence/2026-11-17/host-probe.json`.
Evidence: [host-probe.log](evidence/2026-11-17/host-probe.log),
[host-probe.json](evidence/2026-11-17/host-probe.json).

| Field | Value |
| --- | --- |
| Host / binding version | `0.2.2-rc.3` |
| Supported binding versions | `0.2.1-rc.2`, `0.2.2-rc.3` |
| Frontend asset | `index-Ciz7DZxv.js`, 1,093,870 bytes, `65411dab…92d308b` |
| Component | `99afefb4…4b09839`, 2,981 bytes |
| Bundle SHA-256 | `3259e916…913c82` |
| React | `18.3.1` |
| Scope | Installed CodeBlock function with fixture styling/toolbar/visibility/tokenization adapters; **not** a live DSH session |

Six checks pass: plain banner supplies exact `lang`/`code` props across five
committed renders with mermaid-only mounting and preserved host `<pre>` parent;
unmounting removes the committed props; the card-banner branch keeps
`[data-code-block-banner]`, mounts mermaid, preserves the source parent and host
Copy; and plain/static/streaming source shapes plus host Copy preserve all but
one trailing newline.

Negative path: `tests/host-bindings.test.mjs` covers the versioned binding
layer — every supported version resolves to its audited identifier map, the
`0.2.1-rc.2` map keeps its names/wiring, the `0.2.2-rc.3` map renders a
synthetic component that references every adapter, and an unknown version
throws `UnsupportedHostError` (code `unsupported-host`) with the actionable
"update the binding map" message instead of a raw `ReferenceError`. The
`0.2.1-rc.2` map is unit-tested but no longer render-verified because that host
bundle is not installed.

## 5. Visual evidence (P1 / P4 / P5) — PASS

Command:
`DSH_VISUAL_CHROME_NO_SANDBOX=1 npm run verify:visual` (restricted sandbox;
the env var adds only `--no-sandbox --disable-setuid-sandbox` — normal runs keep
Chrome's renderer sandbox). Browser: `Chrome/157.0.8103.79`, wide viewport
1400×2400, narrow viewport 720×2200, device scale 1, `?locale=en`, bundle
SHA-256 `3259e916…913c82`. Evidence:
[visual.log](evidence/2026-11-17/visual.log) and
[`screenshots/visual-evidence.json`](../tests/fixtures/screenshots/visual-evidence.json).

Fixture: ten code-block cards = nine diagram cases (eight rendered diagrams +
one invalid fallback) + one untouched JavaScript fence. Facts asserted from live
DOM/SVG measurements: the four P1 cases (CJK wrapping with closing punctuation,
classDiagram groups on one row in the wide column and three rows at 720 px,
`List<Diagram>`/`Map<String, Diagram>`/angle-bracket text intact, and
`<sub>`/`<sup>`/`<code>`/`<kbd>`/`<samp>` runs); eight diagrams with a
four-button toolbar per diagram (32 buttons: Diagram, Source, Download SVG,
Fullscreen); colour theme flips add zero remounts; a font change adds exactly 8
re-mounts; Escape closes the viewer, focus returns, scroll lock is released;
teardown leaves zero diagrams/toolbars/overlays and restores the fixture thread.

| Screenshot | Bytes | SHA-256 |
| --- | ---: | --- |
| [Light](../tests/fixtures/screenshots/fixture-light.png) | 403,650 | `1bed9a0524b00340c03a75ae0e0343de840d848b0733ff5399252bedecb350b1` |
| [Wide P1](../tests/fixtures/screenshots/fixture-wide-p1.png) | 401,022 | `0d720c0ed4d8e5933c04102a3d28ebacefb2b24a1d0c91a795a409cabd3d3b80` |
| [Dark](../tests/fixtures/screenshots/fixture-dark.png) | 409,746 | `45a047528b2438717940c510304a70270477d4fec73cd8017b4a3aa470af35eb` |
| [Source](../tests/fixtures/screenshots/fixture-source-view.png) | 408,878 | `700b8651d331e5427f7b15efc5756f1fae6881725b83ea8e5e5f44d3e7f4153b` |
| [Viewer](../tests/fixtures/screenshots/fixture-viewer.png) | 52,355 | `00fa6f58989e116ff1e5d7bf3cfadd14af22a6c8c241d66f0ec3be6dbb4fb23b` |
| [Narrow](../tests/fixtures/screenshots/fixture-narrow.png) | 153,277 | `c099a8fbb8e7b8326790dcfdb1f4982816efbff89656e89583b65b7b308d260c` |
| [Font refresh](../tests/fixtures/screenshots/fixture-font-refresh.png) | 401,666 | `8d753c1ee9f11a3fc4d7072c64f9ef8579fa9b37b7786f179cabdb1ffb04819c` |
| [Teardown](../tests/fixtures/screenshots/fixture-teardown.png) | 361,006 | `0795a6925024e90d5ccb09f05d338f85196cb590c52141d0195bdc017dd5d0ca` |

The 720×2200 narrow capture is deliberate: at 760 px the harness content column
is ~642 px, which stays above Pele's 640 px `autoDirection` breakpoint and
keeps the three class groups on one row; 720 px gives a ~602 px column and
crosses the breakpoint, exercising the narrow-chat layout. The wide and narrow
states are asserted from measured SVG facts, not only compared as pixels. The
fixture page made no external requests for these sample inputs and recorded no
page exceptions. This is a real-browser fixture with static committed-shaped
Fiber objects, not a live DSH conversation; React lifecycle is covered
separately by the test suite.

## 6. P6 lazy-runtime decision — NO-GO for 0.2.0

Evidence: [p6-measurement.json](evidence/2026-11-17/p6-measurement.json).
Decision: **keep Pele bundled inline; do not split a lazy runtime in 0.2.0.**

| Measurement | Value |
| --- | --- |
| Bundle raw / `gzip -9` / brotli | 738,710 / 275,784 / 223,454 bytes |
| Route | local plain-HTTP, no `Content-Encoding`, `cache-control: no-cache` (NOT the installed DSH route) |
| Bundle request+eval, cold | `transferSize` 739,010; `encodedBodySize` = `decodedBodySize` = 738,710; registration by ~40 ms after navigation |
| First diagram ready, cold / warm reload | ~410.8 ms / ~367.5 ms after navigation |
| Budget | whole inline bundle 750,000 raw; met with 11,290 bytes headroom |

Rationale: measured bundle request+parse/eval cost is ~12–20 ms, while
first-diagram latency is ~368–411 ms and dominated by the fixed 150 ms scan
debounce + 180 ms settle window, so a split cannot deliver a ≥200 ms cold-start
time win on this evidence. The byte side looks material in principle
(gzip/brotli), but installed-route encoding/cache metrics and a split-prototype
first-diagram regression were not measured; the roadmap requires one consistent
metric on both sides, so the adopt rule cannot be satisfied and the default no
stands. The roadmap's reference split table is historical comparison data from
another implementation, not this plugin's measurement.

## 7. Packaging, installation, and compatibility

P7 is **partially done — packaging verified, release steps pending**. Version
`0.2.0` and `CHANGELOG.md` are in `package.json#files`, and
`scripts/verify-install.mjs` accepts `--source=<tarball>`.

The final tarball was packed and verified end to end in an isolated profile
(authoritative evidence:
[`evidence/2026-11-17/install.json`](evidence/2026-11-17/install.json),
`install.log`, and `package-dry-run.json`):

| P7 item | Verified value |
| --- | --- |
| Final tarball | `dist/dsh-pele-mermaid-0.2.0.tgz`, 295,928 bytes, SHA-256 `309aa03f57234182e7e5aa624005e70364f77e6f5c5951a10ca9b2dc84ebc96d` (not committed; `dist/` is ignored) |
| Pack contents | 9 files, 786,779 unpacked bytes: `CHANGELOG.md`, `LICENSE`, both READMEs, `cordis.patch.yml`, `docs/KNOWN-LIMITATIONS.md`, `index.js`, `lib/client.js`, `package.json` |
| Install | `DSH_HOME=<tmp> dsh plugin --profile web add <tarball>`; profile depends on the tarball (`file:…/dsh-pele-mermaid-0.2.0.tgz`) and lists the bundle layer; `dsh -V` = `0.2.2-rc.3` |
| Boot graph | entry `dsh-pele-mermaid` with `inject: ["@deepseek-ai/dsh-client-ui-theme"]` and a batch URL |
| Served route | 200, 738,783 bytes = 738,710-byte bundle (SHA-256 `3259e916…913c82`) + 73-byte loader source-map suffix `;\n//# sourceMappingURL=??dsh-pele-mermaid/client.js.map&rev=…`; artifact and response hashes are different and recorded separately |
| Disable / uninstall | disabled: entry absent, 0 occurrences in the index HTML, route 404; disabled boot graph is structurally identical to a freshly uninstalled profile (rev-normalized, 75 entries / 3 batches) |
| Cleanup | temp `DSH_HOME` removed after PASS; real `~/.dsh` untouched |

The remaining P7 items are the **live chat regression on that installed tarball**
(blocked with P0), the `0.2.0` / `0.2.2` compatibility row, the GitHub Release
with the tarball, and the `0.2.0` tag. No npm/GitHub Packages publication is
planned for 0.2.0.

Compatibility matrix (claims are per plugin/host tuple):

| Plugin | Host | Evidence | Status |
| --- | --- | --- | --- |
| 0.1.1 | 0.2.1-rc.2 | Appendix A + [`evidence/manifest.json`](evidence/manifest.json) | **Verified** (recorded 2026-10-19; 84 tests at the time) |
| 0.1.1 | 0.2.2-rc.3 | P0 — no live session evidence | **Pending** (blocked) |
| 0.2.0 | 0.2.1-rc.2 | Component/bundle tests only; no live session | **Unknown** |
| 0.2.0 | 0.2.2-rc.3 | Host probe passes; final tarball install verified (section 7); live chat session pending | **Pending** |

P0 remains blocked: a sample was posted to a running session, but desktop
screenshot consent was not granted, so no controlled live chat evidence exists.
The exact follow-up is: reproduce the P0 preconditions (Desktop profile lists the
plugin, bundled `dsh` CLI manages the profile, restart/refresh so the client
loads, fixed run directory), run the 10-case matrix from the P0 section of [ROADMAP.md](ROADMAP.md) on
`0.1.1`, record `docs/VERIFICATION-0.2.2.md` with plugin/host/frontend/bundle
hashes and screenshots, and only then promote a host row. Repeat it on the final
`0.2.0` tarball.

Done in this iteration: final `npm pack` dry-run and tarball, isolated tarball
install, served-route suffix check, disable/uninstall baseline for `0.2.0`.
Not done: live chat regression on the tarball, GitHub Release, `0.2.0` tag, and
npm/GitHub Packages publication (not planned for 0.2.0).

## 8. Reproduce

Run from the repository with the lockfile dependencies installed. Commands were
run on macOS, Node `v26.13.1`, npm `11.20.0`, Chrome `157.0.8103.79`.

```sh
npm test
npm run verify
npm run verify:host -- --output=docs/evidence/2026-11-17/host-probe.json
DSH_VISUAL_CHROME_NO_SANDBOX=1 npm run verify:visual   # restricted sandbox only
npm pack --dry-run --json --cache /tmp/npm-cache-dsh > docs/evidence/2026-11-17/package-dry-run.json
npm pack --json --cache /tmp/npm-cache-dsh --pack-destination dist
node scripts/verify-install.mjs --source=dist/dsh-pele-mermaid-0.2.0.tgz \
  --output=docs/evidence/2026-11-17/install.json
```

`npm run verify:visual` regenerates the eight PNGs and
`visual-evidence.json`. Set `CHROME_BIN` to use another Chrome/Chromium
binary; the temporary profile and loopback server are cleaned up afterwards. A
later code/build change requires fresh evidence for affected checks; a later
host upgrade requires revalidating the private integration and the binding map.

---

## Appendix A — Historical 0.1.1 record (2026-10-19)

> Historical baseline: these sections describe the `0.1.1` working build on DSH
> `0.2.1-rc.2` as recorded on 2026-10-19, not the current `0.2.0` build. The
> screenshot paths were later reused by new captures; the sizes/hashes below
> identify the old PNGs and not the current files. Acceptance for the current
> build is sections 1–8 above.

### A.1 Artifact identity and environment

| Item | Verified value |
| --- | --- |
| Git base | `0839b1ac01349b8ac1aefa775d21ca302f50ceff`, plus uncommitted changes |
| Bundle | `lib/client.js`, 694,058 bytes |
| Bundle SHA-256 | `ba5b29085cac5c6f3fe34b2e76e5b00744b191f7c98877700982ddad90a8a1e4` |
| Wrapper ID | `dsh-pele-mermaid` |
| Node / npm | `v24.22.0` / `11.19.1` |
| Installed DSH / frontend | `0.2.1-rc.2` |
| React / React DOM used in component tests | `18.3.1` / `18.3.1` |
| Pele | `1.6.0` |
| Browser fixture | `Chrome/155.0.8059.85`, isolated headless profile |

[`manifest.json`](evidence/manifest.json) records the product source, lockfile,
test, script, documentation and evidence hashes. Its source snapshot identifies
the working code beyond the Git base commit. Host, install and visual JSON all
identify the same bundle above. The final build freshness check also passed
after a source-comment clarification; it did not change the bundle bytes.

### A.2 Acceptance results and their scope

| Area | Result and evidence | Scope |
| --- | --- | --- |
| Automated suite | **84/84**, no skips or failures; [tests.log](evidence/tests.log) | Engine, CSS, DOM manager, real React lifecycle and built bundle; test count is a result, not the acceptance criterion. |
| Built artifact | Fresh build comparison and **7/7** bundle tests; [bundle-verify.log](evidence/bundle-verify.log), [build-freshness.log](evidence/build-freshness.log) | Actual `lib/client.js` evaluated in jsdom, including generic-banner cards with real React. These 7 tests are also included in the 84 above. |
| Language / committed state | Real React update, memo bailout, suspended work and deep-tree tests; [host-codeblock.json](evidence/host-codeblock.json) | Explicit committed props take precedence. When unavailable, an explicit DOM banner is required; unknown source is not guessed. |
| Copy | Plain, streamed and nested static-pre tests compare native Copy with plugin Diagram/Source states | The baseline is the same host state, including removal of exactly one trailing newline. It is not the raw `code` prop. |
| DOM lifecycle | Source-only updates, replacements, language reuse, innerHTML replacement, unmount and post-disposal updates pass | Original source parents are retained. Cleanup preserves latest host content, releases handles and does not resurrect obsolete nodes. |
| Image restriction | Remote, relative and root-relative `img` cases render successfully without SVG image nodes or the supplied image URLs, including refresh | Engine tests exercise `images: false`; filtered links remain user-activated navigation. This is not a complete sandbox audit. |
| Installation / disabled state | **PASS**; [install.json](evidence/install.json) | Real DSH CLI, isolated web profile and pnpm store. Checks config, boot graph and served bytes; does not exercise a chat. |
| Browser | **PASS**; [visual-evidence.json](../tests/fixtures/screenshots/visual-evidence.json), [visual.log](evidence/visual.log) | Static committed-shape Fiber fixture, real bundle and copied DSH tokens; React lifecycle is tested separately. |
| Packaging | **PASS**; [package-dry-run.json](evidence/package-dry-run.json) | `npm pack --dry-run`: 8 files, 270,409 compressed / 718,655 unpacked bytes reported; includes the bundle and known limitations. No tarball publication. |

The installed-host probe read the CodeBlock function from
`dsh/node_modules/@deepseek-ai/dsh-web-frontend/dist/assets/index-CN7NIWNw.js`
inside the installed app archive. Extracted component SHA-256:
`3ec423c4bd570d98d05fa70c9d27c79d473a7de539631a288d9f4a1950e3c557`.
It executed that function unchanged with real React. Styling, toolbar,
visibility activation and tokenization helpers were fixture adapters. Its
mount/update/language/unmount checks used a stub diagram engine; the separate
bundle test ran Pele. The probe checked native Copy/shapes, while the portable
React lifecycle tests checked plugin-before/after Copy parity across all three
shapes. These complementary checks did not establish whole-application timing,
failure frequency or future private-Fiber compatibility.

### A.3 Isolated installation

The active boot graph contained 70 entries and 3 batches, including the plugin.
Its route returned HTTP 200 with **694,131 bytes**: the exact 694,058-byte bundle
plus a 73-byte loader source-map suffix. With the row disabled, the graph had
69 entries, the HTML contained zero plugin-ID occurrences, and the route
returned HTTP 404. The disabled and fully removed boot graphs compared equal
after only per-boot `rev` values were normalized.

Every DSH invocation used a temporary `DSH_HOME` and pnpm store. The successful
run stopped its servers and removed its temporary directory; `install.json`
records `cleanup.tempRemoved: true`. No daily DSH or browser profile was used by
this repair's verification. Reading the installed app archive is separate from
accessing a user profile. Earlier Desktop work belongs to the historical record
and has a different scope.

### A.4 Browser evidence

All five captures and their JSON were regenerated together for the bundle in
A.1. Viewport: **1400 × 2400**, device scale 1, query `?locale=en`. Host
banners were `代码块`; plugin toolbar labels were `Diagram` / `Source`. The
initial page had four diagrams (flowchart, sequence, pie, gantt), one error
fallback, and one unchanged JavaScript fence. Theme switching left the SVG
mount count at 4; font refresh raised it to 8. Source toggle preserved the
original pre parent. Teardown left zero plugin SVGs/styles and restored the
fixture thread byte-for-byte **because this fixture had no host source update**.
Dynamic cleanup used the latest-state assertions in the React tests instead.

| Screenshot | Bytes | SHA-256 |
| --- | ---: | --- |
| [Light](../tests/fixtures/screenshots/fixture-light.png) | 329,773 | `5965ac067fc5080225e34f447747751330c3227516980316a02ca6867fc697ef` |
| [Dark](../tests/fixtures/screenshots/fixture-dark.png) | 334,247 | `5e3d61f3b5f782935489d3290297a54e938c361079e1da6d562c2eae456aa9e8` |
| [Source](../tests/fixtures/screenshots/fixture-source-view.png) | 333,159 | `3ec8e53c6b1a4eefcd4b1cfd31629f29462b190e37b138a31927c790b5e2c30a` |
| [Font refresh](../tests/fixtures/screenshots/fixture-font-refresh.png) | 334,373 | `9485ea065a8520f3551fbf050bcda00f2ffd2b43cfd9e44eac94ce285638508b` |
| [Teardown](../tests/fixtures/screenshots/fixture-teardown.png) | 232,311 | `9fa616176b945e212ee0915f00c9640eecfa65234ff1138b3075424acb8fdc87` |

All five PNGs were visually inspected at the time: diagrams, toolbar, error
fallback, source view and teardown were legible, with no apparent overlapping or
clipped content in this viewport. The browser recorded no uncaught exceptions
and no external page requests for these sample inputs. That network observation
does not cover every diagram type, clicked links or the host's own requests.

### A.5 Changes covered and remaining work (as of 2026-10-19)

| Review item | Current handling |
| --- | --- |
| #1 / #5 | Source-language guessing and its ignored-candidate cache are removed; explicit language changes are tested. |
| #2 | Source stays in its host-owned position; dynamic updates/replacement/cleanup are covered with real React. Whole-host incident frequency was not measured. |
| #3 | Diagram images are disabled and tested; resource-policy claims are scoped. |
| #4 | A stale-alternate props bug found during real React validation is fixed; committed-root checks and version-targeted tests replace reliance on static Fiber fixtures alone. |
| #6 | Built-bundle E2E now covers real React generic cards, current props, source updates, Copy and language reuse. |
| #7 | Current artifact and visual evidence are refreshed, ARCH matches implementation, old records are labeled historical, and remaining risks have a separate register. |

[KNOWN-LIMITATIONS.md](KNOWN-LIMITATIONS.md) tracked private Fiber
compatibility, per-record settle timers/full scans, the added 1 s props audit and
throttling, the existing scan/font-refresh race, missing Pele font-size mapping,
host DOM evolution, resource-policy scope and the 180 ms streaming stability
window. They were not silently converted into resolved issues by this PASS
status.

### A.6 Reproduce (2026-10-19 baseline)

Run from the repository with the lockfile dependencies installed. Host and
visual checks used macOS, the installed DSH app, and the Node/Chrome versions
above.

```sh
npm run build
npm test
npm run verify
node scripts/verify-host.mjs --output=docs/evidence/host-codeblock.json
node scripts/verify-install.mjs --output=docs/evidence/install.json
npm run verify:visual
npm pack --dry-run --json --cache /private/tmp/dsh-pele-npm-cache
```

`DSH_APP_ASAR`, `DSH_BIN` and `CHROME_BIN` override the corresponding local
tools. A later code/build change requires fresh evidence for affected checks;
a later host upgrade requires revalidating the private integration.
