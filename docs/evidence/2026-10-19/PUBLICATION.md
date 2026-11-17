# Publication record for the 2026-10-19 evidence

Archival review: 2026-11-10. Status: prepared locally; archival commit pending.
The test dates and results remain those in the [original manifest](../manifest.json).
This record adds retrieval and publication scope, not a new test result.

## Original evidence delivery

Retain the five logs at their original paths and bytes: `build-freshness.log`,
`bundle-verify.log`, `host-probe.log`, `tests.log`, and `visual.log` in
`docs/evidence/` (10,949 bytes total). Their expected sizes and SHA-256 values
remain in the manifest. `host-probe.log` duplicates `host-codeblock.json`; retain
both to preserve the original inventory without inventing another probe run.

The selected publication scope accepts the workspace and mise Node paths in
`bundle-verify.log`. The existing `install.json` includes workspace and temporary
paths. This is a decision for these reviewed files, not a rule that previous
disclosure makes future paths safe to publish. No redaction or derivative copy
is planned for this batch.

Before calling delivery complete, include all five logs, the ignore exceptions,
and this record in the archival commit, and verify all 14 `evidenceFiles` from
that committed file set. A local 14/14 match or an ignore exception alone does
not establish clone availability. Include the roadmap and maintenance document
together so the new references are delivered with their target.

## Historical documentation locator

The first matching committed snapshot in the inspected repository history is
`7398e08a6af99ddc7294a1d72ff6bd2232fd163e`. All six entries in
`documentationFiles` match that commit. Use its full object ID, not the moving
name `HEAD`. Later fixed commits can contain the same bytes; this locator selects
the earliest matching snapshot.

| Repository path | Git blob object ID (SHA-1) |
| --- | --- |
| `README.md` | `0230521277b01750854f301a70b5d34b3339e859` |
| `README.zh.md` | `ed62e6cc2ee2278ba38b6e0cbfc01f21b136b33a` |
| `docs/ARCH.md` | `6f68af0d76d7da86820725f95763196d9aa2dba3` |
| `docs/KNOWN-LIMITATIONS.md` | `fd95ec2c7adc52f22ea8d004a0f23807de0c3e43` |
| `docs/VERIFICATION.md` | `a2233b8fff0354697abe54f7653578ccdd256d94` |
| `docs/VERIFICATION-HISTORY.md` | `2a5a7103f0d05854ce3491f6728e6bf3d0b731a0` |

Git blob IDs identify Git objects; they are not the content SHA-256 values in the
manifest. Retrieve with `git show <full-commit>:<repository-path>`, then check
byte length and content SHA-256 against `documentationFiles`. A shallow clone or
source archive may lack that commit; obtain its history before checking, or
report historical retrieval as unavailable rather than checking current files.

The manifest's `gitBase`, `0839b1ac01349b8ac1aefa775d21ca302f50ceff`, describes
the base of the then-uncommitted test workspace. It lacks `KNOWN-LIMITATIONS.md`
and `VERIFICATION-HISTORY.md`; the other four documentation files differ. It is
not a locator for this documentation snapshot. Likewise, the later archival
commit is not asserted to be the commit on which the tests ran. Preserve the
manifest's working-tree description, source snapshot, and artifact hash.

## Verification scope

- Check the 14 original evidence files against the historical manifest once
  they are all delivered in Git. No private provenance entries are involved.
- Check historical documentation against the fixed snapshot above. Later edits
  to shared documentation are not edits to the historical snapshot.
- Keep the manifest unchanged. This companion record is not part of its original
  file list; its later archival date must not be presented as test execution time.
- File integrity does not establish a new live Desktop compatibility result.
