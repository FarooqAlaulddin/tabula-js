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

All prereleases and normal `0.x` previews use `next`. Nothing publishes to `latest`
before the final `1.0.0` promotion. The repository-pinned publish command is:

```bash
pnpm release:publish:next
```

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

## 1.0.0 release candidates

After the API candidate and burn-in gates pass, add the changeset that moves the
package to `1.0.0`, then enter release-candidate mode:

```bash
pnpm changeset:pre enter rc
pnpm changeset:version
pnpm changeset:status
pnpm release:publish:next
```

Accepted RC corrections carry new changesets and produce the next `rc.N`. To form the
stable version, run `pnpm changeset:pre exit` and `pnpm changeset:version`. The final
stable publish uses the dedicated 1.0 workflow, not `release:publish:next`, and must
promote the exact artifact that passed the RC gate.
