import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { cp, mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const packageDir = path.join(root, 'packages/tabula')
const fixtureRoot = path.join(root, 'compat/fixtures')
const manifest = JSON.parse(await readFile(path.join(fixtureRoot, 'manifest.json'), 'utf8'))
const tempRoot = await mkdtemp(path.join(tmpdir(), 'tabula-compat-'))
const normalizedTempRoot = path.resolve(tempRoot)
if (
	path.dirname(normalizedTempRoot) !== path.resolve(tmpdir()) ||
	!path.basename(normalizedTempRoot).startsWith('tabula-compat-')
) {
	throw new Error(`invalid compatibility temporary directory: ${normalizedTempRoot}`)
}

function run(command, args, options = {}) {
	const result = spawnSync(command, args, {
		cwd: options.cwd ?? root,
		stdio: 'inherit',
		env: { ...process.env, ...options.env },
	})
	if (result.error) throw result.error
	if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed`)
}

async function verifyFixtures() {
	if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.fixtures)) {
		throw new Error('compatibility fixture manifest has an unsupported schema')
	}
	for (const fixture of manifest.fixtures) {
		const contents = await readFile(path.join(fixtureRoot, fixture.file))
		const checksum = createHash('sha256').update(contents).digest('hex')
		if (checksum !== fixture.sha256) {
			throw new Error(
				`${fixture.id} checksum mismatch: expected ${fixture.sha256}, got ${checksum}`,
			)
		}
	}
}

try {
	await verifyFixtures()
	run('pnpm', ['--filter', '@farooqalaulddin/tabula-js', 'build'])
	run('pnpm', ['pack', '--pack-destination', tempRoot], { cwd: packageDir })

	const tarballName = (await readdir(tempRoot)).find((name) => name.endsWith('.tgz'))
	if (!tarballName) throw new Error('pnpm pack did not produce a tarball')

	const consumerDir = path.join(tempRoot, 'consumer')
	await mkdir(consumerDir)
	run('npm', [
		'install',
		'--prefix',
		consumerDir,
		'--no-save',
		'--no-package-lock',
		'--ignore-scripts',
		'--no-audit',
		'--no-fund',
		path.join(tempRoot, tarballName),
	])

	const packageEntry = path.join(
		consumerDir,
		'node_modules/@farooqalaulddin/tabula-js/dist/index.js',
	)
	if (!existsSync(packageEntry)) throw new Error('packed package is missing its ESM entry')

	run('pnpm', ['exec', 'vite', 'build', '--config', 'compat/vite.config.ts'], {
		env: {
			TABULA_COMPAT_BASE: process.env.TABULA_COMPAT_BASE ?? '/compat/',
			TABULA_PACKAGE_ENTRY: packageEntry,
		},
	})
	await cp(fixtureRoot, path.join(root, 'compat/dist/fixtures'), { recursive: true })
} finally {
	await rm(tempRoot, { recursive: true, force: true })
}
