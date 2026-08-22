import { spawnSync } from 'node:child_process'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const packageManifest = JSON.parse(
	await readFile(path.join(root, 'packages/tabula/package.json'), 'utf8'),
)

function run(executable, args, options = {}) {
	const result = spawnSync(executable, args, {
		cwd: options.cwd ?? root,
		encoding: 'utf8',
		stdio: options.capture ? 'pipe' : 'inherit',
	})
	if (result.error) throw result.error
	if (result.status !== 0) {
		throw new Error(
			`${executable} ${args.join(' ')} failed\n${result.stdout ?? ''}\n${result.stderr ?? ''}`,
		)
	}
	return (result.stdout ?? '').trim()
}

const placeholderDir = await mkdtemp(path.join(tmpdir(), 'tabula-npm-bootstrap-'))
const placeholderManifest = {
	name: packageManifest.name,
	version: '0.0.0',
	description: 'One-time npm ownership placeholder for Tabula trusted publishing',
	repository: packageManifest.repository,
	homepage: packageManifest.homepage,
	bugs: packageManifest.bugs,
	license: packageManifest.license,
	publishConfig: { access: 'public' },
}

await writeFile(
	path.join(placeholderDir, 'package.json'),
	`${JSON.stringify(placeholderManifest, null, 2)}\n`,
)

const dryRun = run('npm', ['pack', '--dry-run', '--json', placeholderDir], {
	capture: true,
})

console.log(dryRun)
console.log('')
console.log('Bootstrap placeholder directory:')
console.log(placeholderDir)
console.log('')
console.log('Publish only from an authenticated maintainer shell with a current npm 2FA code:')
console.log(`npm publish ${placeholderDir} --access public --tag bootstrap --otp=<current-code>`)
