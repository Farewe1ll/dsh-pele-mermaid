# dsh-pele-mermaid — Current verification

Date: 2026-11-17 (Asia/Shanghai). Package: `dsh-pele-mermaid@0.2.0`.
This record covers release preparation on top of commit `80e88f4`; the rendering
sources and committed client bundle are unchanged.

## Current artifact

| Item | Value |
| --- | --- |
| Client bundle | `lib/client.js`, 739,776 bytes |
| Bundle SHA-256 | `1862b3d0363c068f940fe660569cdafb23e5b608200477ab61f5215ef41379cb` |
| Renderer | Pele 1.9.0, bundled |
| Build tool | esbuild 0.28.2, pinned |
| Test environment | Node 26.13.1 / npm 11.20.0; jsdom 29.1.1; React 18.3.1 |
| DSH component/profile checks | 0.2.2-rc.3 |
| Installed Desktop artifact, read-only observation | Plugin 0.2.0; installed bundle bytes/hash match the current repository |

## Checks

- `npm test`: **150 passed**, zero failures or skips. This includes two release
  safeguard tests that reject omitted/truncated notices and unexpected files.
- `npm run verify`: **PASS**. In-memory rebuild equals the committed bundle;
  all seven built-bundle smoke tests pass.
- `npm run verify:package`: **PASS**. Actual archive extraction, ten-file
  inventory, byte equality, full upstream notices, lockfile versions, and
  isolated host/client entry points are checked.
- `npm run verify:host`: **PASS**, six component checks on the installed
  `0.2.2-rc.3` CodeBlock with real React and fixture adapters.

The release gate is `npm run verify:release`, also run by `prepack` and the
GitHub Actions workflow. The workflow follows the latest Node LTS (`lts/*`);
a workflow committed locally does not establish a remote CI result.

Final tarball/profile results and exact identities are recorded in
[evidence/2026-11-17-npm-preparation](evidence/2026-11-17-npm-preparation/).
The installation check uses a temporary web profile: bundle registration,
byte-identical served prefix, disabled-route 404, and disabled/uninstalled
boot-graph parity. It does not modify the user's Desktop profile.

## Final package

The final tarball contains **10 files**, **297951 bytes** compressed.
SHA-256: `0dad9b54b9ff55e29c23ab919724ca50b63e628f27e3dc22f1acb3f47cbedb6a`.
The isolated DSH `0.2.2-rc.3` install check passed: served route **739,849 bytes**
(the 739,776-byte bundle plus a 73-byte loader suffix); disabled route **404**;
disabled and uninstalled boot graphs match. The temporary profile was removed.
A fresh dependency installation and release gate also passed in a separate
checkout copy. The development environment remains the existing mise `node@lts`.

## Reproduce

```sh
npm ci
npm run verify:release
npm run verify:host
mkdir -p dist
npm pack --pack-destination dist
node scripts/verify-install.mjs --source=dist/dsh-pele-mermaid-0.2.0.tgz --output=.artifacts/release-install.json
```

See [RELEASING.md](RELEASING.md) for the complete freeze, package and publication
procedure. Preparation and verification do not publish to any registry.

## Historical evidence

Earlier counts and bundle measurements are intentionally separate:

- [Earlier 0.2.0 verification](VERIFICATION-2026-11-17-BASELINE.md): the
  `906b1cc2…` feature baseline, `48fb4f4f…` viewer browser run and recovery follow-up.
- [Viewer screenshots and geometry](evidence/2026-11-17-viewer-stage/PUBLICATION.md):
  captured against `48fb4f4f…`.
- [0.1.x verification](VERIFICATION-HISTORY.md).
- [Historical implementation roadmap](ROADMAP-HISTORY.md).
