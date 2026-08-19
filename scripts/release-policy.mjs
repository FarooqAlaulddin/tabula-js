const SEMVER =
	/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/

export function parseVersion(version) {
	const match = SEMVER.exec(version)
	if (!match) throw new Error(`invalid release version: ${version}`)
	return {
		major: Number(match[1]),
		minor: Number(match[2]),
		patch: Number(match[3]),
		prerelease: match[4] ?? null,
	}
}

export function requiredDistTag(version) {
	const parsed = parseVersion(version)
	return parsed.major < 1 || parsed.prerelease ? 'next' : 'latest'
}

export function assertDistTag(version, distTag) {
	const required = requiredDistTag(version)
	if (distTag !== required) {
		throw new Error(`${version} must publish with the ${required} dist-tag, not ${distTag}`)
	}
}

export function validateReleaseManifest(manifest, expected) {
	if (manifest.schemaVersion !== 1) throw new Error('unsupported release manifest schema')
	if (manifest.package.name !== expected.name || manifest.package.version !== expected.version) {
		throw new Error('release manifest package identity does not match package.json')
	}
	if (manifest.distTag !== expected.distTag) throw new Error('release manifest dist-tag changed')
	if (manifest.access !== 'public' || manifest.provenance !== true) {
		throw new Error('release manifest must require public access and provenance')
	}
	assertDistTag(manifest.package.version, manifest.distTag)
}
