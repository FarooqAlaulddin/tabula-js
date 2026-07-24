---
id: P5-001
title: Dogfood in a real app
phase: 5
status: todo
depends_on: [P4-002]
owner: human
scope: 1 app chosen + 1 integration (agent-executable once chosen)
---

## Context

Stability is earned by usage, not declared. The Excalidraw example is a demo, not a consumer: it was written by the library author to show the library working. The gate to 1.0.0 requires the published 0.2.x running in at least one app that exists for its own reasons.

## Task

Human decision: pick the app. Candidates: one of the maintainer's active projects with any multi-tab pain (session sync alone qualifies), or a real OSS app adopted via PR.

Agent-executable once chosen:
- Integrate starting with the lowest-stakes feature per the README adoption guide (leader-elected connection or logout sync — not views first).
- Instrument for the burn-in report: log leader changes, sync failures, `view:conflict` events to whatever the app already uses for logging.
- File every anomaly as a GitHub issue on tabula-js with reproduction notes — issues are the input to P5-002.

## Acceptance criteria

- [ ] App named in Outcome; integration merged and running wherever that app runs.
- [ ] At least one Tabula feature in the app's normal usage path (not a hidden test page).
- [ ] Anomalies (or "none observed") tracked as GitHub issues labeled `burn-in`.

## Files

External app repo; issues on this repo.

## Outcome

(pending)
