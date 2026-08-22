import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const fixtureRoot = path.join(root, 'compat/fixtures')
const packageName = '@thinkly/tabula-js'
const arguments_ = process.argv.slice(2)
if (arguments_[0] === '--') arguments_.shift()
const [version, sourceCommit, protocolText] = arguments_

if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version ?? '')) {
	throw new Error('usage: snapshot-compat-fixture <version> <source-commit> <major:revision:min>')
}
if (!/^[0-9a-f]{40}$/.test(sourceCommit ?? '')) {
	throw new Error('source commit must be a full 40-character Git SHA')
}
const protocolMatch = /^(\d+):(\d+):(\d+)$/.exec(protocolText ?? '')
if (!protocolMatch) throw new Error('protocol must use major:revision:min format')
const protocol = {
	major: Number(protocolMatch[1]),
	revision: Number(protocolMatch[2]),
	minRevision: Number(protocolMatch[3]),
}

const fixtureDir = path.join(fixtureRoot, version)
if (existsSync(fixtureDir)) throw new Error(`compatibility fixture ${version} already exists`)
const tempRoot = await mkdtemp(path.join(tmpdir(), 'tabula-compat-snapshot-'))

function run(command, args, options = {}) {
	const result = spawnSync(command, args, {
		cwd: options.cwd ?? root,
		encoding: 'utf8',
		stdio: options.capture ? 'pipe' : 'inherit',
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
	await mkdir(fixtureDir)
	const packed = JSON.parse(
		run('npm', ['pack', `${packageName}@${version}`, '--json', '--pack-destination', fixtureDir], {
			capture: true,
		}),
	)[0]
	if (packed.name !== packageName || packed.version !== version) {
		throw new Error(`registry returned ${packed.name}@${packed.version}`)
	}
	const tarball = path.join(fixtureDir, 'package.tgz')
	await rename(path.join(fixtureDir, packed.filename), tarball)
	run('tar', ['-xzf', tarball, '-C', tempRoot])

	const participant = path.join(fixtureDir, 'participant.js')
	await build({
		entryPoints: [path.join(root, 'compat/published-participant.js')],
		bundle: true,
		format: 'esm',
		platform: 'browser',
		target: 'es2022',
		outfile: participant,
		alias: {
			'@thinkly/tabula-js': path.join(tempRoot, 'package/dist/index.js'),
		},
	})

	const manifestPath = path.join(fixtureRoot, 'manifest.json')
	const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
	manifest.fixtures.push({
		id: `published-${version}`,
		kind: 'compatible',
		packageVersion: version,
		protocol,
		registry: 'https://registry.npmjs.org',
		specification: `${packageName}@${version}`,
		sourceCommit,
		tarball: 'package.tgz',
		tarballIntegrity: packed.integrity,
		tarballShasum: packed.shasum,
		tarballSha256: await sha256(tarball),
		file: `${version}/participant.js`,
		sha256: await sha256(participant),
	})
	await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
} catch (error) {
	await rm(fixtureDir, { recursive: true, force: true })
	throw error
} finally {
	await rm(tempRoot, { recursive: true, force: true })
}
