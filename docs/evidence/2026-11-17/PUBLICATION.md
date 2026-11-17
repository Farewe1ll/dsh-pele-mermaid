# Evidence and publication record — 2026-11-17 (`0.2.0` iteration)

Execution date: 2026-11-17. Status: committed in
`e59a2945bc085b27420c13eda0b836afaeee500d` (superseding the initial `0.2.0`
pass in `15c30e9bb1ce84bb505c5e48776f2884ac9571b7`). Prose verification
summaries live in [`docs/VERIFICATION.md`](../../VERIFICATION.md) and
[`docs/ROADMAP.md`](../../ROADMAP.md); this directory holds the machine outputs
and provenance metadata.

## 1. Retained evidence inventory in `HEAD`

| File | Bytes | SHA-256 | What it records / producing command |
| --- | ---: | --- | --- |
| `host-probe.json` | 1,433 | `d51e524a69d8aed240536245a603cdaebc97532e69c58942735ae7232a7a4947` | Structured installed-host probe output (DSH `0.2.2-rc.3`, frontend asset `index-Ciz7DZxv.js`, component and bundle hashes, six checks): `npm run verify:host -- --output=docs/evidence/2026-11-17/host-probe.json` |
| `p6-measurement.json` | 4,761 | `de728a9c19efb45521657f0ee19c082f200943d913df2a2d9f4137eaca7fe853` | P6 lazy-runtime decision gate: final bundle sizes (raw/gzip/brotli), local plain-HTTP `PerformanceResourceTiming`, first-diagram timing, recorded NO-GO rationale |
| `package-dry-run.json` | 1,260 | `4ea6fa23bae49005555e697f97dbf6e422bdb31c515a2287d5efdee843bf7725` | `npm pack --dry-run --json --cache /tmp/npm-cache-dsh`: 9 packed files and sizes (includes `CHANGELOG.md` and `lib/client.js`) |
| `install.json` | 3,239 | `71b8aa79a0195e6417e1731aba4989825b49141f967b59327df844bd186a748c` | Final `.tgz` installed in an isolated `DSH_HOME` web profile: tarball SHA-256, bundle SHA-256, boot graph entry, served route 200 with 739,599 bytes (bundle + 73-byte loader suffix), disabled route 404, rev-normalized parity with an uninstalled profile, temp-home cleanup: `node scripts/verify-install.mjs --source=dist/dsh-pele-mermaid-0.2.0.tgz --output=docs/evidence/2026-11-17/install.json` |
| `install.log` | 10,850 | `3efef40b6573cd345837d780c000c63e9bc18172b0f3215b6ef0984322c079b7` | Full console transcript of the isolated install verification (ephemeral cookie names redacted) |

Visual captures (10 PNGs) and the full structured report (`visual-evidence.json`,
70,029 bytes, SHA-256 `6e55efbe3716f7e49e81239a75f9d3be69c06dc457d293dbca16199733610018`)
live in [`tests/fixtures/screenshots/`](../../../tests/fixtures/screenshots/).

Not recorded here (and not claimed anywhere): a controlled live DSH chat session
on `0.2.2-rc.3` (P0) and a live regression of the final tarball. Desktop
screenshot consent was not granted for the sample that was posted, so no live
screenshot/recording exists.

## 2. Deduplicated console logs (retrievable from Git commit `e59a294`)

Two console wrapper logs originally committed in
`e59a2945bc085b27420c13eda0b836afaeee500d` were removed from `HEAD` after
verifying that their structured counterparts carry the full verification data:

| Removed path | Bytes | SHA-256 | Retrieval command and relationship to retained JSON |
| --- | ---: | --- | --- |
| `docs/evidence/2026-11-17/host-probe.log` | 1,553 | `1bb01ff1751b57d952403e39fb060891c8678e5e157cb4ab426e14557d390a2b` | `git show e59a2945bc085b27420c13eda0b836afaeee500d:docs/evidence/2026-11-17/host-probe.log` — 3-line npm script banner followed by a JSON payload byte-identical to `host-probe.json`. |
| `docs/evidence/2026-11-17/visual.log` | 1,923 | `b5c5e0a1355b28723d6c46a195da12cdef8a3f9e344f39cffc5383eb42cb1dce` | `git show e59a2945bc085b27420c13eda0b836afaeee500d:docs/evidence/2026-11-17/visual.log` — 3-line npm script banner followed by the terminal summary JSON of `verify-visual.mjs`; all fields are recoverable from `tests/fixtures/screenshots/visual-evidence.json` (`consoleErrors` corresponds to `console.errors` in `visual-evidence.json`). |

## 3. Run identities on 2026-11-17

Two `0.2.0` builds were evaluated on 2026-11-17 and wrote into this directory
and `tests/fixtures/screenshots/`:

| Build pass | Commit | `lib/client.js` bytes / SHA-256 | Packed `.tgz` bytes / SHA-256 | Visual captures |
| --- | --- | --- | --- | --- |
| Initial `0.2.0` pass | `15c30e9bb1ce84bb505c5e48776f2884ac9571b7` | `738,710` / `3259e916e0017a66090781493376b982ef2ab373be062bbb8795ec54cd913c82` | `295,928` / `309aa03f57234182e7e5aa624005e70364f77e6f5c5951a10ca9b2dc84ebc96d` | 8 PNGs |
| Post-review fix pass (current) | `e59a2945bc085b27420c13eda0b836afaeee500d` | `739,526` / `906b1cc2f77c99a41e8453d85bd1554e60ff36b7a9d12558b3e998a56f1ea4af` | `297,759` / `824a8e06d5442f63cda6ef34efd96874a7f065b5820b4574b2e6941fe4acc630` | 10 PNGs |

All files currently in `docs/evidence/2026-11-17/` and
`tests/fixtures/screenshots/` belong to the post-review `e59a294` build. To
retrieve the earlier `15c30e9` evidence files, use
`git show 15c30e9bb1ce84bb505c5e48776f2884ac9571b7:<repository-path>`. Future
runs use distinct `<run-id>` directories rather than reusing a date-only
directory.

## 4. Served route response digest (post-hoc derivation)

In [`install.json`](install.json), `scripts/verify-install.mjs` recorded:

- `bundle.bytes`: `739526`
- `bundle.sha256`: `906b1cc2f77c99a41e8453d85bd1554e60ff36b7a9d12558b3e998a56f1ea4af`
- `active.route.bytes`: `739599`
- `active.route.servedOverCommittedBytes`: `73`
- `active.route.suffix`: `;\n//# sourceMappingURL=??dsh-pele-mermaid/client.js.map&rev=203a6529fd35\n`

The script verified that the served HTTP 200 body started with `lib/client.js`
and ended with that exact 73-byte suffix, but did not write a separate
`active.route.sha256` field at capture time. Concatenating the exact
739,526-byte `lib/client.js` buffer with the recorded 73-byte UTF-8 suffix
deterministically reconstructs the 739,599-byte response body served during that
run:

- **Derived `active.route.sha256` (post-hoc reconstruction from recorded inputs):**
  `60ad9cf4fba565addd573d30275d0a656944ac64079926169ad65881c304304e`

Note: `rev` (`203a6529fd35`) is a per-boot loader identifier assigned by DSH, so
a subsequent boot produces a different suffix `rev` and a different response
digest even for the same `lib/client.js`. `scripts/verify-install.mjs` now
records `active.route.sha256` directly from the raw response buffer on new runs.

## 5. Publication and path review scope

- `install.log` had its ephemeral `dsh-auth-<id>` cookie names replaced with
  `dsh-auth-<redacted>` prior to commit `15c30e9` / `e59a294`.
- `install.json` and `install.log` retain the workspace path and the deleted
  `os.tmpdir()` path (`cleanup.tempRemoved: true`) as committed in `e59a294`.
  To preserve the committed evidence bytes and hashes referenced by the `0.2.0`
  verification report, those files are kept unchanged in place.
- As with the 2026-10-19 batch, retaining these already-committed paths applies
  only to this historical record and does not waive review or path normalization
  for future runs.
