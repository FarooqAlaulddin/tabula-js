# Tabula 1.0 Behavioral Contract

Status: normative contract for the `1.0.0` milestone.

This document defines the behavior the 1.0 implementation must preserve.
`DECISIONS.md` preserves historical design notes; this contract takes precedence
wherever they differ. See [browser behavior and support](./BEHAVIOR.md) for the
evidence-backed operational guide and pending manual checks.

The words MUST, MUST NOT, SHOULD, and MAY are used as normative requirements.

## 1. Scope and trust model

Tabula coordinates top-level, same-origin browser contexts that join the same
workspace namespace. It is a client-side coordination layer, not a persistence,
authorization, RPC, or exactly-once execution system.

All scripts on an origin are inside the trust boundary. Validation protects the
workspace from malformed or incompatible traffic; it does not authenticate peers.
Applications MUST validate security-sensitive decisions on a server and MUST NOT put
credentials, secrets, or raw sensitive personal data in shared state.

## 2. Invariant map

| Invariant | Normative section |
|-----------|-------------------|
| I1: one tab identity per live top-level context | 3.1 |
| I2: eventual membership convergence | 4 |
| I3: at most one active leader | 5 |
| I4: state operation convergence | 6 |
| I5: at most one valid view owner | 7 |
| I6: bounded, repairable initialization | 3.2 and 6.6 |
| I7: terminal, idempotent teardown | 3.3 |
| I8: invalid input cannot corrupt the workspace | 8.3 and 8.4 |
| I9: explicit mixed-deployment behavior | 8.2 and 8.5 |
| I10: published artifacts are the product | 10 |

## 3. Identity and lifecycle

### 3.1 Tab and document identity (I1)

Each live top-level browsing context has one stable `tabId`. A full reload preserves
that id. A new tab, duplicated tab, or `window.open()` child receives a different id,
even when the browser copies `sessionStorage` from another context. A bfcache restore
resumes the existing identity rather than creating a new one.

Each document load also has a fresh `instanceId`. Startup treats a session-stored
`tabId` as a candidate, probes peers, and exchanges `(tabId, instanceId, startedAt)`
claims before `ready`. If two live instances claim one tab id, they deterministically
keep the earlier `(startedAt, instanceId)` claim and the loser generates a new id and
restarts discovery. A conflict discovered after startup triggers the same controlled
identity repair; it MUST NOT leave two live peers filtering each other's traffic.

Selected design: session-scoped tab id plus per-load instance id, active duplicate
probing, and deterministic conflict repair.

Rejected alternatives:

- `sessionStorage` alone, because browsers copy it into opener-created and duplicated tabs.
- clearing the id whenever `window.opener` exists, because an opener can survive a child reload.
- `window.name` as authority, because copying and lifecycle behavior vary by navigation/browser.
- a permanently held identity Web Lock, because it can interfere with bfcache and
  multiple workspace instances in one document.

Rationale: identity must describe a browsing context, survive reload, and repair
browser-specific storage copying without turning an incidental browser signal into authority.

### 3.2 Lifecycle and readiness (I6)

A workspace has these states:

1. `initializing`
2. `ready`
3. `bfcache-suspended`
4. `failed` (terminal)
5. `destroyed` (terminal)

Capability and argument checks that can be completed before resource attachment MUST
throw synchronously from `createWorkspace`. An asynchronous initialization failure
MUST reject `ready`, enter `failed`, and release every acquired resource.

`workspace.status()` returns an immutable snapshot with `lifecycle`, `sync`, and
`missingPeerIds`. Sync is `pending`, `repairing`, or `complete`; every effective sync
change emits one `sync:status` event carrying the same fields.
`ready` resolves after the initial bounded discovery/sync round, even when sync state
is `repairing`; the status/event makes that incompleteness observable. The default
initial ready budget is 1,000 ms of runnable timer time and is configurable. Browser
suspension can delay timer execution, so this is not an absolute wall-clock promise.

Before `ready`:

- event subscriptions and status reads take effect immediately;
- state/view/presence reads return the current provisional snapshot;
- mutations, claims, opens, and leader callbacks are queued in call order; and
- `isLeader()` is false until the Web Lock is held.

After the initial round, the implementation applies merged state first, transitions
to `ready`, flushes queued calls in order, and continues repair when needed.

Selected design: bounded usable readiness with an explicit repair status.

Rejected alternatives:

- first-response-or-timeout readiness, because it can make missed state permanent;
- waiting forever for every observed peer, because a frozen peer can deadlock startup;
- rejecting `ready` for a recoverable peer miss, because the workspace can operate and repair.

Rationale: callers need bounded startup without hiding incomplete synchronization.

### 3.3 Destroy, failure, and bfcache (I7)

`destroy()` is idempotent. The first call aborts initialization and queued lock
requests, discards queued mutations, releases held locks voluntarily, invokes each
registered leader cleanup at most once, removes timers/listeners/intents, and closes
transport. Later calls do nothing.

Destroy before readiness rejects `ready` with `WorkspaceDestroyedError`. Destroy after
readiness does not change the already-settled promise. After `failed` or `destroyed`,
all public operations except `destroy()` and status inspection throw the matching
terminal error. Previously returned unsubscribe functions remain safe no-ops.

`pagehide` with `persisted: true` enters `bfcache-suspended`; it does not run terminal
cleanup. A matching persisted `pageshow` resumes, revalidates identity, repairs
presence/state projections, and verifies any retained lock authority before callbacks
resume. Non-persisted page termination performs best-effort graceful cleanup; crash or
discard relies on browser lock release and eventual peer repair.

Selected design: explicit terminal states and a non-terminal bfcache suspension state.

Rejected alternative: treating every `pagehide` as close, because that corrupts a
page that the browser later restores from bfcache.

Rationale: teardown must not race initialization or revive resources, while bfcache is
a suspension of the same document rather than a new tab.

## 4. Presence (I2)

Presence is an eventual liveness projection, not an exclusion authority. It combines
validated announcements with bounded storage leases. A live peer that resumes
communication MUST reannounce and repair membership. A terminated peer MUST disappear
after its lease timeout plus runnable scheduling delay. Temporary false absence during
browser suspension is permitted and MUST repair without changing tab identity.

Presence disagreement MUST NOT create two leaders or view owners because those roles
are authorized only by Web Locks. Tab lists, join/leave events, and owner/leader
metadata are eventually consistent and are never authorization inputs.

Selected design: heartbeat/lease membership with resume reconciliation.

Rejected alternatives:

- BroadcastChannel heartbeat timing alone, because background scheduling can delay it;
- permanent localStorage membership, because crashes leave ghosts; and
- presence-derived authority, because temporary disagreement creates split brain.

Rationale: browsers provide failure suspicion, not perfect process-failure detection.

## 5. Leadership (I3)

The sole leadership authority is the exclusive Web Lock named:

`tabula-js:v1:<encoded-workspace-namespace>:leader`

A contender requests and holds the lock for its complete leader interval. Request
ordering is browser-controlled; Tabula does not promise oldest-tab or FIFO selection.
`onLeader` setup runs only while the lock callback is active. Voluntary release runs
cleanup exactly once before releasing the lock. JavaScript cleanup cannot be promised
after crash, process kill, or discard.

On acquisition, the holder increments a persistent workspace leader generation while
inside the lock. Leader announcements and replies carry `(generation, tabId,
instanceId)`. Projections reject lower generations. `tabs.leader()` and
`leader:change` report the latest validated projection, but only lock ownership
authorizes work.

A frozen holder may retain the lock. Tabula MUST NOT claim failover while that lock is
held. Transfer occurs after voluntary release or when the browser releases the lock
because the context terminates/discards. Leader work MUST be restartable and
idempotent; exactly-once effects require server-side idempotency or locking.

The deterministic test cluster MAY choose its oldest-created mock tab for repeatable
tests, but its docs MUST state that browser lock ordering is different.

Selected design: one held Web Lock plus a monotonically fenced projection generation.

Rejected alternatives:

- oldest presence timestamp, because membership views can disagree;
- localStorage compare-then-set, because it is not atomic; and
- timeout-based lock stealing, because a frozen holder may still own the browser lock.

Rationale: Web Locks provide the origin-local mutual exclusion that the product needs;
messages provide discovery, not authority.

## 6. Shared state (I4 and I6)

### 6.1 Operation model and total order

State is a map of keys to winning set operations or tombstones. Every set/delete is a
unique operation with:

- key and kind (`set` or `delete`);
- value for a set;
- hybrid logical clock `(wallTime, logical)`;
- actor `(tabId, instanceId)`; and
- random operation id.

Operations are totally ordered lexicographically by `(wallTime, logical, tabId,
instanceId, operationId)`. Each actor's hybrid clock never decreases when the system
clock moves backward and advances from every accepted remote clock. "Last write wins"
means last in this operation order, not last delivery or guaranteed real-world time.
Given the same operation set, all peers MUST select the same winner.

Selected design: a hybrid logical clock with deterministic actor/id tie-breakers.

Rejected alternatives:

- raw `Date.now()`, because clocks can move backward and collide;
- per-tab counters alone, because independently starting actors have no useful time component; and
- arrival order, because BroadcastChannel delivery order is not global across senders.

Rationale: the selected tuple is deterministic under duplicates, reordering,
same-millisecond writes, and local clock rollback without a central sequencer.

### 6.2 Deletes and retention

Delete creates a normally ordered tombstone. Tombstones participate in sync and MUST
prevent delayed sets/snapshots from resurrecting a key. They are invisible to
`get()`, `keys()`, and `entries()` but produce the contracted `undefined` listener
notification when they become the winner.

Every live workspace instance retains the winning operation, including a tombstone,
for each observed key until destroy. v1 does not garbage-collect tombstones across a
possibly suspended cohort. The configured state-key count limit bounds this metadata;
creating a new key beyond the limit fails before broadcast.

Selected design: cohort-lifetime tombstones bounded by the state key limit.

Rejected alternatives: unconditional delete and time-based tombstone expiry, both of
which allow delayed traffic or a resumed peer to resurrect deleted state.

Rationale: the live cohort has no safe global acknowledgement point for earlier
deletes, while the key-count limit gives retention a deterministic bound.

### 6.3 Values, `undefined`, and send failure

Set values MUST pass structural-complexity limits and a structured-clone preflight.
Values supported by both `structuredClone` and BroadcastChannel are preserved,
including cyclic graphs and standard cloneable collection/binary types. Functions,
symbols, DOM nodes, weak collections, promises, transfer-only values, and
`SharedArrayBuffer` are outside the contract.

`state.set(key, undefined)` is rejected; absence is represented only by
`state.delete(key)`. A local operation is validated, cloned, and successfully sent
before it becomes the local winner or notifies listeners. Clone, quota, or send
failure throws and leaves local state unchanged.

Selected design: structured-clone semantics with `undefined` reserved for absence and
transactional send-before-commit.

Rejected alternatives:

- JSON serialization, because it loses supported types and cycles;
- treating `undefined` as a value, because `get()` uses it for absence; and
- optimistic local commit before send, because a failed broadcast creates divergence.

Rationale: one absence representation keeps the API unambiguous, and transactional
send preserves the same winner set across peers when browser cloning fails.

### 6.4 `setAll` and notifications

`setAll` is one validated batch operation. Keys are normalized in lexical order, the
entire batch is clone/send checked before commit, and all winning entries are installed
before any callback runs. Key listeners then run in normalized key order, followed by
wildcard notifications in that order. A later per-key operation may supersede only
that key; atomicity applies to observation of the batch commit, not permanent grouping.

Listeners fire once for each newly accepted effective winner and never for stale or
duplicate operations.

Selected design: atomic local/remote batch application with post-commit notifications.

Rejected alternative: implementing `setAll` as repeated `set`, because listeners can
observe partial batches and send failure can leave a prefix committed.

Rationale: application callbacks commonly read related keys, so they must not observe
an avoidable half-applied batch.

### 6.5 State bounds

Normative defaults are: key length at most 256 UTF-8 bytes, at most 1,024 observed
keys (including tombstones), clone traversal depth at most 64, at most 10,000 visited
nodes/collection entries, and at most 1 MiB estimated string plus binary payload per
message. Implementations MAY expose lower configurable application limits but MUST
not silently truncate.

Selected design: deterministic structural budgets plus a hard per-workspace key cap.

Rejected alternatives: unbounded clone traversal and JSON byte length as the sole
budget, because cycles and binary/collection values make either unsafe or inaccurate.

Rationale: traversal limits bound CPU/memory before browser cloning while retaining
the structured-clone value model.

### 6.6 Repairable synchronization

Startup sync begins after bounded presence discovery. A request carries request id,
requester instance, requester initialization generation, known-peer set, and protocol
revision. Every responder returns its tab/document identity, initialization state, the
echoed request correlation, a complete operation snapshot, and `complete: true`, even
when the snapshot is empty. The requester merges every valid response in a retained
round using operation ordering; first response does not win by arrival.

A verified singleton completes without a redundant retry delay. For a simultaneous
empty cohort, the lowest requester/responder instance id may complete from a round in
which every live peer returned an empty initializing snapshot. Its ready response then
lets the remaining members complete without circular waiting.

Known-peer misses retry with bounded exponential backoff. At the ready budget, the
workspace reports `repairing`, becomes usable, and continues repair on backoff and
peer activity. It reports `complete` after every currently known live peer responded
ready to one round, the empty-cohort bootstrap rule applies, or missing peers were
removed by presence. Late responses remain mergeable while their correlation record
is retained. At most 16 recent round records are retained. Correlation records,
waiters, and retries are cancelled on destroy or suspension.

Selected design: correlated multi-responder rounds with post-ready repair.

Rejected alternatives: first responder wins, fixed sleeps as correctness proof, and
unbounded waiting for frozen peers.

Rationale: operation merging makes multiple replies safe, while explicit repair gives
bounded startup and eventual convergence without assuming scheduler timing.

## 7. Named views (I5)

### 7.1 Authority and claim result

The sole authority for view `name` is the exclusive Web Lock:

`tabula-js:v1:<encoded-workspace-namespace>:view:<encoded-view-name>`

Claim uses `ifAvailable` and returns a promise for a discriminated result:

- `{ status: "claimed", handle }`; or
- `{ status: "conflict", owner }`, where owner may be null until projection repair.

Expected contention is not an exception. A tab may own at most one named view at a
time in v1. Claiming another before release throws `ViewAlreadyClaimedError`.

Selected design: held per-view Web Lock, non-waiting claim, and explicit result.

Rejected alternatives:

- localStorage read-then-write, because it is not compare-and-set;
- queued lock acquisition for `claim`, because an ordinary conflict could hang indefinitely; and
- multiple views per tab, because `TabMeta.view`, lifecycle, and user focus semantics
  are deliberately singular in v1.

Rationale: ownership must be atomic and the expected conflict path must be observable.

### 7.2 Fencing and release authority

While holding the lock, a new owner increments the persistent per-view generation and
creates a random claim id. The claim token is `(generation, claimId)`. Registry
projections and every claim/release/focus/vacancy message carry the token. Lower or
different tokens cannot change a newer projection.

Only the lock-holding context can release authority. A local owner handle releases
directly. A remote handle sends a release request for its exact token; the holder
validates the token before releasing. A stale handle cannot release or focus a
replacement owner. Registry deletion never releases a lock and registry presence
never proves ownership.

Selected design: persistent generation plus random claim id, validated by the holder.

Rejected alternatives: tab id alone (reused across refresh) and timestamps (clock
dependent and not authority).

Rationale: lock-serialized generations order ownership terms, and a random id prevents
accidental token reuse within one generation.

### 7.3 `open()` handoff

`open()` creates a unique intent containing intent id, view name, requester identity,
selected state keys, creation time, and expiry. Only this JSON-safe metadata is stored
in localStorage; selected values move as validated state operations through the
protocol after the child claims the exact intent. URLs do not contain application
state.

The default `openTimeout` option and intent TTL are 10 seconds. Popup block, child
claim, timeout, superseding open, destroy, and terminal failure all remove the intent
and correlation listeners. A late child can still claim the view normally but cannot
consume an expired handoff. Simultaneous opens for one view deterministically
supersede the older pending intent before either claim completes.

Selected design: expiring metadata intent plus protocol state handoff.

The child sends `view:intent-claim` only after acquiring the target view token. The
requester replies with token-targeted `view:intent-state`; the child accepts it only
for the exact intent, requester document identity, view name, and claim token.

Rejected alternatives: state in URL, JSON state in localStorage, and unbounded pending
records. Those respectively leak data, lose structured-clone types, or leave ghosts.

Rationale: an expiring correlation record keeps navigation clean while the validated
protocol preserves the exact state operation representation.

### 7.4 Refresh, termination, freeze, and focus

A view name is remembered in session storage. Reload releases the old lock and tries
to reclaim the name with a fresh token before readiness; another context may win the
gap. Old handles become stale. bfcache restore verifies retained authority before
resuming callbacks. Crash/discard relies on browser lock release and eventual vacancy
projection repair.

A frozen owner may retain its Web Lock; Tabula does not steal it or promise failover.
`focus()` is a token-targeted request delivered only to the current owner. Calling
`window.focus()` proves request delivery, not that browser policy foregrounded the tab.

Selected design: fresh fencing on reload and best-effort browser focus.

Rejected alternatives: claiming refresh continuity without reacquisition, lock
stealing on timeout, and treating registry presence or a successful call as proof of focus.

Rationale: only current lock ownership can survive lifecycle races; foregrounding is
ultimately controlled by browser/user policy.

## 8. Protocol, validation, and deployment (I8 and I9)

### 8.1 Envelope

Every message has this validated envelope:

```ts
interface ProtocolEnvelope {
  protocol: { major: 1; revision: 1; minRevision: 0 }
  type: string
  id: string
  from: { tabId: string; instanceId: string }
  to?: { tabId: string; instanceId?: string }
  sentAt: number
  payload: unknown
}
```

Message ids are unique per instance. Directed messages are ignored unless the target
matches. The transport validates the envelope and dispatches a type-specific validated
payload; domain modules never receive raw data.

Selected design: one explicit origin, target, protocol range, id, timestamp, and
payload envelope for every message family.

Rejected alternatives: per-domain ad hoc envelopes and unversioned payload casts.

Rationale: one boundary makes compatibility, targeting, deduplication, and rejection
consistent before any domain state can change.

### 8.2 Compatibility and rollout (I9)

Wire major 1 revision 1 is emitted by v1. Readers accept revisions 0 through 1. The
revision-0 fixture represents the earlier additive shape used by compatibility tests;
missing optional fields receive documented defaults. Unknown optional fields are
ignored. Unknown message types are ignored after envelope validation.

The revision-0 fixture uses the same envelope with
`protocol: { major: 1, revision: 0 }`. Its omitted `minRevision` defaults to `0`;
all other envelope fields remain required. Unversioned traffic is not a revision-0
fixture and is rejected.

Peers are compatible only when majors match and their revision ranges overlap. An
additive change increments revision and preserves an overlap window. A breaking
change increments major and requires a release that can read both old and new majors
before a later release writes only the new major. A rollout MUST NOT silently split
long-lived tabs.

Selected design: explicit major plus overlapping additive revision range.

Rejected alternatives: package semver as wire version, accepting unversioned traffic,
and assuming all tabs reload together.

Rationale: deployments routinely leave old tabs open after new assets are served.

### 8.3 Validation boundary (I8)

Validation rejects malformed envelopes, invalid identifiers/timestamps/targets,
unknown required fields, dangerous keys (`__proto__`, `prototype`, `constructor`),
excessive nesting/node counts, and oversized payloads. Rejection from an event handler
MUST NOT throw into application code or mutate domain state.

Namespace and view names are non-empty strings of at most 128 UTF-8 bytes with no
ASCII control characters. Message and correlation ids are at most 256 UTF-8 bytes.
State limits are defined in 6.5. Presence is limited to 256 projected peers per
workspace. One envelope is limited to 1 MiB estimated payload.

Prototype-bearing input is copied into safe maps/records; untrusted keys never assign
through ordinary object prototypes.

Selected design: one transport boundary plus per-message payload validators and
structural budgets.

Rejected alternatives: TypeScript casts, validation inside each domain handler, and
JSON stringify length as the only size check.

Rationale: hostile or corrupt same-origin data must be bounded once before routing,
without confusing robustness validation with authentication.

### 8.4 Bounded bookkeeping

Deduplication retains at most 2,048 message ids and expires entries after five minutes
of runnable time. Sync/open request records are capped at 256 each and expire at their
contracted timeout. Incompatibility records are capped at 128 peer/version episodes.
Presence and state limits are defined above. Hitting a limit rejects new work with one
observable warning/error; it does not evict authority or a live tombstone.

Selected design: count and runnable-time bounds tailored to each bookkeeping family.

Rejected alternative: one unbounded global cache or silent FIFO eviction of authority
records, either of which can leak memory or invalidate correctness.

Rationale: bounded non-authoritative caches may evict safely, while authority and live
tombstone records must fail new work instead of weakening guarantees.

### 8.5 Incompatibility signal

For an unsupported protocol range, Tabula ignores domain payloads and emits one
`protocol:incompatible` event per `(peer instance, remote major/revision range)`
episode. The event includes local/remote ranges and the recovery action: save work and
reload all application tabs. A directed reject response is deduplicated to prevent a
warning storm. Compatibility validation is not authorization.

Selected design: one public, deduplicated recovery signal plus directed rejection.

Rejected alternatives: silent partition, repeated console-only warnings, and trying
to interpret an unsupported payload.

Rationale: one actionable public signal lets applications recover without warning
storms or unsafe best guesses.

## 9. Capabilities, storage, and support floors

Creation requires a top-level secure context, Web Locks, BroadcastChannel,
`crypto.randomUUID()`, `structuredClone()`, and successful read/write/remove probes
for localStorage and sessionStorage. Missing or blocked baseline capabilities throw
`CapabilityError` synchronously before transport, listeners, or locks are attached.

Corrupt non-authoritative projections are quarantined/removed and produce one bounded
diagnostic. Corrupt leader/view generation records fail that feature acquisition with
`StorageCorruptionError`; they are not reset while another holder may exist. Quota or
access failure after startup fails the affected mutation/claim/open transaction
without partial local commit.

Selected design: fail creation for baseline capability absence; fail a later feature
transaction for runtime storage loss/corruption.

Rejected alternatives: silently degrading to a subset of coordination features and
ignoring storage errors, because both make guarantees depend on hidden browser state.

Rationale: capability failures are actionable only when they happen before partial
startup or atomically at the operation that lost its prerequisite.

The final P1-003/P1-004 matrix established these tested baselines on 2026-08-14.
They are evidence floors, not claims that older versions fail. Runtime admission
remains capability-based so an untested engine with the required semantics is not
silently treated as proven.

| Project | Tested engine | Result | Scope |
|---------|---------------|--------|-------|
| Chromium | Chrome for Testing 145.0.7632.6 (Playwright build 1208) | 56/56 passed | Portable suite plus Chromium lifecycle controls |
| Firefox | Firefox 146.0.1 (Playwright build 1509) | 53/53 passed | Portable suite |
| WebKit | Playwright WebKit 26.0 (build 2248) | 53/53 passed | Portable suite; not Safari proof |
| Safari on macOS | Pending | See [manual checklist](./SAFARI-CHECKLIST.md) | Required before the 1.0 release candidate |

The expanded matrix was repeated three consecutive times with retries disabled: 162/162 each
run. Normative immediacy is limited to local reads after an accepted local commit,
local validation errors, and Web Lock exclusion while held. Presence, projections,
state repair, vacancy, and termination detection are eventual. Browser focus,
scheduling, bfcache eligibility, and cleanup after process death remain browser
policy/best effort.

## 10. Published artifact contract (I10)

The supported product is the packed/published `@farooqalaulddin/tabula-js` package,
including its `./testing` export. Release evidence MUST install tarballs or npm
artifacts into fresh consumers without workspace aliases. ESM, CJS, declarations,
exports, dependency count, size, README, LICENSE, protocol compatibility, examples,
and browser behavior are release-gated properties.

Selected design: artifact-first verification at every release gate.

Rejected alternative: treating a passing monorepo build as proof of package health,
because workspace links can hide missing files, broken exports, and undeclared dependencies.

Rationale: users execute registry artifacts, so evidence from another representation
cannot establish the 1.0 distribution contract.

## 11. Normative guarantee summary

Tabula 1.0 guarantees mutual exclusion only through held Web Locks, convergence only
for the same validated operation set, bounded usable initialization with observable
repair, terminal idempotent destroy, fenced view control, and explicit protocol
incompatibility. It does not guarantee real-time failure detection, oldest-tab
leadership, focus success, atomic localStorage compare-and-set, persistent state,
exactly-once work, or progress while the browser freezes the current lock holder.
