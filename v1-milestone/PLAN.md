# Tabula -> 1.0.0 Master Plan

Goal: turn the current `0.1.0` source baseline into a published, feature-complete,
production-credible `1.0.0` of Tabula's deliberately narrow product: a thin,
removable coordination layer that lets same-origin desktop web apps treat browser
tabs and windows as views of one workspace.

`1.0.0` is not permission to add adjacent features. It is the point at which every
feature already implied by the workspace model has a stable contract, converges
under ordinary browser adversity, works from the published package, and has been
exercised outside this repository.

## Product contract for 1.0

Tabula 1.0 consists of these supported capabilities:

1. **Workspace lifecycle** -- deterministic initialization through `ready`, safe
   teardown through `destroy()`, stable per-tab identity across refresh, namespace
   isolation, and defined behavior across close, crash, backgrounding, freeze,
   back/forward cache, sleep/wake, and deployment upgrades.
2. **Shared UI state** -- typed, contract-valid structured-clone values through
   `set`, `get`, `delete`, `setAll`, subscriptions, initial synchronization, and
   eventual convergence using one documented LWW operation order. State remains in
   memory and is not collaborative document data.
3. **Presence** -- discovery, current-tab metadata, join/leave events, liveness
   estimation, recovery after suspension, and bounded cleanup without ghost tabs.
4. **Leadership** -- at most one active lock holder per workspace, observable leader
   identity, automatic transfer on release/termination, and exact setup/cleanup
   semantics for `onLeader`. It is not an exactly-once execution guarantee.
5. **Named views** -- at most one valid owner per view, atomic claim/conflict,
   vacancy, focus requests, opened-view handoff, stale-owner recovery, and fencing
   against stale handles or delayed messages.
6. **Framework-neutral integration and test adapters** -- direct use from framework
   applications without a v1 wrapper, plus a deterministic testing subpath whose
   intentional browser divergences are documented.
7. **Consumable package** -- ESM and CJS exports, declarations, tree-shaking,
   bounded bundle size, zero runtime dependencies, complete npm documentation, and
   reproducible provenance-backed releases.

The contract is complete only when every row in `v1-milestone/FEATURE-COMPLETE.md`
is linked to implementation evidence, browser evidence, documentation, and burn-in
evidence as required by that matrix.

## Required invariants

These invariants take precedence over implementation details and task wording:

- **I1 -- One tab identity per live top-level context.** Refresh preserves identity;
  a genuinely new tab receives a new identity, including tabs created by
  `window.open()`.
- **I2 -- Eventual membership convergence.** After communication resumes, live tabs
  converge on the same membership and dead tabs disappear within the documented
  timeout policy.
- **I3 -- At most one active leader.** Web Locks are the exclusion authority. Leader
  identity events are a projection of that authority, not an independent election.
- **I4 -- State operation convergence.** Given the same valid set/delete operations,
  every live tab computes the same value or tombstone for every key regardless of
  delivery order, duplication, or initial-sync responder.
- **I5 -- At most one valid view owner.** View ownership has an exclusion authority
  and a claim token. Stale tabs, messages, handles, and registry entries cannot
  release or overwrite a newer claim.
- **I6 -- Initialization is bounded and repairable.** `ready` settles within a
  documented bound. A missed initial sync is observable and repairs after peers
  resume; it never silently becomes permanent divergence.
- **I7 -- Teardown is terminal and idempotent.** After `destroy()`, no timer, listener,
  queued lock request, initialization continuation, or public mutation can revive
  the workspace.
- **I8 -- Invalid input cannot corrupt the workspace.** Malformed, oversized,
  incompatible, duplicated, or out-of-order traffic is rejected or normalized at a
  validation boundary without crashing tabs or polluting prototypes.
- **I9 -- Mixed deployment behavior is explicit.** Supported protocol versions
  interoperate; unsupported versions produce one observable incompatibility signal
  and documented recovery instructions rather than silent partition.
- **I10 -- Published artifacts are the product.** Every release gate tests packed or
  published artifacts, not only workspace-linked source.

## Non-goals for 1.0

Unchanged from `DECISIONS.md`:

- No persistence or offline database.
- No CRDT, OT, or concurrent document merge.
- No cross-origin or cross-device synchronization.
- No RPC or server replacement.
- No iframe support.
- No BroadcastChannel or storage polyfill.
- No UI components, routing model, or custom window manager.
- No exactly-once or security-critical leader execution.
- No serialization of arbitrary non-structured-clone JavaScript values.

Adding any of these requires a separate post-1.0 product decision. It must not be
smuggled into a hardening task.

## Release train

Versions are evidence checkpoints, not deadlines. A failed gate produces another
prerelease or `0.x` patch/minor; it never lowers the gate.

| Version | Meaning | Required evidence |
|---------|---------|-------------------|
| `0.1.0` | Current source baseline; never published under the unresolved name | Existing unit/Chromium coverage; historical reference only |
| `0.2.0-alpha.0` | First publish-pipeline and package-consumption proof | Phases 0-3 complete enough for OIDC, packed-artifact, and protocol smoke tests; `next` tag only |
| `0.2.0` | Public technical preview | All Phase 1 correctness and Phase 3 package gates complete; three-engine automated suite green |
| `0.3.0` | Feature-complete API candidate | Positioning/docs/demo complete; API candidate review complete; all feature-matrix implementation and browser rows green |
| `0.3.x` / later `0.x` | Burn-in corrections | Every accepted fix, behavior change, or API correction released and re-adopted before evidence resumes |
| `1.0.0-rc.N` | Frozen release candidate | No known correctness issues; compatibility, Safari, docs, packed samples, and burn-in gates green |
| `1.0.0` | Stable contract | The exact RC artifact passed the final gate; only version/changelog/provenance changes differ |

No `latest` npm dist-tag is used before `1.0.0`; prereleases and `0.x` previews use
`next`. The maintainer may promote a proven `0.x` to another explicit preview tag,
but install docs must continue to identify it as pre-1.0.

## Phases and gates

| Phase | Name | Exit artifact / gate |
|-------|------|----------------------|
| 0 | Identity and baseline hygiene | Publishable names chosen; pending tests corrected and committed; metadata complete; CI green |
| 1 | Coordination correctness | I1-I9 implemented; leader, state, views, lifecycle, storage, and protocol tests green on the final message schema |
| 2 | Browser and product proof | Cross-browser/adversarial suite green; behavior docs, comparisons, package docs, and honest live demo shipped |
| 3 | Release engineering | Changesets, OIDC workflow, package/size/exports gates, compatibility fixture, and dry run proven |
| 4 | Public previews and API candidate | `0.2.0-alpha.0`, `0.2.0`, then feature-complete `0.3.0` published from packed-tested commits |
| 5 | Real-app burn-in and stabilization | Every public capability exercised; anomalies released as later `0.x`; evidence window green |
| 6 | 1.0 release candidate | Frozen `1.0.0-rc.N` passes Safari, mixed-version, lifecycle, docs, package, and API-diff gates |
| 7 | 1.0.0 | Exact RC promoted through provenance-backed release; post-release install verified; milestone archived |

Phases 2 and 3 may overlap after the Phase 1 message schema is stable. Core Phase 1
tasks are deliberately serialized because they share protocol, lifecycle, and the
same implementation module. API freeze cannot precede the complete browser and
package evidence.

## Authoritative dependency chain

Frontmatter `depends_on` remains authoritative. The intended critical path is:

```
P0-001 + P0-003 -> P0-002 -> P0-004
P0-004 -> P1-000 -> P1-005 -> P1-006
P1-006 -> P1-001 -> P1-008 -> P1-002 -> P1-007
P1-007 -> P1-004 -> P1-003 -> { P2-002, P2-003 }
P1-007 -> P2-001
P2-001 + P2-002 + P2-003 -> P2-004
P0-004 -> P3-002 -> P3-003
P1-005 + P3-003 -> P3-004 -> P3-001
P1-003 + P3-001 -> P4-002
P4-002 + P2-004 -> P4-001 -> P4-003
P4-003 -> P5-001 -> P5-002 -> P5-003
P5-003 -> P6-001 -> P6-002 -> P7-001
```

## Execution rules

- Every action item is one file in `backlog/`, named `P<phase>-<seq>-<slug>.md`.
- Select the next task by: `status: todo`, all dependencies `done`, lowest phase,
  then lowest sequence. Human-owned tasks may have agent-preparable inputs recorded
  in `## Outcome`; skip the human decision until the maintainer completes it.
- Set `status: in-progress` before editing. Set `done` only after every acceptance
  criterion has evidence in `## Outcome`. Use `blocked` only with a concrete blocker.
- Frontmatter dependencies, this index, and task text must agree. Run
  `node v1-milestone/validate.mjs` after changing any dependency, title, owner, or status.
- A behavioral change includes unit tests and real-browser tests wherever observable.
- Protocol changes include malformed-input, duplicate, reordered, mixed-version, and
  delayed-delivery tests appropriate to the changed message family.
- Tests assert the named behavior directly. A proxy assertion such as "nothing
  crashed" cannot claim to prove focus, cleanup, exclusivity, or convergence.
- Browser timing assertions use eventual conditions and documented bounds, never
  arbitrary sleeps as proof of correctness.
- README and package README samples compile against packed artifacts. Browser samples
  also execute in the relevant browser suite.
- Once P3-002 lands, every user-facing change includes a changeset.
- Conventional commits; one task per commit or PR unless an Outcome records why two
  inseparable tasks landed together.
- Do not run overlapping Phase 1 implementation tasks in parallel. They intentionally
  serialize changes to the message protocol and coordinator lifecycle.
- Do not modify files outside a task's `## Files` without recording the expansion and
  reason in `## Outcome`.
- Never commit unrelated pre-existing working-tree changes.

## Index

| ID | Title | Owner | Status |
|----|-------|-------|--------|
| P0-001 | Choose the npm package name | human | done |
| P0-002 | Rename the package and remove the React wrapper from v1 | agent | done |
| P0-003 | Correct and commit the pending e2e work | agent | done |
| P0-004 | Complete package metadata and declared prerequisites | agent | done |
| P1-000 | Freeze the behavioral invariants and protocol design | agent | done |
| P1-005 | Add protocol versioning, validation, and deployment compatibility | agent | done |
| P1-006 | Harden lifecycle, tab identity, storage access, and bfcache recovery | agent | done |
| P1-001 | Rebuild leadership on Web Locks | agent | done |
| P1-008 | Make state set/delete operations convergent | agent | done |
| P1-002 | Replace startup sync timing with a repairable handshake | agent | done |
| P1-007 | Make named-view ownership atomic and fenced | agent | done |
| P1-004 | Run the browser matrix on the final coordination protocol | agent | done |
| P1-003 | Prove adversarial lifecycle and concurrency behavior | agent | done |
| P2-001 | Publish honest alternatives and product boundaries | agent | done |
| P2-002 | Deploy a semantically accurate live demo | agent | in-progress |
| P2-003 | Publish the browser behavior and support contract | agent | done |
| P2-004 | Align npm package documentation and executable examples | agent | todo |
| P3-002 | Adopt changesets and seed changelogs | agent | done |
| P3-003 | Gate packed exports, declarations, dependencies, and size | agent | done |
| P3-004 | Add frozen-version and mixed-protocol compatibility fixtures | agent | done |
| P3-001 | Prove the provenance-backed release workflow | agent | todo |
| P4-001 | Complete the feature matrix and freeze the API candidate | agent | todo |
| P4-002 | Publish 0.2.0 alpha and technical preview | human | todo |
| P4-003 | Publish the feature-complete 0.3.0 API candidate | human | todo |
| P5-001 | Dogfood all public capabilities in real applications | human | todo |
| P5-002 | Stabilize through evidence-resetting 0.x releases | human | todo |
| P5-003 | Close the burn-in evidence gate | human | todo |
| P6-001 | Build and verify 1.0.0-rc.N | agent | todo |
| P6-002 | Approve the final 1.0 gate | human | todo |
| P7-001 | Publish 1.0.0 and close the milestone | human | todo |
