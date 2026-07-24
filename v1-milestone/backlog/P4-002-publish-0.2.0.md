---
id: P4-002
title: Publish 0.2.0
phase: 4
status: todo
depends_on: [P4-001, P1-003, P1-004, P2-002, P2-003, P3-003]
owner: human
scope: 1 npm auth setup + 1 merged version PR
---

## Context

0.2.0 is the burn-in candidate: hardened internals (Phase 1), honest docs and live demo (Phase 2), automated release (Phase 3), frozen API (P4-001). It goes to npm under the P0-001 name.

## Task

Human parts:
- Create/confirm the npm account or org for the chosen name; configure **trusted publishing (OIDC)** on npmjs.com for both packages pointing at the release workflow (the auth model P3-001 fixed — no long-lived token).
- Approve the `0.2.0-rc.0` prerelease publish under the `next` dist-tag — this is the provenance integration test (dry-run cannot verify OIDC/attestation, per P3-001).
- After the rc publishes cleanly with provenance visible, merge the changesets version PR for 0.2.0.

Agent preparation allowed: draft the 0.2.0 changeset summarizing Phase 1–3 changes; run the dry-run pipeline; prepare the rc changeset; write release notes.

## Acceptance criteria

- [ ] Both packages at 0.2.0 on npm with provenance badges visible on npmjs.com.
- [ ] `npm install <name>` in a scratch project works; the Quick start compiles and runs against the published artifact (not the workspace link).
- [ ] GitHub release with notes exists for the tag.

## Files

`.changeset/*.md` (release changeset), GitHub/npm settings (human).

## Outcome

(pending)
