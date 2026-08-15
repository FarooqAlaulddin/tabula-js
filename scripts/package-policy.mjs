const requiredExportFiles = [
	'dist/index.js',
	'dist/index.cjs',
	'dist/index.d.ts',
	'dist/index.d.cts',
	'dist/testing.js',
	'dist/testing.cjs',
	'dist/testing.d.ts',
	'dist/testing.d.cts',
]

export function validateManifest(manifest, expectedName) {
	if (manifest.name !== expectedName) throw new Error(`unexpected package name: ${manifest.name}`)
	if (manifest.private) throw new Error('publishable package cannot be private')
	if (manifest.sideEffects !== false) throw new Error('sideEffects must be false')
	if (Object.keys(manifest.dependencies ?? {}).length > 0) {
		throw new Error('runtime dependencies must remain empty')
	}
	if (manifest.publishConfig?.access !== 'public') throw new Error('package access must be public')
	if (manifest.engines?.node !== '>=20') throw new Error('Node testing support floor must be >=20')

	const expected = {
		'.': {
			import: { types: './dist/index.d.ts', default: './dist/index.js' },
			require: { types: './dist/index.d.cts', default: './dist/index.cjs' },
		},
		'./testing': {
			import: { types: './dist/testing.d.ts', default: './dist/testing.js' },
			require: { types: './dist/testing.d.cts', default: './dist/testing.cjs' },
		},
	}
	if (JSON.stringify(manifest.exports) !== JSON.stringify(expected)) {
		throw new Error('package exports differ from the gated ESM/CJS/type map')
	}
}

export function validateTarEntries(entries, staticFiles) {
	const normalized = [...new Set(entries.filter(Boolean).map((entry) => entry.replace(/\/$/, '')))]
	const chunks = normalized.filter((entry) =>
		/^package\/dist\/chunk-[A-Z0-9]+\.js(?:\.map)?$/.test(entry),
	)
	if (chunks.length !== 2 || !chunks.some((entry) => entry.endsWith('.js'))) {
		throw new Error(`expected one shared JS chunk and map, received: ${chunks.join(', ')}`)
	}
	const expected = new Set([...staticFiles, ...chunks])
	const unexpected = normalized.filter((entry) => !expected.has(entry))
	const missing = [...expected].filter((entry) => !normalized.includes(entry))
	if (unexpected.length || missing.length || normalized.length !== expected.size) {
		throw new Error(
			`tarball contents differ; unexpected=[${unexpected.join(', ')}] missing=[${missing.join(', ')}]`,
		)
	}
}

export function validateExportFiles(packageRoot, exists) {
	const missing = requiredExportFiles.filter((file) => !exists(packageRoot, file))
	if (missing.length) throw new Error(`missing exported files: ${missing.join(', ')}`)
}

export function validateBundle(source) {
	for (const testingMarker of ['createTestCluster', 'MockWorkspace', 'mock-tab-']) {
		if (source.includes(testingMarker)) {
			throw new Error(`testing code leaked into the core consumer bundle: ${testingMarker}`)
		}
	}
}

export function validateGzipSize(actualBytes, budgetBytes) {
	if (actualBytes > budgetBytes) {
		throw new Error(`core browser bundle is ${actualBytes} bytes gzip; budget is ${budgetBytes}`)
	}
}
