# Tabula 1.0 Feature-Completeness Matrix

This matrix defines "feature complete" for `1.0.0`. Rows may be marked complete
only with links to the implementation, automated tests, public documentation, and
burn-in evidence required by the row. `not-applicable` requires a written reason.

| Area | Required 1.0 behavior | Unit | Browser | Docs | Burn-in | Status |
|------|-----------------------|------|---------|------|---------|--------|
| Workspace | Namespace validation and isolation | required | required | required | sampled | todo |
| Workspace | `ready` bounded, single-settlement, and repairable | required | required | required | required | todo |
| Workspace | `destroy()` terminal, idempotent, and safe before ready | required | required | required | required | todo |
| Identity | New tab gets a new id; refresh preserves it | required | required | required | sampled | todo |
| Identity | Opened-child refresh and bfcache restore are correct | required | required | required | sampled | todo |
| State | Typed set/get/subscription and wildcard subscription | required | required | required | required | todo |
| State | Value domain, `undefined`, and clone/send failure are deterministic | required | required | required | sampled | todo |
| State | Versioned delete/tombstone convergence | required | required | required | required | todo |
| State | `setAll` semantics are explicitly atomic or non-atomic | required | sampled | required | sampled | todo |
| State | Delayed, duplicate, reordered, and multi-responder sync converges | required | required | required | required | todo |
| Presence | Join/leave/list/current converge without ghosts | required | required | required | required | todo |
| Presence | Background/freeze/sleep recovery follows documented bounds | required | required/manual | required | required | todo |
| Leader | Exactly one Web Lock holder and observable identity | required | required | required | required | todo |
| Leader | Close/crash/destroy transfer and `onLeader` cleanup | required | required | required | required | todo |
| Leader | Frozen-holder behavior and non-exactly-once boundary documented | sampled | required/manual | required | required | todo |
| Views | Atomic claim and deterministic conflict result | required | required | required | required | todo |
| Views | Claim token fences stale handles/messages/releases | required | required | required | required | todo |
| Views | `open`, pending handoff, timeout cleanup, focus, and vacancy | required | required | required | required | todo |
| Views | Refresh, crash, freeze, and re-claim have no ghost owner | required | required/manual | required | required | todo |
| Protocol | Envelope and payload validation cannot corrupt state | required | fuzzed | required | sampled | todo |
| Protocol | Supported mixed versions interoperate | required | required | required | required | todo |
| Protocol | Unsupported versions surface one recovery signal | required | required | required | required | todo |
| Protocol | Long-lived message/bookkeeping stress remains bounded | required | stress smoke | required | sampled | todo |
| Storage | Unavailable, blocked, corrupt, and quota-limited storage fail clearly | required | required/manual | required | sampled | todo |
| React | Provider and all hooks match core events and teardown | required | browser smoke | required | required | todo |
| Testing | Mock workspace and cluster cover every public capability | required | not-applicable | required | sampled | todo |
| Packages | ESM/CJS/types/subpath/tree-shaking from packed tarballs | required | consumer smoke | required | required | todo |
| Packages | Core dependency-free and gzip budgets respected | required | CI gate | required | not-applicable | todo |
| Support | Chromium, Firefox, WebKit CI and Safari/macOS manual pass | required | required/manual | required | required | todo |
| Security | Same-origin trust model and server-validation boundary | required | sampled | required | sampled | todo |
| Examples | Every sample compiles; browser samples execute from package artifacts | required | required | required | sampled | todo |

## Completion rule

P4-001 owns this file until `0.3.0`. After that release, each burn-in correction
updates affected evidence links and returns the row to `todo` until the replacement
release passes. P6-001 snapshots the fully linked matrix into its Outcome; P6-002
must reject the 1.0 gate if any row is not `done` or an approved `not-applicable`.
