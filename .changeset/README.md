# Changesets

Every user-visible change to `@thinkly/tabula-js` requires a changeset.
Choose the smallest semver bump that describes the public API or behavior change and
write the summary for package consumers. Internal tests, milestone bookkeeping, and
private example-only changes may use an empty changeset when a CI policy requires one.

Pre-1.0 artifacts are published only with the `next` dist-tag. See
[`docs/RELEASING.md`](../docs/RELEASING.md) for the version and prerelease procedure.
