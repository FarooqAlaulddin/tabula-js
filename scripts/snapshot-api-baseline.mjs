import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { declarationExports } from './docs-policy.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const packageDir = path.join(root, 'packages/tabula')
const packageManifest = JSON.parse(await readFile(path.join(packageDir, 'package.json'), 'utf8'))
const safeVersion = packageManifest.version.replace(/[^0-9A-Za-z.-]/g, '_')
const baselineDir = path.join(root, 'v1-milestone/api-baselines', safeVersion)
const artifactDir = path.join(root, 'release-artifacts')
const tarballName = `${packageManifest.name.slice(1).replace('/', '-')}-${packageManifest.version}.tgz`
const tarballPath = path.join(artifactDir, tarballName)
const tempRoot = await mkdtemp(path.join(tmpdir(), 'tabula-api-baseline-'))

function run(executable, args, options = {}) {
	const result = spawnSync(executable, args, {
		cwd: options.cwd ?? root,
		encoding: 'utf8',
		stdio: options.capture ? 'pipe' : 'inherit',
		env: { ...process.env, CI: 'true', ...options.env },
	})
	if (result.error) throw result.error
	if (result.status !== 0) {
		throw new Error(
			`${executable} ${args.join(' ')} failed\n${result.stdout ?? ''}\n${result.stderr ?? ''}`,
		)
	}
	return result.stdout ?? ''
}

async function declarationEntry(packageRoot, file) {
	const source = await readFile(path.join(packageRoot, file), 'utf8')
	const exports = file.endsWith('.d.ts') ? [...declarationExports(source)].sort() : null
	return {
		file,
		sha256: createHash('sha256').update(source).digest('hex'),
		...(exports ? { exports } : {}),
	}
}

try {
	run('git', ['diff', '--quiet', '--', 'packages/tabula'], { capture: true })
	run('git', ['diff', '--cached', '--quiet', '--', 'packages/tabula'], { capture: true })
	await mkdir(artifactDir, { recursive: true })
	await rm(tarballPath, { force: true })
	run('node', ['scripts/verify-package.mjs'], {
		capture: true,
		env: { TABULA_PACKAGE_OUTPUT: tarballPath },
	})
	if (!existsSync(tarballPath)) throw new Error(`validated tarball was not created: ${tarballPath}`)

	const extracted = path.join(tempRoot, 'extracted')
	await mkdir(extracted)
	run('tar', ['-xzf', tarballPath, '-C', extracted])
	const packageRoot = path.join(extracted, 'package')
	const packedManifest = JSON.parse(await readFile(path.join(packageRoot, 'package.json'), 'utf8'))
	const declarationFiles = [
		'dist/index.d.ts',
		'dist/index.d.cts',
		'dist/testing.d.ts',
		'dist/testing.d.cts',
	]

	await rm(baselineDir, { recursive: true, force: true })
	await mkdir(path.join(baselineDir, 'dist'), { recursive: true })
	for (const file of declarationFiles) {
		await cp(path.join(packageRoot, file), path.join(baselineDir, file))
	}

	const packageTree = run('git', ['rev-parse', 'HEAD:packages/tabula'], { capture: true }).trim()
	const manifest = {
		schemaVersion: 1,
		createdBy: 'scripts/snapshot-api-baseline.mjs',
		package: { name: packedManifest.name, version: packedManifest.version },
		source: {
			repository: packedManifest.repository?.url?.replace(/^git\+/, '').replace(/\.git$/, ''),
			packageTree,
		},
		artifact: {
			file: tarballName,
			validatedBy: 'scripts/verify-package.mjs',
		},
		exports: packedManifest.exports,
		declarations: await Promise.all(
			declarationFiles.map((file) => declarationEntry(packageRoot, file)),
		),
	}
	const manifestPath = path.join(baselineDir, 'manifest.json')
	await writeFile(manifestPath, `${JSON.stringify(manifest, null, '\t')}\n`)
	run('pnpm', ['exec', 'biome', 'format', '--write', manifestPath], { capture: true })
	console.log(JSON.stringify(manifest, null, 2))
} finally {
	await rm(tempRoot, { recursive: true, force: true })
	await rm(tarballPath, { force: true })
}
