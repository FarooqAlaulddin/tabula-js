# Safari on macOS verification checklist

Checklist prepared: 2026-08-14. A completed run must record the macOS version,
Safari version, hardware, date, tester, deployed commit, and any browser settings
that differ from defaults. Linux Playwright WebKit results are not Safari evidence.

Use two separate Safari windows and at least three tabs on the same secure origin.
Run once in a normal profile and repeat the storage/private-browsing cases in a
private window. Attach console output and screenshots for every failure.

## Automated-suite parity

- [ ] Run the production-build browser smoke suite in Safari or Safari Technology Preview.
- [ ] Confirm all tabs reach `ready`; record any tab that remains `repairing` and its missing peers.
- [ ] Confirm a capability-limited or storage-blocked context fails with one actionable error.

## Leadership

- [ ] With three tabs, observe one leader identity and one active leader callback.
- [ ] Close the leader and confirm eventual transfer without overlapping callback intervals.
- [ ] Background the leader past the presence timeout; confirm no second lock holder appears.
- [ ] Return the leader, then release/destroy it and confirm normal transfer.

## State and presence

- [ ] Set, delete, and batch related UI keys; confirm all live tabs converge.
- [ ] Suspend a responder past readiness and confirm a late joiner reports and completes repair.
- [ ] Close one of three tabs and confirm eventual leave/vacancy without removing live tabs.
- [ ] Put the Mac to sleep past the presence timeout, wake it, and confirm identity and state repair.

## Named views and focus policy

- [ ] Claim one editor view; confirm seven simultaneous competing claims cannot obtain authority.
- [ ] Close the owner abruptly and confirm eventual vacancy and successful re-claim with a newer token.
- [ ] Refresh the owner and confirm reacquisition uses a newer token with no ghost owner.
- [ ] Background the owner past the timeout and confirm its held lock is not stolen.
- [ ] Trigger `open()` from a user gesture; confirm handoff and pending-intent cleanup.
- [ ] Trigger `open()` outside a gesture and record Safari's popup result.
- [ ] Request `focus()` from another tab and record whether Safari foregrounds the owner; verify request delivery separately.

## Lifecycle and storage

- [ ] Navigate away and back; record whether bfcache was used and verify the same tab identity on restore.
- [ ] Enable Low Power Mode or background throttling and confirm eventual recovery.
- [ ] Block site storage and verify workspace creation fails atomically.
- [ ] Corrupt non-authoritative storage and verify quarantine; corrupt an authority generation and verify acquisition fails without reset.
- [ ] Exercise quota failure during state/open/claim transactions and verify no partial local commit.
- [ ] Force-quit Safari, reopen the session, and confirm no persisted shared state or false ownership claim is promised.

## Result

- Status: pending manual Safari run
- Findings/issues:
- Evidence links:
- Reviewer:
