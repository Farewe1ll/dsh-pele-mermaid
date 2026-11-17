# dsh-pele-mermaid — Roadmap

Updated: 2026-11-17. Target: `0.2.0` npm distribution.

The rendering features are implemented. Current work prepares a reproducible
npm package. [RELEASING.md](RELEASING.md) owns the operational release steps;
[VERIFICATION.md](VERIFICATION.md) owns measured results and exact artifacts.
The [historical implementation plan](ROADMAP-HISTORY.md) preserves P0–P7
iteration history and earlier release-channel decisions.

## Release preparation

| Work | Acceptance |
| --- | --- |
| Third-party notices | Ship the complete pinned Pele MIT license and Lucide ISC notice; reject truncated notices |
| Metadata and docs | Repository/homepage/issues URLs; bilingual npm/tarball instructions; working documentation links |
| Reproducible tooling | Package and lockfile versions agree; pinned tools; `npm ci` |
| Release gate | `prepack` runs tests, bundle freshness and actual archive verification |
| CI | Same portable gate on the latest Node LTS (`lts/*`); read-only repository permissions |
| Final artifact | Ten reviewed files; unpacked entry points work; final tarball installed in an isolated DSH profile |
| Install lifecycle | Loaded route begins with exact tarball bundle bytes; disabled route is 404; disabled/uninstalled boot graphs match |
| Publication | Separate maintainer action using the already verified tarball, followed by registry integrity verification |

No rendering changes are needed for this preparation. Freeze packaged files
before the final tarball check. Keep verification output outside the package so
recording a result does not change the tested archive. See the release checklist
for remote CI, registry-account and tag checks performed at publication time.

## Decisions

- Use npm for package distribution; a GitHub Release can attach the same tarball.
- Keep Pele `1.9.0` bundled inline; lazy loading still needs installed-route
  encoding/cache measurements and a measured split prototype.
- Preserve historical hashes and counts separately from current results.
- Runtime consumers need no build step or development dependencies.
- Keep runtime `engines.node >=20`; development and CI use the latest Node LTS.
  Local Node is managed by mise, following its `lts` channel.

## Post-0.2.0 engineering proposals (D1–D4)

These follow-ups are scoped outside the `0.2.0` release and each requires its
own preconditions and acceptance checks:

1. **Proposal D1 — Fix `L4` shared scan/refresh timer race (recommended first):**
   - `src/client/index.js` currently shares one `timer` between `scheduleScan`
     and `scheduleRefresh`, allowing a DOM mutation within the 150 ms debounce
     window to cancel a pending font-metric `refreshAll()`.
   - Precondition & acceptance: add a failing reproduction test first ("font
     change followed by DOM mutation within 150 ms"), then split the timer or
     track a `pendingRefresh` flag so the expiry runs `manager.refreshAll()`,
     rebuild `lib/client.js`, and run full verification.
2. **Proposal D2 — Scoped JSDoc static type checking (`tsc --noEmit`):**
   - Clean up non-standard JSDoc type names (`DOMWindow` → `Window`) and provide
     local ambient declarations for `@deepseek-ai/cordis` `Context` before
     enabling a `jsconfig.json` check over `src/client/*.js`.
3. **Proposal D3 — `L2` scan and settle-timer consolidation:**
   - Profile multi-block streaming histories to establish a baseline before
     consolidating per-record settle timers or filtering `MutationObserver`
     records. Any change must preserve 100% of existing block insertion/removal,
     nested static-Shiki `<pre>` replacement, language reuse, 1 s props-audit,
     and `destroy()` self-healing tests.
4. **Proposal D4 — Evidence storage slimming and bundle budget review:**
   - Future runs omit duplicate wrapper logs (`host-probe.log`, `visual.log`).
   - Evaluating an incremental format for `visual-evidence.json` requires
     defining an explicit baseline locator and verifying that a run's full state
     can still be reconstructed independently.
   - Re-evaluating the `750,000` B raw bundle budget or revisiting P6 lazy
     loading requires authenticated installed-route `PerformanceResourceTiming`
     (`Content-Encoding`, `encodedBodySize`, cache hit behavior) and a split
     prototype.
