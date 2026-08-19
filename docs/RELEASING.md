# Release procedure

Tabula has one publishable package: `@farooqalaulddin/tabula-js`. The Excalidraw
example and repository root are private and ignored by Changesets. No command in this
procedure embeds registry credentials; publishing is performed by the trusted GitHub
Actions workflow after its build, test, package, and provenance gates pass.

## Standing change rule

Every user-visible package change includes a changeset before merge:

```bash
pnpm changeset
pnpm changeset:status
```

Use an empty changeset only for repository-only work that CI requires to acknowledge.
Do not combine unrelated consumer changes in one summary.

## Dist-tags

All prereleases and normal `0.x` checkpoints use `next`. Nothing in the v1 feature
milestone publishes to `latest`; that tag is reserved for a future `1.0.0` decision.
The repository-pinned publish command consumes
an already validated tarball:

```bash
pnpm release:publish:next
```

## One-time package bootstrap

An npm trusted publisher is configured from an existing package's settings. For a
brand-new package name, create the registry entry once with an authenticated
maintainer session before attempting the first OIDC release. Publish a minimal
`0.0.0` ownership placeholder under a non-installation tag such as `bootstrap`; do
not publish Tabula source and do not create `latest`:

```bash
npm login
npm publish ./path/to/tabula-name-placeholder --access public --tag bootstrap
npm view @farooqalaulddin/tabula-js dist-tags --json
```

The placeholder must contain only package identity and repository metadata. Keep it
outside the workspace release train, and record its version, tag, and registry URL
in P4-002. If npm permits the package to be claimed without publishing a version,
prefer that path and omit the placeholder.

## Trusted publisher setup

After the package exists and before dispatching the alpha release, complete this
checklist in npm and GitHub:

- [x] Make `FarooqAlaulddin/tabula-js` public; npm provenance is unavailable for a
  private source repository.
- [ ] Create or claim the public npm package `@farooqalaulddin/tabula-js` using the
  one-time bootstrap above if necessary.
- [ ] Configure its GitHub Actions trusted publisher for owner `FarooqAlaulddin`,
  repository `tabula-js`, workflow `release.yml`, environment `npm`, with
  `npm publish` allowed.
- [x] Create the protected GitHub `npm` environment, restrict deployments to `main`,
  and require approval from `FarooqAlaulddin`.
- [x] Confirm no `NPM_TOKEN` or `NODE_AUTH_TOKEN` repository or `npm` environment
  secret exists.
- [x] Confirm the package repository URL exactly matches the public GitHub repository.

Trusted publishing requires npm CLI 11.5.1 or newer and Node 22.14.0 or newer. The
workflow pins Node 22.14.0 and npm 11.12.1, grants `id-token: write` only to the final
publish job, and explicitly requests public access and provenance. See npm's
[trusted publishing](https://docs.npmjs.com/trusted-publishers/) and
[provenance](https://docs.npmjs.com/generating-provenance-statements/) documentation.

## Workflow operation

Pushes to `main` create or update the Changesets version pull request. Pull requests
that change release inputs run the complete unprivileged candidate pipeline. A manual
dispatch defaults to dry-run and performs lint, build, typecheck, unit, three-engine
browser, packed demo, compatibility, and package gates before running the exact
`npm publish` command with `--dry-run` against one retained tarball.

After reviewing the version PR and dry-run artifact, dispatch `Release` on `main` with
`dry_run=false`. The separate `npm` environment job downloads and checksum-verifies
those same bytes, publishes through OIDC, creates an annotated package/version tag,
and attaches the tarball and machine-readable manifest to the GitHub release. It then
packs the exact version back from npm and reruns the package, documentation, E2E,
demo, and compatibility gates against registry bytes. The resulting
`published-<version>-verification.json` artifact is retained for 90 days.

A dry run does not prove the OIDC exchange or registry provenance attestation;
P4-002's `0.2.0-alpha.0` publish is that first integration proof. A failed publish or
registry verification is corrected with a new immutable prerelease version, never by
rewriting an existing package version.

## 0.2.0 alpha and preview

With the pending minor changeset present:

```bash
pnpm changeset:pre enter alpha
pnpm changeset:version
pnpm changeset:status
```

This produces `0.2.0-alpha.0`; later accepted changesets increment the alpha number.
After the alpha artifact passes its gates, leave prerelease mode and create the normal
technical preview:

```bash
pnpm changeset:pre exit
pnpm changeset:version
pnpm changeset:status
```

Both artifacts are published with `release:publish:next`.

## Later 0.x previews

Add patch or minor changesets, run `pnpm changeset:version`, and publish with `next`.
Any behavior correction resets the affected burn-in evidence window.

## 0.4.0 through 0.7.0 evidence checkpoints

The dogfood, stabilization, burn-in, and release-readiness phases publish `0.4.0`,
`0.5.0`, `0.6.0`, and `0.7.0` respectively under `next`. Each is an immutable evidence
checkpoint. Corrections use an appropriate patch or later minor and reset affected
evidence; they never skip a gate merely to preserve the nominal sequence.

## 0.8.0 milestone release

After the `0.7.x` readiness candidate and final human gate pass, prepare `0.8.0` as a
version/changelog-only release. Runtime, declarations, exports, protocol, defaults,
errors, and behavioral documentation must match the approved candidate. Validate and
publish it with the same `next` workflow:

```bash
pnpm changeset:version
pnpm changeset:status
pnpm release:publish:next
```

Post-publish verification must install exact `0.8.0` registry bytes. `latest` remains
absent or unchanged. A future `1.0.0` requires a separate compatibility decision and
release plan; it is not an automatic promotion performed by this milestone.
