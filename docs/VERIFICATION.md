# dsh-pele-mermaid — Current verification

**Status: PASS for the checks and environments recorded below.**
Date: 2026-10-19 (Asia/Shanghai). Package: `dsh-pele-mermaid@0.1.1`, uncommitted
working build; no package was published. This is not a fresh end-to-end test of
a full live Desktop conversation or a claim of compatibility with other host versions.

Historical 0.1.0 and pre-repair 0.1.1 records are preserved in
[VERIFICATION-HISTORY.md](VERIFICATION-HISTORY.md). Their old counts, hashes and
screenshots do not describe this build. Current evidence is under
[evidence/](evidence/) and [screenshots/](../tests/fixtures/screenshots/).

## 1. Artifact identity and environment

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

[manifest.json](evidence/manifest.json) records the product source, lockfile,
test, script, documentation and evidence hashes. Its source snapshot identifies
the working code beyond the Git base commit. Host, install and visual JSON all
identify the same bundle above. The final build freshness check also passed
after a source-comment clarification; it did not change the bundle bytes.

## 2. Acceptance results and their scope

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

The installed-host probe reads the CodeBlock function from
`dsh/node_modules/@deepseek-ai/dsh-web-frontend/dist/assets/index-CN7NIWNw.js`
inside the installed app archive. Extracted component SHA-256:
`3ec423c4bd570d98d05fa70c9d27c79d473a7de539631a288d9f4a1950e3c557`.
It executes that function unchanged with real React. Styling, toolbar,
visibility activation and tokenization helpers are fixture adapters. Its
mount/update/language/unmount checks use a stub diagram engine; the separate
bundle test runs Pele. The probe checks native Copy/shapes, while the portable
React lifecycle tests check plugin-before/after Copy parity across all three
shapes. These complementary checks do not establish whole-application timing,
failure frequency or future private-Fiber compatibility.

## 3. Isolated installation

The active boot graph contains 70 entries and 3 batches, including the plugin.
Its route returns HTTP 200 with **694,131 bytes**: the exact 694,058-byte bundle
plus a 73-byte loader source-map suffix. With the row disabled, the graph has
69 entries, the HTML contains zero plugin-ID occurrences, and the route returns
HTTP 404. The disabled and fully removed boot graphs compare equal after only
per-boot `rev` values are normalized.

Every DSH invocation uses a temporary `DSH_HOME` and pnpm store. The successful
run stopped its servers and removed its temporary directory; `install.json`
records `cleanup.tempRemoved: true`. No daily DSH or browser profile was used
by this repair's verification. Reading the installed app archive is separate
from accessing a user profile. Earlier Desktop work belongs to the historical
record and has a different scope.

## 4. Browser evidence

All five captures and their JSON were regenerated together for the bundle in
section 1. Viewport: **1400 × 2400**, device scale 1, query `?locale=en`.
Host banners are `代码块`; plugin toolbar labels are `Diagram` / `Source`.
The initial page has four diagrams (flowchart, sequence, pie, gantt), one error
fallback, and one unchanged JavaScript fence. Theme switching leaves the SVG
mount count at 4; font refresh raises it to 8. Source toggle preserves the
original pre parent. Teardown leaves zero plugin SVGs/styles and restores the
fixture thread byte-for-byte **because this fixture has no host source update**.
Dynamic cleanup uses the latest-state assertions in the React tests instead.

| Screenshot | Bytes | SHA-256 |
| --- | ---: | --- |
| [Light](../tests/fixtures/screenshots/fixture-light.png) | 329,773 | `5965ac067fc5080225e34f447747751330c3227516980316a02ca6867fc697ef` |
| [Dark](../tests/fixtures/screenshots/fixture-dark.png) | 334,247 | `5e3d61f3b5f782935489d3290297a54e938c361079e1da6d562c2eae456aa9e8` |
| [Source](../tests/fixtures/screenshots/fixture-source-view.png) | 333,159 | `3ec8e53c6b1a4eefcd4b1cfd31629f29462b190e37b138a31927c790b5e2c30a` |
| [Font refresh](../tests/fixtures/screenshots/fixture-font-refresh.png) | 334,373 | `9485ea065a8520f3551fbf050bcda00f2ffd2b43cfd9e44eac94ce285638508b` |
| [Teardown](../tests/fixtures/screenshots/fixture-teardown.png) | 232,311 | `9fa616176b945e212ee0915f00c9640eecfa65234ff1138b3075424acb8fdc87` |

All five PNGs were visually inspected: diagrams, toolbar, error fallback,
source view and teardown are legible, with no apparent overlapping or clipped
content in this viewport. The browser recorded no uncaught exceptions and no
external page requests for these sample inputs. That network observation does
not cover every diagram type, clicked links or the host's own requests.

## 5. Changes covered and remaining work

| Review item | Current handling |
| --- | --- |
| #1 / #5 | Source-language guessing and its ignored-candidate cache are removed; explicit language changes are tested. |
| #2 | Source stays in its host-owned position; dynamic updates/replacement/cleanup are covered with real React. Whole-host incident frequency was not measured. |
| #3 | Diagram images are disabled and tested; resource-policy claims are scoped. |
| #4 | A stale-alternate props bug found during real React validation is fixed; committed-root checks and version-targeted tests replace reliance on static Fiber fixtures alone. |
| #6 | Built-bundle E2E now covers real React generic cards, current props, source updates, Copy and language reuse. |
| #7 | Current artifact and visual evidence are refreshed, ARCH matches implementation, old records are labeled historical, and remaining risks have a separate register. |

[KNOWN-LIMITATIONS.md](KNOWN-LIMITATIONS.md) tracks private Fiber compatibility,
per-record settle timers/full scans, the added 1 s props audit and throttling,
the existing scan/font-refresh race, missing Pele font-size mapping, host DOM
evolution, resource-policy scope and the 180 ms streaming stability window.
They are not silently converted into resolved issues by this PASS status.

## 6. Reproduce

Run from the repository with the lockfile dependencies installed. Host and visual
checks here used macOS, the installed DSH app, and the Node/Chrome versions above.

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
