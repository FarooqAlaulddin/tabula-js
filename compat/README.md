# Frozen compatibility fixtures

`v1-rev0` is the synthetic previous-compatible participant used to exercise protocol
revision 0. `unsupported-v2` proves the one-shot recovery path for non-overlapping
protocol ranges. `0.2.0` contains the exact published package tarball and an
independently bundled participant for future candidates. Every immutable input is
identified by SHA-256 in `fixtures/manifest.json`; the build fails if content and
metadata differ.

P4-003 and P6-001 must test against the frozen `0.2.0` artifact, never an npm
dist-tag. Recreate a published fixture only when initially recording a new immutable
version:

```bash
pnpm compat:snapshot -- 0.2.0 <full-source-commit> 1:1:0
```

The snapshot command refuses to overwrite an existing version. It downloads an exact
registry version, records npm integrity and checksums, and bundles
`published-participant.js` against those package bytes. Run `pnpm compat:test` and
review all browser cases before committing the new fixture.
