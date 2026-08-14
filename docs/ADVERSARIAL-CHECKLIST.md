# Manual adversity verification

Checklist prepared: 2026-08-14. Complete this against a production build from a
recorded commit. Record browser/OS versions, hardware, profile settings, timestamps,
console output, screenshots, and issue links. A checked item without attached evidence
does not satisfy a release gate.

## Scheduling and machine lifecycle

- [ ] Put the machine to sleep for longer than the configured presence timeout, then wake it. Confirm tab identities persist, membership and state converge, and only the held Web Lock authorizes leader/view work.
- [ ] Enable the browser's memory-saver feature and force a follower discard/reload. Confirm a fresh document instance repairs state without a duplicate tab identity.
- [ ] Repeat discard/reload for the leader. Confirm transfer occurs only after the browser releases the lock and callbacks never overlap.
- [ ] Repeat discard/reload for a view owner. Confirm eventual vacancy and a newer fenced re-claim; stale handles remain ineffective.
- [ ] Move windows across multiple monitors and virtual desktops. Confirm presence metadata repairs after background throttling and focus remains best effort.

## Profiles, storage, and restart

- [ ] Run in private browsing with three tabs and two windows. Record whether required storage and Web Locks capabilities are available.
- [ ] Block site storage before creation. Confirm one synchronous `CapabilityError` and no transport/listener/lock attachment.
- [ ] Revoke or exhaust storage after readiness during state mutation, view claim, and `open()`. Confirm each transaction fails without partial local commit.
- [ ] Corrupt presence/view projection storage and confirm quarantine; corrupt leader/view generations and confirm authority acquisition fails without resetting the value.
- [ ] Force-quit and restart the browser. Confirm Tabula does not claim persistent state, ownership continuity, or cleanup callbacks after process death.

## Windows, popups, and focus

- [ ] Open an exclusive named view from a user gesture and verify handoff, conflict, focus request delivery, timeout cleanup, and vacancy.
- [ ] Attempt the same open without a user gesture and record popup policy. A blocked popup must leave no pending intent.
- [ ] Request focus while the owner is in another window/desktop. Record request delivery separately from whether browser policy foregrounds it.

## Result

- Status: pending manual execution
- Commit/deployment:
- Findings/issues:
- Evidence links:
- Reviewer:
