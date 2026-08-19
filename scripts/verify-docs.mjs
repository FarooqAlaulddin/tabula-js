import { spawnSync } from 'node:child_process'
import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'
import { build } from 'esbuild'
import {
	compareSets,
	declarationExports,
	documentedExports,
	extractMarkdownLinks,
	extractVerifiedSamples,
	resolveLocalLink,
} from './docs-policy.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const packageDir = path.join(root, 'packages/tabula')
const packageName = '@farooqalaulddin/tabula-js'
const tempRoot = await mkdtemp(path.join(tmpdir(), 'tabula-docs-gate-'))

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

async function markdownFiles(directory) {
	const files = []
	for (const entry of await readdir(directory, { withFileTypes: true })) {
		if (['.git', 'dist', 'node_modules', 'release-artifacts'].includes(entry.name)) continue
		const target = path.join(directory, entry.name)
		if (entry.isDirectory()) files.push(...(await markdownFiles(target)))
		else if (entry.isFile() && entry.name.endsWith('.md')) files.push(target)
	}
	return files
}

async function verifyLocalLinks(files) {
	let checked = 0
	for (const file of files) {
		const markdown = await readFile(file, 'utf8')
		for (const link of extractMarkdownLinks(markdown)) {
			const target = resolveLocalLink(file, link.destination)
			if (!target) continue
			checked += 1
			try {
				await access(target)
			} catch {
				const line = markdown.slice(0, link.index).split('\n').length
				throw new Error(
					`${path.relative(root, file)}:${line}: broken relative link ${link.destination}`,
				)
			}
		}
	}
	return checked
}

function packageArgument() {
	const index = process.argv.indexOf('--package')
	if (index === -1) return null
	if (!process.argv[index + 1]) throw new Error('--package requires a tarball path')
	return path.resolve(process.argv[index + 1])
}

async function buildTarball() {
	const supplied = packageArgument()
	if (supplied) {
		await access(supplied)
		return supplied
	}
	run('pnpm', ['--filter', packageName, 'build'])
	run('pnpm', ['pack', '--pack-destination', tempRoot], { cwd: packageDir })
	const tarball = (await readdir(tempRoot)).find((file) => file.endsWith('.tgz'))
	if (!tarball) throw new Error('package command did not produce a tarball')
	return path.join(tempRoot, tarball)
}

async function verifyCanonicalApi(readme) {
	const mainDeclaration = await readFile(path.join(packageDir, 'dist/index.d.ts'), 'utf8')
	const testingDeclaration = await readFile(path.join(packageDir, 'dist/testing.d.ts'), 'utf8')
	compareSets(
		documentedExports(readme, 'main'),
		declarationExports(mainDeclaration),
		'main API documentation',
	)
	compareSets(
		documentedExports(readme, 'testing'),
		declarationExports(testingDeclaration),
		'testing API documentation',
	)
}

async function installConsumer(tarball) {
	const directory = path.join(tempRoot, 'consumer')
	await mkdir(directory)
	await writeFile(
		path.join(directory, 'package.json'),
		`${JSON.stringify({ name: 'tabula-doc-samples', private: true, type: 'module' }, null, 2)}\n`,
	)
	run(
		'npm',
		[
			'install',
			'--no-package-lock',
			'--ignore-scripts',
			'--no-audit',
			'--no-fund',
			tarball,
			'typescript@5.7.2',
			'react@19',
			'react-dom@19',
			'@types/react@19',
			'@types/react-dom@19',
		],
		{ cwd: directory },
	)
	return directory
}

async function compileSample(consumer, sample, index) {
	const directory = path.join(consumer, `sample-${index}`)
	await mkdir(directory)
	const extension = sample.language === 'tsx' ? 'tsx' : 'ts'
	const source = path.join(directory, `index.${extension}`)
	await writeFile(source, sample.body)
	await writeFile(
		path.join(directory, 'tsconfig.json'),
		`${JSON.stringify(
			{
				compilerOptions: {
					target: 'ES2022',
					module: 'ESNext',
					moduleResolution: 'Bundler',
					lib: ['ES2022', 'DOM', 'DOM.Iterable'],
					jsx: 'react-jsx',
					strict: true,
					noEmit: true,
					skipLibCheck: false,
				},
				include: [`index.${extension}`],
			},
			null,
			2,
		)}\n`,
	)
	run(path.join(consumer, 'node_modules/typescript/bin/tsc'), ['-p', 'tsconfig.json'], {
		capture: true,
		cwd: directory,
		env: { NODE_OPTIONS: '' },
	})
	return { directory, source }
}

async function serveBundle(bundle, verify) {
	const server = createServer((request, response) => {
		if (request.url === '/bundle.js') {
			response.setHeader('content-type', 'text/javascript')
			response.end(bundle)
			return
		}
		response.setHeader('content-type', 'text/html')
		response.end(
			'<!doctype html><html><body><div id="root"></div><script type="module" src="/bundle.js"></script></body></html>',
		)
	})
	await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
	const address = server.address()
	if (!address || typeof address === 'string') throw new Error('documentation server failed')
	const browser = await chromium.launch()
	try {
		const page = await browser.newPage()
		const failures = []
		page.on('pageerror', (error) => failures.push(error.message))
		await page.goto(`http://127.0.0.1:${address.port}/`)
		await page.waitForFunction(() => globalThis.__tabulaSampleDone === true)
		if (verify === 'react') await page.locator('button').waitFor({ state: 'visible' })
		if (failures.length) throw new Error(`browser sample failed: ${failures.join('; ')}`)
	} finally {
		await browser.close()
		await new Promise((resolve, reject) =>
			server.close((error) => (error ? reject(error) : resolve())),
		)
	}
}

async function executeBrowserSample(consumer, compiled, mode) {
	const result = await build({
		entryPoints: [compiled.source],
		bundle: true,
		format: 'esm',
		platform: 'browser',
		target: 'es2022',
		write: false,
		nodePaths: [path.join(consumer, 'node_modules')],
		footer: { js: 'globalThis.__tabulaSampleDone = true;' },
	})
	await serveBundle(result.outputFiles[0].contents, mode)
}

async function verifySamples(files, tarball) {
	const samples = []
	for (const file of files) {
		const markdown = await readFile(file, 'utf8')
		samples.push(...extractVerifiedSamples(markdown, path.relative(root, file)))
	}
	const consumer = await installConsumer(tarball)
	let browserCount = 0
	for (const [index, sample] of samples.entries()) {
		if (sample.mode === 'esm' || sample.mode === 'cjs') {
			const extension = sample.mode === 'esm' ? 'mjs' : 'cjs'
			const target = path.join(consumer, `sample-${index}.${extension}`)
			await writeFile(target, sample.body)
			run('node', [target], { capture: true, cwd: consumer })
			continue
		}
		const compiled = await compileSample(consumer, sample, index)
		if (sample.mode === 'browser' || sample.mode === 'react') {
			await executeBrowserSample(consumer, compiled, sample.mode)
			browserCount += 1
		}
	}
	return { browserCount, sampleCount: samples.length }
}

try {
	const files = await markdownFiles(root)
	const linkCount = await verifyLocalLinks(files)
	const tarball = await buildTarball()
	const packageReadme = await readFile(path.join(packageDir, 'README.md'), 'utf8')
	await verifyCanonicalApi(packageReadme)
	const sampleFiles = [path.join(root, 'README.md'), path.join(packageDir, 'README.md')]
	const result = await verifySamples(sampleFiles, tarball)
	console.log(
		JSON.stringify({
			browserSamples: result.browserCount,
			documentedPackage: packageName,
			markdownFiles: files.length,
			relativeLinks: linkCount,
			samples: result.sampleCount,
			tarball: path.basename(tarball),
		}),
	)
} finally {
	await rm(tempRoot, { recursive: true, force: true })
}
