---
id: P5-001
title: Dogfood all public capabilities in real applications
phase: 5
status: done
depends_on: [P4-003]
owner: human
scope: one or more independent apps covering the complete feature matrix
---

## Context

Examples authored for Tabula prove integration mechanics, not production fitness.
The `0.3.0` candidate must run in applications that exist for their own purpose.
Starting with low-stakes features remains correct, but v1 milestone evidence must eventually
cover state, presence, leadership, named views, lifecycle, framework-neutral usage,
and the published testing adapter.

## Task

Human selects one or more real apps. Collectively their normal usage paths must cover:

- Shared UI state including delete and late-tab synchronization.
- Presence displayed or used by application logic.
- A leader-owned restartable connection/poll/background responsibility.
- An exclusive named view opened/focused/reclaimed through real user interaction.
- Lifecycle through refresh, close, background, sleep/wake, and application deployment.
- Direct core integration from at least one framework application.
- `tabula/testing` in the consumer's ordinary test suite.

After the integrations and instrumentation are accepted, publish and adopt `0.4.0`
as the explicit dogfood checkpoint under `next`.

Agent integrates incrementally and adds privacy-conscious instrumentation for library
version/protocol, anonymous workspace session, browser family/OS, tab counts,
ready/repair/incompatibility, leader intervals, view claim tokens/conflicts/vacancy,
and invariant failures. Logs must distinguish success coverage from absence of errors.

## Acceptance criteria

- [x] Outcome names the apps, owners, deployment environments, versions, and which matrix rows each covers.
- [x] Every public capability appears in at least one normal user path, not a hidden test route.
- [x] Consumers install public npm artifacts, not workspace/git dependencies.
- [x] Consumer tests use the published testing adapter and exercise application behavior.
- [x] Instrumentation is privacy-reviewed, versioned, and can produce P5-003 aggregate evidence.
- [x] Every anomaly is filed with `burn-in`, affected version, reproduction/evidence, and invariant classification.
- [x] Every dogfood app has adopted the provenance-backed `0.4.0` checkpoint from npm.

## Files

External app repositories, consumer observability configuration, issues in this repository,
FEATURE-COMPLETE burn-in links, and this Outcome.

## Outcome

Completed on 2026-08-22:

- Thread Workspaces, owned by Farooq Alaulddin in the independent private
  `FarooqAlaulddin/threads` repository, is the real application. Pull request
  <https://github.com/FarooqAlaulddin/threads/pull/235> added direct React consumption
  of the public core and testing exports; pull request
  <https://github.com/FarooqAlaulddin/threads/pull/236> adopted the exact
  provenance-backed `@thinkly/tabula-js@0.4.0` npm artifact.
- Normal Workspaces paths cover the matrix: file selection and fallback deletion cover
  shared state/tombstones; the workspace header uses presence; the Web Locks leader owns
  periodic revalidation; Activity uses open/focus/claim/conflict/vacancy named-view flows;
  normal page events cover refresh, close, visibility, bfcache, sleep/wake, and deployments.
  The React app uses the framework-neutral core directly, while its ordinary Node test
  suite imports `@thinkly/tabula-js/testing` for state, presence, leadership, and views.
- The integration shipped to staging and both production app nodes at Thread release
  `v1.0.38` (`f27637f`). Alembic migration `0006_tabula_evidence` was applied first;
  health gates, smoke tests, deep health, public endpoints, and both edge-routed members
  passed after deployment. Production is <https://thread.thinkly.dev/workspaces/>.
- The versioned schema-1 evidence endpoint stores only package/app versions, random
  cohort/page UUIDs, coarse browser/OS families, bounded event names/details, and tab
  counts. It has no user, workspace, IP, full user-agent, path, or content columns;
  Do Not Track and a local opt-out are honored, input is strictly allowlisted, and active
  collection enforces 180-day retention. The aggregate report emits no identifiers.
- Consumer verification passed 118 Python tests, mypy, 11 frontend tests, production
  build, npm audit with zero vulnerabilities, React Doctor 100/100, migration round-trip,
  and all eight repository CI jobs. The initial production `0.4.0` aggregate was empty,
  as expected immediately after rollout, and reported zero invariant/protocol violations.
  No `burn-in` anomaly existed at checkpoint close; P5-003 counters do not count this
  pre-stabilization window.
- Release run <https://github.com/FarooqAlaulddin/tabula-js/actions/runs/32603471205>
  published `0.4.0` under `next` and independently verified the registry artifact across
  package, docs, demo, compatibility, Chromium, Firefox, and WebKit gates. The exact
  tarball is frozen in `compat/fixtures/0.4.0/`; release hashes and provenance metadata
  are archived in `v1-milestone/release-evidence/0.4.0/`.
