# Viewer stage verification — publication record

Execution and review: 2026-11-17 (Asia/Shanghai). Local repository evidence;
no registry publication, GitHub release, or installed Desktop update performed.

## Identity and scope

Base commit: `a5a223660caf156259fc9c6beac1eaaec333301c` plus the working-tree viewer/test changes identified by
source SHA-256 in `verification.json`. Final bundle: 739,631 bytes,
`48fb4f4f019e8107ef3a0f4db55edc36997ef66599c31de16d6c2af1c2e2c74f`.
The comparison baseline uses `git show HEAD:lib/client.js` at that base commit,
SHA-256 `906b1cc2f77c99a41e8453d85bd1554e60ff36b7a9d12558b3e998a56f1ea4af`.
Both comparisons used Chrome/157.0.8103.79, the same fixture, and four zoom-in
clicks (1.25^4 relative to fit). The comparison harness intercepted only the
fixture bundle request to supply the selected bytes without changing disk files.

`npm test`: 147 passed; viewer-specific tests: 24 passed. `npm run verify` passed
before and after browser capture, with the same final bundle hash.
`npm run verify:visual -- --run-id=viewer-stage-reviewed-20261117`: exit 0,
14 screenshots, no console errors. Existing export, theme, lifecycle and narrow
fixture assertions passed. New geometry assertions cover wide/tall/ordinary
figures at 1400×900 and 1400×500, fit/zoom/real drag, then resize +100 px while open.
Unit tests cover pointer anchors, both axis states, fit drag no-op, invalid
measurements/recovery, axis flip, resize centering/clamping and capture release.
The installed DSH application and tarball install were not tested or changed.

## Reviewed public files

`verification.json` is a selected derivative of the raw reports: it retains
bundle/source identity, geometry, live-theme observations, comparison geometry
and screenshot hashes. Full unrelated fixture inventories and nonselected
screenshots are omitted. The four PNGs are byte-for-byte originals from the
Chrome comparison runs, visually reviewed; they contain only synthetic fixture
content. No personal paths were found in the selected reports. `manifest.json`
records the exact retrievable public files and their byte lengths/hashes.
Historical frozen evidence and screenshots are untouched.

Raw reports remain ignored local staging artifacts (not public retrieval links):

- `.artifacts/viewer-stage-reviewed-20261117/visual-evidence.json`: 157516 bytes, SHA-256 `3e8c544f001f3204274214b8c0fbc2e6609ab0fb5f7a4a65086d80ac3787198d`.
- `.artifacts/viewer-comparison-chrome-before/evidence.json`: 4848 bytes, SHA-256 `ecedac509f97333f4a82e592938e96d946d2b06e67527c35f1830a0f8cec0380`.
- `.artifacts/viewer-comparison-chrome-after/evidence.json`: 4795 bytes, SHA-256 `8e3698ecad1610d2a1d67ddb67111a1b3032a5dfacc9737ee20509981228db45`.

The early Moli attempt returned zero geometry at viewer-open time; its captures
were excluded. The first Chrome run passed assertions but exited nonzero during
temporary-profile cleanup. Neither attempt is represented as a successful final
run. The reviewed run above passed after bounded cleanup retries were added.

## Comparison

At 1400×500, the wide diagram's SVG viewport expands from 1318×218.844 to
1318×377. At 1400×900, the tall diagram's viewport expands from 329.516×777
to 1318×777. Diagram proportions remain unchanged; zoom uses the extra space.

| Case | Before | After |
| --- | --- | --- |
| Wide, short window | [Before](before-wide-500-zoom.png) | [After](after-wide-500-zoom.png) |
| Tall, desktop window | [Before](before-tall-900-zoom.png) | [After](after-tall-900-zoom.png) |
