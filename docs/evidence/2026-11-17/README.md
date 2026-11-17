# Evidence — 2026-11-17 (dsh-pele-mermaid 0.2.0 iteration)

Raw evidence for the 0.2.0 implementation pass. Prose records are in
[`docs/VERIFICATION.md`](../../VERIFICATION.md) and
[`docs/ROADMAP.md`](../../ROADMAP.md); this directory only holds the machine
outputs and links the exact commands that produced them.

| File | What it records | Command |
| --- | --- | --- |
| `host-probe.log` | installed-host probe stdout, including the PASS JSON (DSH `0.2.2-rc.3`, frontend asset `index-Ciz7DZxv.js`, component and bundle hashes, six checks) | `npm run verify:host -- --output=docs/evidence/2026-11-17/host-probe.json` |
| `host-probe.json` | the probe's structured evidence object (same run) | same command |
| `visual.log` | real-browser fixture run: 8 rendered diagrams + 1 invalid fallback, 4-control toolbar, viewer open/zoom/Escape/focus, **viewer theme switch while open**, **downloaded SVG backgrounds in light and dark + the dark file rendered on a white stand-in page**, narrow-column P1 facts, 10 screenshot sizes/hashes, no exceptions or error-level console messages | `DSH_VISUAL_CHROME_NO_SANDBOX=1 npm run verify:visual` |
| `p6-measurement.json` | P6 lazy-runtime decision gate: final bundle sizes (raw/gzip/brotli), local plain-HTTP `PerformanceResourceTiming`, first-diagram timing, recorded NO-GO rationale | ad-hoc local measurement (see the JSON's `route`/`measurements` fields) |
| `package-dry-run.json` | `npm pack --dry-run --json`: 9 packed files and sizes (includes `CHANGELOG.md` and `lib/client.js`) | `npm pack --dry-run --json --cache /tmp/npm-cache-dsh > docs/evidence/2026-11-17/package-dry-run.json` |
| `install.json` | final `.tgz` installed in an isolated `DSH_HOME` web profile: tarball SHA-256, bundle SHA-256, boot graph entry, served route 200 with 739,599 bytes (bundle + 73-byte loader suffix), disabled route 404, rev-normalized parity with an uninstalled profile, temp-home cleanup | `node scripts/verify-install.mjs --source=dist/dsh-pele-mermaid-0.2.0.tgz --output=docs/evidence/2026-11-17/install.json` |
| `install.log` | full console transcript of the isolated install verification (ephemeral cookie names redacted) | same command (stdout/stderr captured) |

Identities for this iteration (post-review final build):

- Final bundle: `lib/client.js`, **739,526 bytes**, SHA-256
  `906b1cc2f77c99a41e8453d85bd1554e60ff36b7a9d12558b3e998a56f1ea4af`
  (10,474 bytes under the 750,000-byte raw budget).
- Final tarball: `dist/dsh-pele-mermaid-0.2.0.tgz`, **297,759 bytes**, SHA-256
  `824a8e06d5442f63cda6ef34efd96874a7f065b5820b4574b2e6941fe4acc630`
  (tarballs are not committed; `dist/` is ignored).
- Served plugin route: `200`, **739,599 bytes** = the 739,526-byte bundle plus
  the 73-byte loader source-map suffix.
- Screenshots live in [`tests/fixtures/screenshots/`](../../../tests/fixtures/screenshots/)
  with per-file sizes/hashes in `visual-evidence.json` (10 PNGs, including the
  P1 narrow-column capture, the dark viewer, and the downloaded dark SVG on a
  white page).

Not recorded here (and not claimed anywhere): a controlled live DSH chat session
on `0.2.2-rc.3` (P0) and a live regression of the final tarball. Desktop
screenshot consent was not granted for the sample that was posted, so no live
screenshot/recording exists. That gap is tracked in VERIFICATION.md section 7,
KNOWN-LIMITATIONS L10, and ROADMAP open item 1.
