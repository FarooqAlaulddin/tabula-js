import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { assertDistTag, requiredDistTag, validateReleaseManifest } from './release-policy.mjs'

describe('release dist-tag policy', () => {
	it.each(['0.2.0-alpha.0', '0.2.0', '0.8.0', '0.9.7', '1.0.0-rc.1'])(
		'rejects latest for %s',
		(version) => {
			expect(() => assertDistTag(version, 'latest')).toThrow(/must publish with the next/)
		},
	)

	it('allows latest only for a stable 1.x release', () => {
		expect(requiredDistTag('1.0.0')).toBe('latest')
		expect(() => assertDistTag('1.0.0', 'latest')).not.toThrow()
	})

	it('requires public access and provenance in the manifest', () => {
		const manifest = {
			schemaVersion: 1,
			package: { name: '@thinkly/tabula-js', version: '0.2.0' },
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

describe('trusted-publishing workflow', () => {
	it('does not configure token-based registry authentication in the publish job', () => {
		const workflow = readFileSync('.github/workflows/release.yml', 'utf8')
		const publishJob = workflow.split('\n  publish:')[1]?.split('\n  verify-published:')[0]

		expect(publishJob).toBeDefined()
		expect(publishJob).toContain('id-token: write')
		expect(publishJob).toContain('release.mjs publish')
		expect(publishJob).not.toContain('registry-url:')
		expect(publishJob).not.toContain('NODE_AUTH_TOKEN:')
		expect(publishJob).not.toContain('NPM_TOKEN:')
	})

	it('passes the exact version as the verifier script argument', () => {
		const workflow = readFileSync('.github/workflows/release.yml', 'utf8')
		const verificationJob = workflow.split('\n  verify-published:')[1]

		expect(verificationJob).toContain(
			'pnpm published:check "${{ needs.candidate.outputs.version }}"',
		)
		expect(verificationJob).not.toContain('pnpm published:check --')
	})
})
