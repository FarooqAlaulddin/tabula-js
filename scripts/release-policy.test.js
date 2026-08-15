import { describe, expect, it } from 'vitest'
import { assertDistTag, requiredDistTag, validateReleaseManifest } from './release-policy.mjs'

describe('release dist-tag policy', () => {
	it.each(['0.2.0-alpha.0', '0.2.0', '0.9.7', '1.0.0-rc.1'])('rejects latest for %s', (version) => {
		expect(() => assertDistTag(version, 'latest')).toThrow(/must publish with the next/)
	})

	it('allows latest only for a stable 1.x release', () => {
		expect(requiredDistTag('1.0.0')).toBe('latest')
		expect(() => assertDistTag('1.0.0', 'latest')).not.toThrow()
	})

	it('requires public access and provenance in the manifest', () => {
		const manifest = {
			schemaVersion: 1,
			package: { name: '@farooqalaulddin/tabula-js', version: '0.2.0' },
			distTag: 'next',
			access: 'public',
			provenance: false,
		}
		expect(() =>
			validateReleaseManifest(manifest, {
				name: manifest.package.name,
				version: manifest.package.version,
				distTag: 'next',
			}),
		).toThrow(/provenance/)
	})
})
