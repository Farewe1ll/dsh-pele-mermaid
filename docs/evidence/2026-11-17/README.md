# Evidence — 2026-11-17 (dsh-pele-mermaid 0.2.0 iteration)

Raw evidence for the 0.2.0 implementation pass. Prose records are in
[`docs/VERIFICATION.md`](../../VERIFICATION.md) and
[`docs/ROADMAP.md`](../../ROADMAP.md); this directory only holds the machine
outputs and links the exact commands that produced them.

| File | What it records | Command |
| --- | --- | --- |
| `host-probe.log` | installed-host probe stdout, including the PASS JSON (DSH `0.2.2-rc.3`, frontend asset `index-Ciz7DZxv.js`, component and bundle hashes, six checks) | `npm run verify:host -- --output=docs/evidence/2026-11-17/host-probe.json` |
| `host-probe.json` | the probe's structured evidence object (same run) | same command |
| `visual.log` | real-browser fixture run: 8 rendered diagrams + 1 invalid fallback, 4-control toolbar, viewer open/Escape/focus, narrow-column P1 facts, 8 screenshot sizes/hashes, no exceptions or error-level console messages | `DSH_VISUAL_CHROME_NO_SANDBOX=1 npm run verify:visual` |
| `p6-measurement.json` | P6 lazy-runtime decision gate: final bundle sizes (raw/gzip/brotli), local plain-HTTP `PerformanceResourceTiming`, first-diagram timing, recorded NO-GO rationale | ad-hoc local measurement (see the JSON's `route`/`measurements` fields) |
| `package-dry-run.json` | `npm pack --dry-run --json`: 9 packed files and sizes (includes `CHANGELOG.md` and `lib/client.js`) | `npm pack --dry-run --json --cache /tmp/npm-cache-dsh > docs/evidence/2026-11-17/package-dry-run.json` |
| `install.json` | final `.tgz` installed in an isolated `DSH_HOME` web profile: tarball SHA-256, bundle SHA-256, boot graph entry, served route 200 with 738,783 bytes (bundle + 73-byte loader suffix), disabled route 404, rev-normalized parity with an uninstalled profile, temp-home cleanup | `node scripts/verify-install.mjs --source=dist/dsh-pele-mermaid-0.2.0.tgz --output=docs/evidence/2026-11-17/install.json` |
| `install.log` | full console transcript of the isolated install verification | same command (stdout/stderr captured) |

Identities for this iteration:

- Final bundle: `lib/client.js`, 738,710 bytes, SHA-256
  `3259e916e0017a66090781493376b982ef2ab373be062bbb8795ec54cd913c82`.
- Final tarball: `dist/dsh-pele-mermaid-0.2.0.tgz`, 295,928 bytes, SHA-256
  `309aa03f57234182e7e5aa624005e70364f77e6f5c5951a10ca9b2dc84ebc96d`
  (tarballs are not committed; `dist/` is ignored).
- Screenshots live in [`tests/fixtures/screenshots/`](../../../tests/fixtures/screenshots/)
  with per-file sizes/hashes in `visual-evidence.json`.

Not recorded here (and not claimed anywhere): a controlled live DSH chat session
on `0.2.2-rc.3` (P0) and a live regression of the final tarball. Desktop
screenshot consent was not granted for the sample that was posted, so no live
screenshot/recording exists. That gap is tracked in VERIFICATION.md section 7,
KNOWN-LIMITATIONS L10, and ROADMAP open item 1.
