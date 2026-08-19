# Tabula V1 Feature-Completeness Matrix

This matrix defines the v1-quality feature contract shipped by the `0.8.0` milestone.
It deliberately does not make the semver `1.0.0` compatibility commitment. Rows may
be marked complete only with links to the implementation, automated tests, public
documentation, and burn-in evidence required by the row. `not-applicable` requires a
written reason.

| Area | Required v1 behavior | Unit | Browser | Docs | Burn-in | Status |
|------|-----------------------|------|---------|------|---------|--------|
| Workspace | Namespace validation and isolation | required | required | required | sampled | todo |
| Workspace | `ready` settles after a bounded initial round; incomplete status repairs | required | [matrix](../e2e/tests/state.spec.ts) | [behavior](../docs/BEHAVIOR.md#shared-state-boundary) | required | todo |
| Workspace | `destroy()` terminal, idempotent, and safe before ready | required | [adversarial](../e2e/tests/adversarial.spec.ts) | [behavior](../docs/BEHAVIOR.md#close-crash-refresh-bfcache-and-restart) | required | todo |
| Identity | New tab gets a new id; refresh preserves it | required | [lifecycle/storm](../e2e/tests/adversarial.spec.ts) | [behavior](../docs/BEHAVIOR.md#close-crash-refresh-bfcache-and-restart) | sampled | todo |
| Identity | Opened-child refresh and bfcache restore are correct | required | [lifecycle](../e2e/tests/lifecycle.spec.ts) | [behavior](../docs/BEHAVIOR.md#close-crash-refresh-bfcache-and-restart) | sampled | todo |
| State | Typed set/get/subscription and wildcard subscription | required | required | required | required | todo |
| State | Value domain, `undefined`, and clone/send failure are deterministic | required | required | required | sampled | todo |
| State | HLC-ordered set/delete and cohort-lifetime tombstones converge | required | required | [behavior](../docs/BEHAVIOR.md#shared-state-boundary) | required | todo |
| State | `setAll` is an atomic batch with post-commit notifications | required | sampled | required | sampled | todo |
| State | Delayed, duplicate, reordered, and multi-responder sync converges | required | required | [behavior](../docs/BEHAVIOR.md#shared-state-boundary) | required | todo |
| Presence | Join/leave/list/current converge without ghosts | required | required | required | required | todo |
| Presence | Background/freeze/sleep recovery follows documented bounds | required | [automated](../e2e/tests/adversarial.spec.ts) / [manual](../docs/ADVERSARIAL-CHECKLIST.md) | [behavior](../docs/BEHAVIOR.md#scheduling-presence-and-time) | required | todo |
| Leader | Exactly one Web Lock holder and observable identity | required | [contention](../e2e/tests/leader.spec.ts) | required | required | todo |
| Leader | Close/crash/destroy transfer and `onLeader` cleanup | required | [termination](../e2e/tests/adversarial.spec.ts) | [behavior](../docs/BEHAVIOR.md#close-crash-refresh-bfcache-and-restart) | required | todo |
| Leader | Frozen-holder behavior and non-exactly-once boundary documented | sampled | [Chromium](../e2e/tests/chromium-lifecycle.spec.ts) / [manual](../docs/ADVERSARIAL-CHECKLIST.md) | [behavior](../docs/BEHAVIOR.md#scheduling-presence-and-time) | required | todo |
| Views | Web Lock claim, one view per tab, and deterministic conflict result | required | required | required | required | todo |
| Views | Claim token fences stale handles/messages/releases | required | required | required | required | todo |
| Views | `open`, pending handoff, timeout cleanup, focus, and vacancy | required | required | [behavior](../docs/BEHAVIOR.md#tabs-windows-popups-and-focus) | required | todo |
| Views | Refresh, crash, freeze, and re-claim have no ghost owner | required | [automated](../e2e/tests/adversarial.spec.ts) / [manual](../docs/ADVERSARIAL-CHECKLIST.md) | [behavior](../docs/BEHAVIOR.md#close-crash-refresh-bfcache-and-restart) | required | todo |
| Protocol | Envelope and payload validation cannot corrupt state | required | fuzzed | required | sampled | todo |
| Protocol | Major 1 revisions 0-1 interoperate through validated ranges | required | required | [behavior](../docs/BEHAVIOR.md#mixed-deployments-and-recovery) | required | todo |
| Protocol | Unsupported versions surface one recovery signal | required | [mixed protocol](../e2e/tests/adversarial.spec.ts) | [behavior](../docs/BEHAVIOR.md#mixed-deployments-and-recovery) | required | todo |
| Protocol | Long-lived message/bookkeeping stress remains bounded | [10k/1k stress](../packages/tabula/src/__tests__/protocol.test.ts) | stress smoke | required | sampled | todo |
| Storage | Creation probes and later blocked/corrupt/quota failures are atomic and clear | required | required/manual | [behavior](../docs/BEHAVIOR.md#storage-and-privacy-modes) | sampled | todo |
| Frameworks | React and vanilla apps consume the core API directly; no framework wrapper is part of v1 | required | browser smoke | required | sampled | todo |
| Testing | Mock workspace and cluster cover every public capability | required | not-applicable | required | sampled | todo |
| Packages | ESM/CJS/types/subpath/tree-shaking from packed tarballs | required | consumer smoke | required | required | todo |
| Packages | Core dependency-free and gzip budgets respected | required | CI gate | required | not-applicable | todo |
| Support | Chromium, Firefox, WebKit CI and Safari/macOS manual pass | required | [matrix](../docs/BEHAVIOR.md#runtime-admission-and-tested-engines) / [Safari pending](../docs/SAFARI-CHECKLIST.md) | [behavior](../docs/BEHAVIOR.md) | required | todo |
| Security | Same-origin trust model and server-validation boundary | required | sampled | required | sampled | todo |
| Examples | Every sample compiles; browser samples execute from package artifacts | required | required | required | sampled | todo |

## Completion rule

P4-001 owns this file until `0.3.0`. After that release, each burn-in correction
updates affected evidence links and returns the row to `todo` until the replacement
release passes. P6-001 snapshots the fully linked matrix into its Outcome; P6-002
must reject the 0.8.0 gate if any row is not `done` or an approved `not-applicable`.
