import { describe, expect, it } from 'vitest'
import {
	validateBundle,
	validateGzipSize,
	validateManifest,
	validateTarEntries,
} from './package-policy.mjs'

const manifest = {
	name: '@thinkly/tabula-js',
	sideEffects: false,
	engines: { node: '>=20' },
	publishConfig: { access: 'public' },
	exports: {
		'.': {
			import: { types: './dist/index.d.ts', default: './dist/index.js' },
			require: { types: './dist/index.d.cts', default: './dist/index.cjs' },
		},
		'./testing': {
			import: { types: './dist/testing.d.ts', default: './dist/testing.js' },
			require: { types: './dist/testing.d.cts', default: './dist/testing.cjs' },
		},
	},
}

describe('package gate negative controls', () => {
	it('rejects runtime dependencies and broken exports', () => {
		expect(() =>
			validateManifest({ ...manifest, dependencies: { leftpad: '1.0.0' } }, manifest.name),
		).toThrow('runtime dependencies')
		expect(() => validateManifest({ ...manifest, exports: {} }, manifest.name)).toThrow(
			'exports differ',
		)
	})

	it('rejects unexpected tarball files', () => {
		expect(() =>
			validateTarEntries(
				[
					'package/package.json',
					'package/dist/chunk-ABC123.js',
					'package/dist/chunk-ABC123.js.map',
					'package/src.ts',
				],
				['package/package.json'],
			),
		).toThrow('unexpected=[package/src.ts]')
	})

	it('rejects testing code in the core bundle and gzip overruns', () => {
		expect(() => validateBundle('const createTestCluster = true')).toThrow('testing code leaked')
		expect(() => validateGzipSize(101, 100)).toThrow('budget is 100')
	})
})
