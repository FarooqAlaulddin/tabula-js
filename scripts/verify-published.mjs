import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const packageName = '@thinkly/tabula-js'
const version = process.argv[2]
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version ?? '')) {
	throw new Error('usage: node scripts/verify-published.mjs <exact-version>')
}
const specification = `${packageName}@${version}`
const tempRoot = await mkdtemp(path.join(tmpdir(), 'tabula-published-gate-'))

function run(command, args, options = {}) {
	const result = spawnSync(command, args, {
		cwd: options.cwd ?? root,
		encoding: 'utf8',
		stdio: options.capture ? 'pipe' : 'inherit',
		env: { ...process.env, CI: 'true', ...options.env },
	})
	if (result.error) throw result.error
	if (result.status !== 0) {
		throw new Error(
			`${command} ${args.join(' ')} failed\n${result.stdout ?? ''}\n${result.stderr ?? ''}`,
		)
	}
	return (result.stdout ?? '').trim()
}

async function sha256(file) {
	return createHash('sha256')
		.update(await readFile(file))
		.digest('hex')
}

try {
	const packed = JSON.parse(
		run('npm', ['pack', specification, '--json', '--pack-destination', tempRoot], {
			capture: true,
		}),
	)[0]
	if (packed.name !== packageName || packed.version !== version) {
		throw new Error(`registry returned ${packed.name}@${packed.version}, expected ${specification}`)
	}
	const tarball = path.join(tempRoot, packed.filename)
	if (!existsSync(tarball)) throw new Error(`npm pack did not create ${packed.filename}`)

	run('node', ['scripts/verify-package.mjs', '--package', tarball])
	run('node', ['scripts/verify-docs.mjs', '--package', tarball])

	const consumer = path.join(tempRoot, 'consumer')
	await mkdir(consumer)
	run(
		'npm',
		[
			'install',
			'--no-save',
			'--no-package-lock',
			'--ignore-scripts',
			'--no-audit',
			'--no-fund',
			tarball,
		],
		{ cwd: consumer },
	)
	const packageEntry = path.join(consumer, 'node_modules/@thinkly/tabula-js/dist/index.js')
	if (!existsSync(packageEntry)) throw new Error('published package is missing its ESM entry')

	run('pnpm', ['exec', 'playwright', 'test', '--config', 'e2e/playwright.config.ts'], {
		env: { TABULA_PACKAGE_ENTRY: packageEntry },
	})
	run('pnpm', ['demo:test'], { env: { TABULA_PACKAGE_TARBALL: tarball } })
	run('pnpm', ['compat:test'], { env: { TABULA_PACKAGE_TARBALL: tarball } })

	const artifactDirectory = path.join(root, 'release-artifacts')
	await mkdir(artifactDirectory, { recursive: true })
	const details = await stat(tarball)
	const evidence = {
		schemaVersion: 1,
		package: { name: packageName, version },
		specification,
		registry: 'https://registry.npmjs.org',
		tarball: {
			file: packed.filename,
			bytes: details.size,
			integrity: packed.integrity,
			shasum: packed.shasum,
			sha256: await sha256(tarball),
		},
		sourceCommit: run('git', ['rev-parse', 'HEAD'], { capture: true }),
		verifiedAt: new Date().toISOString(),
		gates: {
			package: 'passed',
			documentationSamples: 'passed',
			e2e: ['chromium', 'firefox', 'webkit'],
			demo: ['chromium', 'firefox', 'webkit'],
			compatibility: ['chromium', 'firefox', 'webkit'],
		},
	}
	const evidenceFile = path.join(artifactDirectory, `published-${version}-verification.json`)
	await writeFile(evidenceFile, `${JSON.stringify(evidence, null, 2)}\n`)
	console.log(JSON.stringify(evidence, null, 2))
} finally {
	await rm(tempRoot, { recursive: true, force: true })
}
