# Maintenance and evidence conventions

Status: maintenance plan under final review. Evidence publication direction and
the behavior-based test gate are maintainer-confirmed (2026-11-10); archival
delivery, cleanup, and P0 remain pending.
Last updated: 2026-11-10

This document governs the maintenance work alongside [ROADMAP.md](ROADMAP.md).
The roadmap owns feature scope and phase acceptance. This document owns evidence
handling, documentation responsibilities, and the boundaries of structural cleanup.
It does not report a new host verification or a completed refactor.

## 1. Parallel work

The roadmap owns phase order, dependencies, and failure handling. Evidence
repair and documentation work may proceed alongside P0 once its preconditions
hold and the inputs and run directory in section 3 are fixed. Keep the tested
build and the run's report separate from ongoing documentation edits.

Old evidence repair, a manifest schema redesign, and completion of all
documentation cleanup are not prerequisites for P0.

## 2. Preserve evidence identity

The existing [manifest](evidence/manifest.json) records the 2026-10-19 verification.
Its 14 evidence files match their recorded sizes and hashes locally. Five logs
were omitted from Git. The selected repair retains all five original files,
including the byte-identical `host-probe.log` / `host-codeblock.json` pair, and
allows only those reviewed logs through `.gitignore`. Include them in the archival
commit; changing ignore rules alone does not deliver them to a clone. The
duplicate preserves the historical file list and does not represent another run.

The [historical publication record](evidence/2026-10-19/PUBLICATION.md) pins the
six documentation files to their first matching committed snapshot and Git blob
IDs. Verify historical documents against that snapshot, not current working
files after later edits. Keep the historical manifest and test identities intact.
This batch uses original bytes, so it needs no redacted copies or derivative
mapping. The publication record only supplies retrieval, review, and scope details.

For future runs:

- Preserve original capture dates, host/plugin versions, source identity, and
  original file hashes. Do not substitute the current HEAD for the tested snapshot.
- Review files before deciding whether to publish their original bytes. Prior
  publication of a username or path does not approve future environment details.
  If redaction is needed, preserve the raw original outside the public set.
  Replace an approved personal home prefix consistently with `<HOME>` while
  retaining useful trailing segments and input semantics such as `link:`. For
  temporary paths use a consistent `<TMP_ROOT>` mapping. Record the rules, retain
  useful versions, and separately review sensitive content in remaining segments.
- Keep one `docs/evidence/<run-id>/PUBLICATION.md` per run. Record archival review
  time separately from execution time, retrieval locations, and any limitations.
  For derivatives, also record original identity/hash, public path or asset URL,
  public bytes/hash, and transformation rules. Private originals are not made
  retrievable or independently verified by recording their hashes.
- Keep the manifest's public-file inventory limited to retrievable files with
  concrete paths or asset URLs and expected sizes/hashes. Store original/private
  provenance and fixed historical document locators in `PUBLICATION.md`; these
  are not additional current-worktree file checks. The existing schema v1
  `evidenceFiles` already contains file entries, not private provenance fields.
  Verify public file integrity separately from any claim about their origin or
  a redaction process, and report unavailable originals as limitations.
- Add Git ignore exceptions only for reviewed public logs or their dedicated
  publication directory. Keep raw captures ignored and inspect the actual file
  list before staging; an ignore exception is not a publication review.

GitHub Release storage remains a P7 decision. Repository storage is acceptable
for small reviewed records. If assets are used, verify upload and retrieval
before linking them, and record the concrete asset URL and digest. Merely
classifying an entry as local or external does not restore its availability.

## 3. P0 capture and manifest timing

Use a distinct run identifier, for example a date, short bundle hash, and run
suffix. Public records can live under `docs/evidence/<run-id>/`; raw captures
remain separate until publication review. Do not reuse old screenshot paths.

For each run:

1. Record the plugin version, commit plus any working-tree changes, source and
   lockfile identity, Node/build-tool versions, package artifact `lib/client.js`
   bytes/hash, host version, and frontend asset identity. `bundle.sha256` names
   that artifact, not the HTTP response. Use fixed inputs throughout capture.
2. Run `npm run verify` before capture and retain its result. It rebuilds in
   memory, compares against the local bundle, and runs bundle tests; it does
   not perform the full test suite or verify a live host session.
3. Confirm the installed package and the client actually loaded by the test
   session after restart/reload. Record the boot graph, loaded URL, response
   identity and session results. A separate fetch alone is not proof of which
   script the browser executed. Follow P7's bundle-versus-loader-suffix check;
   preserve separate artifact and response hashes. Associate the observed
   response with the step 1 artifact; workspace equality alone cannot establish
   which version a session loaded. Do not overwrite `bundle.sha256` with a
   response digest or reuse an old cached response as proof of a new artifact.
4. Run `npm run verify` after capture and compare bundle hashes. Matching
   endpoints establish byte equality at those checkpoints, not that no rebuild
   occurred in between. Avoid concurrent writes to tested inputs. If the
   tested artifact changes, identify the new run and repeat affected checks.
5. Freeze that run's report and public evidence after review/redaction, then
   generate its manifest from those exact files and validate the recorded
   sizes/hashes. Use frozen run-local copies for documents in the public file
   inventory, or record immutable commit + path/blob locators in `PUBLICATION.md`.
   Shared working documents may continue changing; their historical hashes must
   be checked against the identified snapshot.
6. Keep the finalized manifest outside its own file list. A report may link to
   it without embedding its hash, avoiding circular report/manifest hashes.
   Later corrections create a clearly identified supplement or revised public
   record with provenance, not a silently rewritten historical test result.

Before finalizing the first new run, provide a repeatable manifest generation
and `--check` command (planned: `scripts/manifest.mjs`; not implemented yet).
Use explicit file lists, exclude the manifest itself, fail on missing or changed
public files, and distinguish public file checks from provenance metadata. This
tool is a prerequisite for finalizing the record, not starting P0 capture.

`minify: true` and `legalComments: 'none'` do not guarantee that all comment
changes preserve output. Build annotations and JavaScript line-break semantics
can affect it. Verify a completed batch of comment edits before claiming unchanged
artifact bytes; checking after each wording edit is unnecessary. Source identity
may change even when the bundle does not.

## 4. Documentation and comment ownership

| Location | Maintained content |
| --- | --- |
| `README.md` / `README.zh.md` | User behavior, installation, compatibility summary, links to evidence |
| `ARCH.md` | Module responsibilities, data flow, DOM ownership, design reasons, concise interface overview |
| Source JSDoc | Exact interfaces/types and local constraints |
| `KNOWN-LIMITATIONS.md` | Current unresolved behavior and impact |
| `ROADMAP.md` | Feature sequence, dependencies, acceptance, pending decisions |
| `VERIFICATION.md` and run reports | Results and scope for explicitly identified tested artifacts |
| `VERIFICATION-HISTORY.md` | Historical narrative, dates and limitations of retained evidence |
| This document | Maintenance workflow and evidence publication conventions |

Remove long manually copied declarations from ARCH in favor of source links
and rules. Keep short summaries where they help readers navigate. Preserve
dated measurements as historical facts; do not update old counts to match new
tests. Keep the roadmap's release checklist as a useful summary of phase gates.

Correct the entry comment to distinguish CSS-only color changes from font
changes that request layout refresh. Retain explanations of committed Fiber
selection, host `<pre>` ownership, and cleanup on failure. Remove repetition
that merely restates nearby code.

Replace the fixture README's `/tmp/dsh-theme-tokens.css` dependency with a
reproducible extraction procedure that records and checks its source version
and asset identity. Do not label tokens extracted from 0.2.2 as the existing
0.2.1-rc.2 fixture. If the old source is unavailable, preserve the committed
fixture and state the reproduction limitation.

## 5. Structural cleanup boundaries

- Keep the current top-level directories and the engine/startup separation.
- If host identification is extracted, move committed React props, banner
  fallback, and source reading from `blocks.js` into a focused module such as
  `host-facts.js`. Preserve resolution precedence and unknown-language behavior.
  Keep structural changes independently reviewable from new behavior; their
  sequencing belongs in the roadmap.
- Keep record ownership, settling, mounting, and cleanup in the block manager.
  Toolbar/export/viewer code receives explicit operations and owned DOM nodes;
  it must not independently mutate the manager's records.
- Clarify the injected handle type: the block layer tolerates simplified
  handles and does not call `refresh()`. Name that smaller contract explicitly
  or derive it from the engine type; do not accidentally require full engine
  handles from every test stub. JSDoc documents the contract; without a configured
  type-check command it is not a CI-enforced guarantee.
- Retain source, real React, built-bundle, host-probe, and browser checks as
  distinct validation layers. Share setup only where semantics and cleanup
  are actually the same. File length alone is not a reason to split a module.

## 6. Behavior-based test gate

All required behavioral cases must execute and pass. Record actual totals for
pass, fail, cancelled, skipped, and todo; do not infer success from exit code
or total count alone. Unexpected failures, cancellations, skips, todos, or
focused execution block acceptance. Explicitly accepted omissions must remain
visible limitations and cannot support a claim for the omitted behavior.

Record explanations for removed, merged, parameterized, or newly skipped tests
in the same change's commit message or a committed verification report. Identify
the affected behavior and its replacement assertions, or an explicitly accepted
omission; a chat-only explanation is insufficient. Legitimate consolidation may
reduce the count; unrelated additions cannot justify losing critical coverage.
New behavior needs corresponding assertions. Coverage here means behavior
requirements, not adoption of a percentage threshold or a new coverage tool.

For a structural change, run the affected source/React checks and the built
bundle verification; run broader tests when the changed boundary warrants it.
For documentation-only changes, check links, consistency, and diffs. Do not
claim new runtime validation from a documentation edit.
