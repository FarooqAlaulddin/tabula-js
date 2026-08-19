import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
import { chromium } from '@playwright/test'
import { build } from 'esbuild'
import {
	validateBundle,
	validateExportFiles,
	validateGzipSize,
	validateManifest,
	validateTarEntries,
} from './package-policy.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const packageDir = path.join(root, 'packages/tabula')
const policy = JSON.parse(readFileSync(path.join(root, 'config/package-gate.json'), 'utf8'))
const packageIndex = process.argv.indexOf('--package')
const suppliedPackage =
	packageIndex === -1 ? null : path.resolve(process.argv[packageIndex + 1] ?? '')
const tempRoot = await mkdtemp(path.join(tmpdir(), 'tabula-package-gate-'))
const normalizedTempRoot = path.resolve(tempRoot)
if (
	path.dirname(normalizedTempRoot) !== path.resolve(tmpdir()) ||
	!path.basename(normalizedTempRoot).startsWith('tabula-package-gate-')
) {
	throw new Error(`invalid package-gate temporary directory: ${normalizedTempRoot}`)
}

function lines(...values) {
	return `${values.join('\n')}\n`
}

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
	return result.stdout ?? ''
}

async function installConsumer(name, typescriptVersion) {
	const directory = path.join(tempRoot, name)
	await mkdir(directory)
	await writeFile(
		path.join(directory, 'package.json'),
		JSON.stringify({ name, private: true, type: 'module' }),
	)
	run('npm', [
		'install',
		'--prefix',
		directory,
		'--no-package-lock',
		'--ignore-scripts',
		'--no-audit',
		'--no-fund',
		tarball,
		`typescript@${typescriptVersion}`,
	])
	return directory
}

async function compileDeclarations(directory) {
	await writeFile(
		path.join(directory, 'index.ts'),
		lines(
			`import { createWorkspace, type Workspace } from '${policy.packageName}'`,
			`import { createMockWorkspace, createTestCluster } from '${policy.packageName}/testing'`,
			`interface State { theme: 'light' | 'dark' }`,
			`const workspace: Workspace<State> = createWorkspace<State>('typed')`,
			`workspace.state.set('theme', 'dark')`,
			`createMockWorkspace<State>().state.set('theme', 'light')`,
			`createTestCluster<State>('typed-cluster').createTab()`,
		),
	)
	await writeFile(
		path.join(directory, 'index.cts'),
		lines(
			`import { createWorkspace } from '${policy.packageName}'`,
			`import { createMockWorkspace } from '${policy.packageName}/testing'`,
			'void createWorkspace',
			'void createMockWorkspace',
		),
	)
	await writeFile(
		path.join(directory, 'tsconfig.json'),
		JSON.stringify({
			compilerOptions: {
				target: 'ES2022',
				module: 'NodeNext',
				moduleResolution: 'NodeNext',
				lib: ['ES2022', 'DOM'],
				strict: true,
				noEmit: true,
				skipLibCheck: false,
			},
			include: ['index.ts', 'index.cts'],
		}),
	)
	run(path.join(directory, 'node_modules/typescript/bin/tsc'), ['-p', 'tsconfig.json'], {
		capture: true,
		env: { NODE_OPTIONS: '' },
		cwd: directory,
	})
}

async function executeNodeConsumers(directory) {
	await writeFile(
		path.join(directory, 'esm.mjs'),
		lines(
			`import { strict as assert } from 'node:assert'`,
			`import { createWorkspace } from '${policy.packageName}'`,
			`import { createMockWorkspace, createTestCluster } from '${policy.packageName}/testing'`,
			"assert.equal(typeof createWorkspace, 'function')",
			'const mock = createMockWorkspace()',
			"mock.state.set('key', 1)",
			"assert.equal(mock.state.get('key'), 1)",
			"assert.equal(typeof createTestCluster('esm').createTab, 'function')",
		),
	)
	await writeFile(
		path.join(directory, 'cjs.cjs'),
		lines(
			`const assert = require('node:assert').strict`,
			`const { createWorkspace } = require('${policy.packageName}')`,
			`const { createMockWorkspace, createTestCluster } = require('${policy.packageName}/testing')`,
			"assert.equal(typeof createWorkspace, 'function')",
			'const mock = createMockWorkspace()',
			"mock.state.set('key', 1)",
			"assert.equal(mock.state.get('key'), 1)",
			"assert.equal(typeof createTestCluster('cjs').createTab, 'function')",
		),
	)
	run('node', ['esm.mjs'], { capture: true, cwd: directory })
	run('node', ['cjs.cjs'], { capture: true, cwd: directory })
}

async function browserBundleSmoke(directory) {
	const result = await build({
		stdin: {
			contents: `import { createWorkspace } from '${policy.packageName}'; globalThis.__packageSmoke = typeof createWorkspace === 'function'`,
			resolveDir: directory,
			sourcefile: 'consumer.ts',
		},
		bundle: true,
		format: 'esm',
		minify: true,
		platform: 'browser',
		target: 'es2022',
		treeShaking: true,
		write: false,
	})
	const bundle = result.outputFiles[0].contents
	const source = new TextDecoder().decode(bundle)
	validateBundle(source)
	const gzipBytes = gzipSync(bundle, { level: 9 }).length
	validateGzipSize(gzipBytes, policy.gzipBudgetBytes)

	const server = createServer((request, response) => {
		response.setHeader(
			'content-type',
			request.url === '/bundle.js' ? 'text/javascript' : 'text/html',
		)
		response.end(
			request.url === '/bundle.js'
				? bundle
				: '<!doctype html><script type="module" src="/bundle.js"></script>',
		)
	})
	await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
	const address = server.address()
	if (!address || typeof address === 'string') throw new Error('package smoke server failed')
	const browser = await chromium.launch()
	try {
		const page = await browser.newPage()
		await page.goto(`http://127.0.0.1:${address.port}/`)
		await page.waitForFunction(() => globalThis.__packageSmoke === true)
	} finally {
		await browser.close()
		await new Promise((resolve, reject) =>
			server.close((error) => (error ? reject(error) : resolve())),
		)
	}
	return { gzipBytes, minifiedBytes: bundle.length }
}

let tarball
try {
	if (suppliedPackage) {
		if (!existsSync(suppliedPackage) || !suppliedPackage.endsWith('.tgz')) {
			throw new Error(`--package must identify an existing .tgz: ${suppliedPackage}`)
		}
		tarball = suppliedPackage
	} else {
		run('pnpm', ['--filter', policy.packageName, 'build'])
		run('pnpm', ['pack', '--pack-destination', tempRoot], { cwd: packageDir })
		const tarballName = (await readdir(tempRoot)).find((name) => name.endsWith('.tgz'))
		if (!tarballName) throw new Error('package command did not produce a tarball')
		tarball = path.join(tempRoot, tarballName)
	}

	const entries = run('tar', ['-tzf', tarball], { capture: true }).trim().split('\n')
	validateTarEntries(entries, policy.staticTarballFiles)

	const extracted = path.join(tempRoot, 'extracted')
	await mkdir(extracted)
	run('tar', ['-xzf', tarball, '-C', extracted])
	const packageRoot = path.join(extracted, 'package')
	const manifest = JSON.parse(await readFile(path.join(packageRoot, 'package.json'), 'utf8'))
	validateManifest(manifest, policy.packageName)
	validateExportFiles(packageRoot, (directory, file) => existsSync(path.join(directory, file)))

	for (const file of (await readdir(path.join(packageRoot, 'dist'))).filter((name) =>
		/\.(?:js|cjs)$/.test(name),
	)) {
		const mapFile = path.join(packageRoot, 'dist', `${file}.map`)
		if (!existsSync(mapFile)) throw new Error(`missing external source map for ${file}`)
		JSON.parse(await readFile(mapFile, 'utf8'))
	}

	run('pnpm', ['exec', 'publint', packageRoot], { capture: true })
	run(
		'pnpm',
		[
			'exec',
			'attw',
			tarball,
			'--profile',
			'node16',
			'--entrypoints',
			'.',
			'./testing',
			'--no-emoji',
			'--no-color',
		],
		{ capture: true },
	)

	const minimum = await installConsumer('consumer-typescript-minimum', policy.typescript.minimum)
	await compileDeclarations(minimum)
	await executeNodeConsumers(minimum)
	const latest = await installConsumer('consumer-typescript-latest', policy.typescript.latest)
	await compileDeclarations(latest)
	const bundle = await browserBundleSmoke(minimum)
	const packageOutput = process.env.TABULA_PACKAGE_OUTPUT
	if (packageOutput) {
		if (suppliedPackage) throw new Error('cannot copy a supplied package as a release candidate')
		const normalizedOutput = path.resolve(packageOutput)
		const allowedDirectory = path.join(root, 'release-artifacts')
		if (path.dirname(normalizedOutput) !== allowedDirectory || !normalizedOutput.endsWith('.tgz')) {
			throw new Error(`invalid validated-package output path: ${normalizedOutput}`)
		}
		await mkdir(allowedDirectory, { recursive: true })
		await copyFile(tarball, normalizedOutput)
	}

	console.log(
		JSON.stringify({
			package: `${manifest.name}@${manifest.version}`,
			tarballFiles: entries.length,
			typescript: policy.typescript,
			bundle,
			gzipBudgetBytes: policy.gzipBudgetBytes,
			...(packageOutput ? { validatedPackage: path.resolve(packageOutput) } : {}),
		}),
	)
} finally {
	await rm(normalizedTempRoot, { recursive: true, force: true })
}
