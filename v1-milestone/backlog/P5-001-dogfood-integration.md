---
id: P5-001
title: Dogfood all public capabilities in real applications
phase: 5
status: todo
depends_on: [P4-003]
owner: human
scope: one or more independent apps covering the complete feature matrix
---

## Context

Examples authored for Tabula prove integration mechanics, not production fitness.
The `0.3.0` candidate must run in applications that exist for their own purpose.
Starting with low-stakes features remains correct, but 1.0 evidence must eventually
cover state, presence, leadership, named views, lifecycle, React where claimed, and
the published testing adapter.

## Task

Human selects one or more real apps. Collectively their normal usage paths must cover:

- Shared UI state including delete and late-tab synchronization.
- Presence displayed or used by application logic.
- A leader-owned restartable connection/poll/background responsibility.
- An exclusive named view opened/focused/reclaimed through real user interaction.
- Lifecycle through refresh, close, background, sleep/wake, and application deployment.
- React bindings if React remains a supported 1.0 package.
- `tabula/testing` in the consumer's ordinary test suite.

Agent integrates incrementally and adds privacy-conscious instrumentation for library
version/protocol, anonymous workspace session, browser family/OS, tab counts,
ready/repair/incompatibility, leader intervals, view claim tokens/conflicts/vacancy,
and invariant failures. Logs must distinguish success coverage from absence of errors.

## Acceptance criteria

- [ ] Outcome names the apps, owners, deployment environments, versions, and which matrix rows each covers.
- [ ] Every public capability appears in at least one normal user path, not a hidden test route.
- [ ] Consumers install public npm artifacts, not workspace/git dependencies.
- [ ] Consumer tests use the published testing adapter and exercise application behavior.
- [ ] Instrumentation is privacy-reviewed, versioned, and can produce P5-003 aggregate evidence.
- [ ] Every anomaly is filed with `burn-in`, affected version, reproduction/evidence, and invariant classification.

## Files

External app repositories, consumer observability configuration, issues in this repository,
FEATURE-COMPLETE burn-in links, and this Outcome.

## Outcome

(pending)
