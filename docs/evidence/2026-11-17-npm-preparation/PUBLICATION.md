# npm preparation evidence — 2026-11-17

Scope: release safeguards, local automated tests, actual archive verification,
and installation/disable/uninstall in an isolated DSH web profile. The runtime
bundle is unchanged from commit `80e88f4`.

`verification.json` identifies the working-tree inputs and final tarball.
`package.json` is the JSON inventory extracted from the final `npm pack --json`
stdout after lifecycle output; the release gate completed successfully.
`host.json` contains the installed-component probe result after removing npm's
console wrapper. `install.json` is the final install-script result with paths
normalized: workspace to `<WORKSPACE>`, that run's temporary root to `<TMP_ROOT>`,
and the personal home prefix to `<HOME>`. No assertion or digest is changed.

Raw captures stay in ignored `.artifacts/npm-readiness-2026-11-17/`; they are
not part of the public evidence inventory. The original install JSON SHA-256 is
`4b3c25593e0be2ef43c2b3c03e8d35299371a9e34599bca8c4a1937bcc8e1262`. This is provenance for a private raw capture,
not a claim that it is retrievable from this repository.

The verified tarball is retained locally at
`dist/npm-preparation-2026-11-17/dsh-pele-mermaid-0.2.0.tgz` (ignored), with
its digest recorded in `verification.json`. Registry publication and remote CI
are separate actions. This record is a preparation result, not a publication.
