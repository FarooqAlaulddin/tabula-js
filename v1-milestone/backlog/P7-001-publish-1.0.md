---
id: P7-001
title: Publish 0.8.0 and close the v1 feature milestone
phase: 7
status: todo
depends_on: [P6-002]
owner: human
scope: final version publish + post-release verification + archival
---

## Context

`0.8.0` promotes the approved `0.7.x` behavior to the completed v1 feature milestone
while retaining semver room for breaking corrections before `1.0.0`. No feature,
behavior, protocol, default, or API change is allowed between approval and publish.

## Task

- Prepare the final version/changelog-only changeset and prove generated runtime code,
  declarations, exports, protocol, and docs are unchanged from the approved RC except
  approved version/release metadata.
- Publish the package with provenance under `next`; verify npm/GitHub metadata and
  confirm `latest` remains absent or unchanged.
- Install exact `0.8.0` registry bytes in fresh ESM, CJS, TypeScript, React-app, and browser consumers; run the
  documented quick starts and a multi-tab state/leader/view smoke.
- Verify live demo/docs links and rollback/recovery instructions.
- Mark every backlog item/index row done with Outcomes, archive release evidence, and
  open post-milestone work, including eventual `1.0.0` readiness, as ordinary issues
  or a new milestone rather than extending this plan.

## Acceptance criteria

- [ ] The package is `0.8.0` under `next` with provenance.
- [ ] `latest` remains absent or unchanged; no release in this plan claims stable semver 1.x.
- [ ] Runtime/API/protocol comparison confirms no change from the approved RC beyond release metadata.
- [ ] Fresh public-artifact consumers and browser smoke pass.
- [ ] GitHub release, checksums/manifest, migration notes, demo, and docs are public and linked.
- [ ] PLAN index and all backlog statuses are done; milestone evidence is archived read-only.

## Files

Final changeset/changelogs/release notes, PLAN/backlog Outcomes/statuses, and release archive metadata.

## Outcome

(pending)
