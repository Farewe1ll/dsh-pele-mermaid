/**
 * dsh-pele-mermaid — Host (Node) half.
 *
 * This is a pure Web UI plugin. The Host half intentionally has no behavior:
 * its only job is to be a live Loader row so the `dsh.client` scanner in
 * `@deepseek-ai/dsh-client-modules` picks the package up and serves the
 * prebuilt browser bundle from `exports["./client"]`.
 *
 * The browser half (lib/client.js) is built by `scripts/build-client.mjs` from
 * `src/client/` with Pele bundled in: synchronous rendering, zero runtime
 * dependencies, no CDN, no network access.
 */

/** Host plugin body — this surface owns no Host-side services. */
export function apply() {}
