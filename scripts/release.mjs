import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { appendFile, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertDistTag, validateReleaseManifest } from './release-policy.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const packageDir = path.join(root, 'packages/tabula')
const artifactDir = path.join(root, 'release-artifacts')
const packageManifest = JSON.parse(await readFile(path.join(packageDir, 'package.json'), 'utf8'))
const command = process.argv[2]
const tagIndex = process.argv.indexOf('--tag')
const distTag = tagIndex === -1 ? 'next' : process.argv[tagIndex + 1]
const tarballName = `${packageManifest.name.slice(1).replace('/', '-')}-${packageManifest.version}.tgz`
const tarballPath = path.join(artifactDir, tarballName)
const manifestPath = path.join(artifactDir, 'release-manifest.json')
const notesPath = path.join(artifactDir, 'release-notes.md')

assertDistTag(packageManifest.version, distTag)

function run(executable, args, options = {}) {
	const result = spawnSync(executable, args, {
		cwd: options.cwd ?? root,
		encoding: 'utf8',
		stdio: options.capture ? 'pipe' : 'inherit',
		env: { ...process.env, ...options.env },
	})
	if (result.error) throw result.error
	if (result.status !== 0) {
		throw new Error(
			`${executable} ${args.join(' ')} failed\n${result.stdout ?? ''}\n${result.stderr ?? ''}`,
		)
	}
	return (result.stdout ?? '').trim()
}

function changelogNotes(changelog, version) {
	const headingPrefix = `## ${version}`
	const headingStart = changelog
		.split('\n')
		.findIndex((line) => line === headingPrefix || line.startsWith(`${headingPrefix} (`))
	if (headingStart === -1) throw new Error(`CHANGELOG.md has no section for ${version}`)
	const lines = changelog.split('\n')
	const nextHeading = lines.findIndex(
		(line, index) => index > headingStart && line.startsWith('## '),
	)
	return lines
		.slice(headingStart + 1, nextHeading === -1 ? undefined : nextHeading)
		.join('\n')
		.trim()
}

async function checksum(file) {
	return createHash('sha256')
		.update(await readFile(file))
		.digest('hex')
}

async function loadAndVerify() {
	if (!existsSync(tarballPath) || !existsSync(manifestPath) || !existsSync(notesPath)) {
		throw new Error('release artifacts are incomplete; run release:prepare first')
	}
	const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
	validateReleaseManifest(manifest, {
		name: packageManifest.name,
		version: packageManifest.version,
		distTag,
	})
	const expectedRepository = packageManifest.repository.url
		.replace(/^git\+/, '')
		.replace(/\.git$/, '')
	const expectedCommit = run('git', ['rev-parse', 'HEAD'], { capture: true })
	if (
		manifest.gitTag !== `${packageManifest.name}@${packageManifest.version}` ||
		manifest.source.repository !== expectedRepository ||
		manifest.source.commit !== expectedCommit ||
		manifest.source.workflow !== '.github/workflows/release.yml'
	) {
		throw new Error('release manifest source identity changed')
	}
	if (manifest.artifact.file !== tarballName) throw new Error('release tarball name changed')
	const digest = await checksum(tarballPath)
	if (digest !== manifest.artifact.sha256) throw new Error('release tarball checksum changed')
	const details = await stat(tarballPath)
	if (details.size !== manifest.artifact.bytes) throw new Error('release tarball size changed')
	if ((await checksum(notesPath)) !== manifest.releaseNotes.sha256) {
		throw new Error('release notes checksum changed')
	}
	return manifest
}

async function writeGithubOutputs(manifest) {
	const output = process.env.GITHUB_OUTPUT
	if (!output) return
	await appendFile(
		output,
		`${[
			`package_name=${manifest.package.name}`,
			`version=${manifest.package.version}`,
			`dist_tag=${manifest.distTag}`,
			`git_tag=${manifest.gitTag}`,
			`tarball=${tarballPath}`,
			`manifest=${manifestPath}`,
			`notes=${notesPath}`,
		].join('\n')}\n`,
	)
}

if (command === 'prepare') {
	if (path.dirname(artifactDir) !== root || path.basename(artifactDir) !== 'release-artifacts') {
		throw new Error(`refusing to replace unexpected artifact directory: ${artifactDir}`)
	}
	await rm(artifactDir, { recursive: true, force: true })
	await mkdir(artifactDir)
	run('node', ['scripts/verify-package.mjs'], {
		env: { TABULA_PACKAGE_OUTPUT: tarballPath },
	})
	const digest = await checksum(tarballPath)
	const details = await stat(tarballPath)
	const commit = run('git', ['rev-parse', 'HEAD'], { capture: true })
	const repository = packageManifest.repository.url.replace(/^git\+/, '').replace(/\.git$/, '')
	const changelog = await readFile(path.join(packageDir, 'CHANGELOG.md'), 'utf8')
	const notes = [
		`# ${packageManifest.name} ${packageManifest.version}`,
		'',
		changelogNotes(changelog, packageManifest.version),
		'',
		'## Artifact',
		'',
		`- npm dist-tag: \`${distTag}\``,
		`- SHA-256: \`${digest}\``,
		`- Source commit: \`${commit}\``,
		'',
	].join('\n')
	await writeFile(notesPath, notes)
	const manifest = {
		schemaVersion: 1,
		package: { name: packageManifest.name, version: packageManifest.version },
		distTag,
		access: 'public',
		provenance: true,
		gitTag: `${packageManifest.name}@${packageManifest.version}`,
		source: { repository, commit, workflow: '.github/workflows/release.yml' },
		artifact: { file: tarballName, sha256: digest, bytes: details.size },
		releaseNotes: { file: path.basename(notesPath), sha256: await checksum(notesPath) },
	}
	await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
	await writeGithubOutputs(manifest)
	console.log(JSON.stringify(manifest, null, 2))
} else if (command === 'verify') {
	const manifest = await loadAndVerify()
	await writeGithubOutputs(manifest)
	console.log(`verified ${manifest.artifact.file} (${manifest.artifact.sha256})`)
} else if (command === 'dry-run') {
	const manifest = await loadAndVerify()
	run('npm', [
		'publish',
		tarballPath,
		'--dry-run',
		'--access',
		'public',
		'--tag',
		distTag,
		'--provenance',
	])
	console.log(
		`dry-run complete for ${manifest.package.name}@${manifest.package.version}; OIDC exchange and provenance publication remain unproven`,
	)
} else if (command === 'publish') {
	await loadAndVerify()
	if (process.env.NODE_AUTH_TOKEN || process.env.NPM_TOKEN) {
		throw new Error('token-based npm credentials are forbidden; use trusted publishing')
	}
	if (!process.env.ACTIONS_ID_TOKEN_REQUEST_URL) {
		throw new Error('npm publish requires a GitHub Actions OIDC identity')
	}
	if (process.env.GITHUB_REF !== 'refs/heads/main') {
		throw new Error('npm publish is restricted to the main branch')
	}
	run('npm', ['publish', tarballPath, '--access', 'public', '--tag', distTag, '--provenance'])
} else {
	throw new Error('usage: node scripts/release.mjs <prepare|verify|dry-run|publish> --tag <tag>')
}
