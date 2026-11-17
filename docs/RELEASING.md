# Releasing to npm

Run from a clean checkout with the committed lockfile. Runtime consumers get a
prebuilt bundle; development uses the latest Node LTS managed by mise
(`mise use node@lts`). CI follows `lts/*`. The local installed-host and profile checks require
the DSH CLI; they are separate from portable CI.

## Prepare

1. Set the intended package version and update the lockfile root version.
2. Update both READMEs, changelog, metadata and known limitations. Preserve
   historical measurements in the historical records rather than rewriting them.
3. When upgrading Pele, copy its complete LICENSE into
   `THIRD-PARTY-NOTICES.txt`, including bundled third-party notices. Review any
   additional code or assets bundled by the new version.
4. Install with `npm ci`. If runtime sources changed, run `npm run build` and
   review the resulting `lib/client.js` diff.

## Verify and freeze

```sh
npm ci
npm run verify:host
mkdir -p dist
npm pack --pack-destination dist
node scripts/verify-install.mjs --source=dist/dsh-pele-mermaid-0.2.0.tgz --output=.artifacts/release-install.json
```

`prepack` automatically runs `npm run verify:release`: the full test suite,
in-memory build comparison, bundle smoke tests, and `verify:package`.
The package check packs with `--ignore-scripts` internally to prevent recursion,
unpacks into a temporary directory, and checks the exact ten-file inventory,
full upstream license, byte equality, lockfile metadata, host import and client
loader registration. It removes only its own temporary directory afterward.

The release gate deliberately checks the existing bundle instead of silently
rebuilding it. A stale bundle fails the gate and must be rebuilt and reviewed.
Do not use `--ignore-scripts` on the final pack or directory-based publication.
No `prepare` or install hook is required for consumers.

The install script creates a temporary `DSH_HOME`, installs the tarball, checks
its boot entry and byte-identical served bundle prefix, disables it (route 404),
then uninstalls it and compares the boot graphs. It never changes the Desktop
profile. Record the tarball SHA-256 separately from the bundle and response
SHA-256; the host appends a source-map suffix to the served bundle.

Freeze packaged files before this final pack. Any subsequent packaged-file edit
requires a new pack and install check. Save reviewed results outside the package
in `docs/evidence/<run-id>/`, following [MAINTENANCE.md](MAINTENANCE.md).
Record exact Node/npm, source and artifact identities. Check local documentation
links and ensure the GitHub links are reachable in the pushed release revision.

## Publish (separate maintainer action)

Before publication, check registry name/version availability and the publishing
account. Make sure the remote repository contains the reviewed commit and that
CI succeeded there; adding a workflow locally is not a successful remote run.

Publish the exact verified tarball, then check the registry version and integrity:

```sh
npm whoami --registry=https://registry.npmjs.org
npm view dsh-pele-mermaid versions --json --registry=https://registry.npmjs.org
npm publish ./dist/dsh-pele-mermaid-0.2.0.tgz --access public --registry=https://registry.npmjs.org
npm view dsh-pele-mermaid@0.2.0 version dist.integrity --json --registry=https://registry.npmjs.org
```

An E404 from the pre-publication view is expected when no public package exists;
it is not proof of permission to publish the name. Tarball publication does not
substitute for the earlier checkout checks: it publishes already frozen bytes.
Keep the verified tarball instead of re-packing during this step. Compare the
registry integrity with the final `npm pack --json` result and create a tag for
the reviewed commit. A GitHub Release may attach the same tarball and evidence.

The preparation scripts and CI never publish or require npm credentials.
