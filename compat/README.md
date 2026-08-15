# Frozen compatibility fixtures

`v1-rev0` is the synthetic previous-compatible participant used before a real
`0.2.0` package exists. `unsupported-v2` proves the one-shot recovery path for
non-overlapping protocol ranges. Both files are immutable inputs identified by
SHA-256 in `fixtures/manifest.json`; the build fails if content and metadata differ.

P4-002 must supplement the synthetic participant with the exact published `0.2.0`
tarball. Record package version, tarball integrity, protocol range, fixture checksum,
source commit, and registry URL. P4-003 and P6-001 must test against that frozen
artifact, never an npm dist-tag.

To update intentionally, add a new versioned directory, bundle from a pinned tarball,
record its SHA-256, run `pnpm compat:test`, and review both browser cases. Never
overwrite a fixture that represents a published package.
