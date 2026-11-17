# Publication record for the 2026-10-19 evidence (`0.1.1` baseline)

Archival review: 2026-11-10. Status: delivered in commit
`a8197776c879ca60af2e2d7800b67e60dd014d92` (14/14 `evidenceFiles` and 6/6
`documentationFiles` match the historical manifest at that snapshot) and
archived out of `HEAD` after verifying full restoration and manifest checking
from that immutable commit.

## 1. Historical manifest and 14-file evidence locator (`a819777`)

The `2026-10-19` `0.1.1` verification manifest (`docs/evidence/manifest.json`,
8,462 bytes, SHA-256
`5b2e95b480d7992af5a5ee56b917fd1c1b7a950b77b1f850de1daf81360b8e5b`) and all 14
of its `evidenceFiles` are preserved verbatim in commit
`a8197776c879ca60af2e2d7800b67e60dd014d92`:

| Repository path in `a8197776c879ca60af2e2d7800b67e60dd014d92` | Bytes | SHA-256 | Notes |
| --- | ---: | --- | --- |
| `docs/evidence/manifest.json` | 8,462 | `5b2e95b480d7992af5a5ee56b917fd1c1b7a950b77b1f850de1daf81360b8e5b` | Historical schema v1 manifest (`0.1.1` on DSH `0.2.1-rc.2`, bundle `ba5b2908…`) |
| `docs/evidence/build-freshness.log` | 47 | `41a38af22c727b8b10e251ef5b8759606a85863573be5a4860129f430c74f7f4` | Separate 60 ms `build --check` run after the final source-comment clarification (distinct from the 104 ms check inside `bundle-verify.log`) |
| `docs/evidence/bundle-verify.log` | 1,789 | `5794eb08f2b81b62eba9a47a1ab464efece7c83d615754084c0e10db797efbd3` | `npm run verify` output (104 ms `build --check` + 7/7 bundle tests) |
| `docs/evidence/host-codeblock.json` | 1,033 | `cfbfddda6af7721705b1517b7ce59d9711b1d56293ecfc4e2389e7a278427aa5` | Installed `0.2.1-rc.2` CodeBlock probe JSON |
| `docs/evidence/host-probe.log` | 1,033 | `cfbfddda6af7721705b1517b7ce59d9711b1d56293ecfc4e2389e7a278427aa5` | Byte-identical duplicate of `host-codeblock.json` in the original inventory |
| `docs/evidence/install.json` | 3,015 | `d442e182ec5f714db474c5f7ece7d30ff98426b9567c6bc556d051dbef888e94` | Isolated web-profile install/disable/remove record (`0.1.1` / `0.2.1-rc.2`) |
| `docs/evidence/package-dry-run.json` | 1,166 | `e1589dc57e9ab9e31602c4f04caa1ed02ab64beec99c1dcb124ee38bf4e3db0f` | `npm pack --dry-run --json` (8 files, 270,409 B compressed) |
| `docs/evidence/tests.log` | 7,196 | `9996a760c6edd89d271ca2258ef4f39f4d680628b299da326e6df5b1eaebebdf` | 84/84 unit + React + bundle test output |
| `docs/evidence/visual.log` | 884 | `2aab8da8663f1578f7d06fb03f24f861f20d5aec9e36543273016593aa837d9a` | 5-capture browser summary JSON |
| `tests/fixtures/screenshots/fixture-dark.png` | 334,247 | `5e3d61f3b5f782935489d3290297a54e938c361079e1da6d562c2eae456aa9e8` | Historical `0.1.1` dark capture |
| `tests/fixtures/screenshots/fixture-font-refresh.png` | 334,373 | `9485ea065a8520f3551fbf050bcda00f2ffd2b43cfd9e44eac94ce285638508b` | Historical `0.1.1` font-refresh capture |
| `tests/fixtures/screenshots/fixture-light.png` | 329,773 | `5965ac067fc5080225e34f447747751330c3227516980316a02ca6867fc697ef` | Historical `0.1.1` light capture |
| `tests/fixtures/screenshots/fixture-source-view.png` | 333,159 | `3ec8e53c6b1a4eefcd4b1cfd31629f29462b190e37b138a31927c790b5e2c30a` | Historical `0.1.1` source-view capture |
| `tests/fixtures/screenshots/fixture-teardown.png` | 232,311 | `9fa616176b945e212ee0915f00c9640eecfa65234ff1138b3075424acb8fdc87` | Historical `0.1.1` teardown capture |
| `tests/fixtures/screenshots/visual-evidence.json` | 14,474 | `fdcb800dffc46bc6fb9ae7807dd00d228340e9b49b4fc34dec27c73b0c3e5897` | Historical `0.1.1` structured browser report |

### Restoring and verifying the complete 2026-10-19 batch

Because `0.2.0` later reused `tests/fixtures/screenshots/` and the `0.1.1` root
evidence files were archived out of `HEAD`, restore and validate the complete
14-file historical set from commit `a8197776c879ca60af2e2d7800b67e60dd014d92`
with:

```sh
# Automated one-command archival audit (requires full git history):
node scripts/manifest.mjs --verify-archives

# Or manual extraction and verification:
TMP_RESTORE="$(mktemp -d "${TMPDIR:-/tmp}/dsh-pele-2026-10-19-XXXX")"
git archive a8197776c879ca60af2e2d7800b67e60dd014d92 \
  docs/evidence tests/fixtures/screenshots | tar -x -C "$TMP_RESTORE"
node scripts/manifest.mjs \
  --manifest="$TMP_RESTORE/docs/evidence/manifest.json" \
  --root="$TMP_RESTORE" \
  --legacy-root-paths --check
rm -rf "$TMP_RESTORE"
```

## 2. Historical documentation locator (`7398e08` and `a819777`)

The first matching committed snapshot in repository history for the six
`documentationFiles` in the `2026-10-19` manifest is
`7398e08a6af99ddc7294a1d72ff6bd2232fd163e` (and those six files remain
byte-identical in `a8197776c879ca60af2e2d7800b67e60dd014d92`).

| Repository path | Git blob object ID (SHA-1) | Bytes | SHA-256 |
| --- | --- | ---: | --- |
| `README.md` | `0230521277b01750854f301a70b5d34b3339e859` | 8,996 | `6a1dd799c730effd1e328e07244069080988eed6413eb2293be94fa8fd117b0f` |
| `README.zh.md` | `ed62e6cc2ee2278ba38b6e0cbfc01f21b136b33a` | 8,118 | `9e6533ae3fc80f3ee1f80e721a42d8553a8de0833cb1b61bb66c2c8a3c2879cf` |
| `docs/ARCH.md` | `6f68af0d76d7da86820725f95763196d9aa2dba3` | 15,945 | `a389fb2c57003a375dda1a9482c5db9e579aa661a3446b6cd89e9913d4e04263` |
| `docs/KNOWN-LIMITATIONS.md` | `fd95ec2c7adc52f22ea8d004a0f23807de0c3e43` | 3,573 | `f58ffb83e068e9e6e904a273ed1bd7ee032ae9b05eb74220638873615e310a14` |
| `docs/VERIFICATION.md` | `a2233b8fff0354697abe54f7653578ccdd256d94` | 9,547 | `f8c8c2896e46e32c05dbd90246b81ac353d83d18f5c57b03fa609c09a69d6a06` |
| `docs/VERIFICATION-HISTORY.md` | `2a5a7103f0d05854ce3491f6728e6bf3d0b731a0` | 31,008 | `30772944c88634060948e1851809f9317164f5cde17878aac5cfe9656f4c2f4f` |

Retrieve any historical document with
`git show 7398e08a6af99ddc7294a1d72ff6bd2232fd163e:<repository-path>` (or
`a8197776c879ca60af2e2d7800b67e60dd014d92:<repository-path>`). A shallow clone
or source archive may lack that commit; obtain full history before checking, or
report historical retrieval as unavailable rather than checking current files.

The manifest's `gitBase` (`0839b1ac01349b8ac1aefa775d21ca302f50ceff`) describes
the base of the then-uncommitted test workspace and is not a locator for the
finalized documentation or evidence files.

## 3. Publication scope

- The selected publication scope for the 2026-10-19 batch accepted the workspace
  and mise Node paths in `bundle-verify.log` and the workspace/temp paths in
  `install.json`. No redaction or derivative copy was used for that historical
  batch.
- Retaining those original bytes in git history does not waive path review or
  normalization for future runs.
