# Known limitations — 0.1.1 working build

Owner for the follow-ups below: repository maintainer. These are tracked risks,
not claims that every scenario has been reproduced in a full DSH session.
Current validation and its exact scope are in [VERIFICATION.md](VERIFICATION.md).

| ID | Trigger / impact | Current handling / next task |
| --- | --- | --- |
| L1 — private Fiber | A host/React upgrade changes private fields, ancestor shape, or exceeds traversal bounds. Generic-banner Mermaid may stay as source. | Target DSH 0.2.1-rc.2 / React 18.3.1; validate committed-root membership and fall back to explicit DOM language. Unknown language stays native. Run `verify:host` and lifecycle tests on every host upgrade; seek a public language/source hook. |
| L2 — scan cost | Many blocks or continuous streaming cause repeated full-page scans; pending records each schedule a settle callback. Fiber validation also walks ancestor/sibling links. | Existing mutation debounce plus one new 1 s props audit; no performance bound claimed. Profile large histories, then consolidate settle scheduling and narrow scans. |
| L3 — props-only update latency | Language changes without a banner/source DOM change cannot trigger the body observer. | The 1 s audit detects this, including transitions to/from Mermaid. Background timer throttling can extend the delay; replace polling if a stable host subscription becomes available. |
| L4 — refresh scheduling race | DOM mutations and font events share a debounced timer; a later scan may replace a scheduled font refresh. | Color changes still use CSS. Track an independent pending-refresh flag or separate scheduling in a follow-up, with a race reproduction test. |
| L5 — font size | Appearance font size changes request rebuilding but are not passed as Pele's `fontSize` option. | Pele retains its default 16 px; do not claim full Appearance font-size support. Add an explicit size mapping and measurement/layout coverage before making that claim. |
| L6 — host DOM evolution | React replaces content or a new CodeBlock shape lacks the expected banner/pre hooks. A diagram can disappear until the next scan, or stay native. | Preserve host source parents; remove only plugin nodes/visibility markers. Plain, streamed and nested static-pre replacement paths are tested with real React. Re-audit selectors/ownership after host changes. |
| L7 — resource-policy scope | Future Pele features may introduce other automatic resource references; filtered links can navigate when clicked. | Image embeds are disabled and three URL forms are tested. Browser network evidence covers fixture samples only. Audit new resource-emitting features on Pele upgrades; do not treat the renderer as a complete security sandbox. |
| L8 — settle window | Streaming pauses for more than 180 ms before a fence is complete. | Partial source may render or show an error; later source changes retry. A host completion signal would be needed for a strict “only after completion” guarantee. |

The former detached-source ownership problem and stale alternate-props reading
are addressed by the current change. Passing the component harnesses does not
establish failure frequency, performance, or compatibility for every live DSH
conversation. The installed-host probe executes the real CodeBlock body with
fixture adapters for its external styling/toolbar/tokenization helpers.

Version remains the working tree's `0.1.1`; this task does not publish a package.
Release numbering should be decided against the actually published baseline.
