---
id: P7-001
title: Publish 1.0.0 and close the milestone
phase: 7
status: todo
depends_on: [P6-002]
owner: human
scope: final version publish + post-release verification + archival
---

## Context

`1.0.0` promotes the approved RC behavior to the stable semver contract. No feature,
behavior, protocol, default, or API change is allowed between approval and publish.

## Task

- Prepare the final version/changelog-only changeset and prove generated runtime code,
  declarations, exports, protocol, and docs are unchanged from the approved RC except
  approved version/release metadata.
- Publish the package with provenance; verify npm/GitHub metadata and move `latest`
  only after the artifact is healthy.
- Install `latest` in fresh ESM, CJS, TypeScript, React-app, and browser consumers; run the
  documented quick starts and a multi-tab state/leader/view smoke.
- Verify live demo/docs links and rollback/recovery instructions.
- Mark every backlog item/index row done with Outcomes, archive release evidence, and
  open post-1.0 work as ordinary issues/milestones rather than extending this plan.

## Acceptance criteria

- [ ] The package is `1.0.0` with provenance.
- [ ] `latest` resolves to the healthy 1.0 package only after post-publish verification.
- [ ] Runtime/API/protocol comparison confirms no change from the approved RC beyond release metadata.
- [ ] Fresh public-artifact consumers and browser smoke pass.
- [ ] GitHub release, checksums/manifest, migration notes, demo, and docs are public and linked.
- [ ] PLAN index and all backlog statuses are done; milestone evidence is archived read-only.

## Files

Final changeset/changelogs/release notes, PLAN/backlog Outcomes/statuses, and release archive metadata.

## Outcome

(pending)
