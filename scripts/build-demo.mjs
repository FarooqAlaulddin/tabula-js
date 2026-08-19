import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const packageDir = path.join(root, 'packages/tabula')
const tempRoot = await mkdtemp(path.join(tmpdir(), 'tabula-demo-'))

function run(command, args, options = {}) {
	const result = spawnSync(command, args, {
		cwd: root,
		stdio: 'inherit',
		env: process.env,
		...options,
	})
	if (result.status !== 0) process.exitCode = result.status ?? 1
	if (result.error) throw result.error
	if (process.exitCode) throw new Error(`${command} ${args.join(' ')} failed`)
}

try {
	let tarball = process.env.TABULA_PACKAGE_TARBALL
	if (tarball) {
		tarball = path.resolve(tarball)
		if (!existsSync(tarball) || !tarball.endsWith('.tgz')) {
			throw new Error(`TABULA_PACKAGE_TARBALL must identify an existing .tgz: ${tarball}`)
		}
	} else {
		run('pnpm', ['--filter', '@thinkly/tabula-js', 'build'])
		run('pnpm', ['pack', '--pack-destination', tempRoot], { cwd: packageDir })
		const tarballName = (await readdir(tempRoot)).find((name) => name.endsWith('.tgz'))
		if (!tarballName) throw new Error('pnpm pack did not produce a tarball')
		tarball = path.join(tempRoot, tarballName)
	}

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
		tarball,
	])

	const packageEntry = path.join(consumerDir, 'node_modules/@thinkly/tabula-js/dist/index.js')
	if (!existsSync(packageEntry)) throw new Error('packed package is missing its ESM entry')

	run('pnpm', ['exec', 'vite', 'build', '--config', 'demo/vite.config.ts'], {
		env: {
			...process.env,
			TABULA_DEMO_BASE: process.env.TABULA_DEMO_BASE ?? '/tabula-js/',
			TABULA_PACKAGE_ENTRY: packageEntry,
		},
	})

	run('pnpm', ['exec', 'vite', 'build', '--config', 'packages/example-excalidraw/vite.config.ts'], {
		env: {
			...process.env,
			TABULA_EXCALIDRAW_BASE: process.env.TABULA_EXCALIDRAW_BASE ?? '/tabula-js/excalidraw/',
			TABULA_EXCALIDRAW_OUT_DIR:
				process.env.TABULA_EXCALIDRAW_OUT_DIR ?? path.join(root, 'demo/dist/excalidraw'),
			TABULA_PACKAGE_ENTRY: packageEntry,
		},
	})
} finally {
	await rm(tempRoot, { recursive: true, force: true })
}
