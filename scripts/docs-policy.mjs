import path from 'node:path'

const EXECUTABLE_LANGUAGES = new Set(['cjs', 'js', 'mjs', 'ts', 'tsx'])
const VERIFY_MODES = new Set(['browser', 'cjs', 'esm', 'react', 'ts'])

export function extractVerifiedSamples(markdown, source) {
	const samples = []
	const lines = markdown.split(/\r?\n/)
	for (let index = 0; index < lines.length; index += 1) {
		const opening = lines[index].match(/^```(\S+)(?:\s+verify=(\S+))?\s*$/)
		if (!opening) continue
		const [, language, mode] = opening
		const startLine = index + 1
		const body = []
		for (index += 1; index < lines.length && !/^```\s*$/.test(lines[index]); index += 1) {
			body.push(lines[index])
		}
		if (index === lines.length) throw new Error(`${source}:${startLine}: unclosed code fence`)
		if (!EXECUTABLE_LANGUAGES.has(language)) continue
		if (!mode) throw new Error(`${source}:${startLine}: executable ${language} fence needs verify=`)
		if (!VERIFY_MODES.has(mode)) {
			throw new Error(`${source}:${startLine}: unsupported verify mode ${mode}`)
		}
		samples.push({ body: `${body.join('\n')}\n`, language, line: startLine, mode, source })
	}
	return samples
}

export function extractMarkdownLinks(markdown) {
	const links = []
	const pattern = /!?\[[^\]]*\]\((<[^>]+>|[^\s)]+)(?:\s+['"][^'"]*['"])?\)/g
	for (const match of markdown.matchAll(pattern)) {
		const destination = match[1].replace(/^<|>$/g, '')
		links.push({ destination, index: match.index })
	}
	return links
}

export function resolveLocalLink(source, destination) {
	if (destination.startsWith('#') || /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(destination)) {
		return null
	}
	const withoutQuery = destination.split('?')[0]
	const [pathname] = withoutQuery.split('#')
	if (!pathname) return null
	return path.resolve(path.dirname(source), decodeURIComponent(pathname))
}

export function declarationExports(declaration) {
	const matches = [...declaration.matchAll(/^export \{([^}]+)\};?$/gm)]
	if (matches.length !== 1) throw new Error('declaration must contain one final export list')
	return new Set(
		matches[0][1]
			.split(',')
			.map((entry) =>
				entry
					.trim()
					.replace(/^type\s+/, '')
					.split(/\s+as\s+/)
					.at(-1),
			)
			.filter(Boolean),
	)
}

export function documentedExports(markdown, table) {
	const start = `<!-- api-table:${table}:start -->`
	const end = `<!-- api-table:${table}:end -->`
	const startIndex = markdown.indexOf(start)
	const endIndex = markdown.indexOf(end)
	if (startIndex === -1 || endIndex <= startIndex) throw new Error(`missing ${table} API table`)
	const section = markdown.slice(startIndex + start.length, endIndex)
	return new Set([...section.matchAll(/^\| `([^`]+)` \|/gm)].map((match) => match[1]))
}

export function compareSets(actual, expected, label) {
	const missing = [...expected].filter((entry) => !actual.has(entry)).sort()
	const extra = [...actual].filter((entry) => !expected.has(entry)).sort()
	if (missing.length || extra.length) {
		throw new Error(
			`${label} differs (missing: ${missing.join(', ') || 'none'}; extra: ${extra.join(', ') || 'none'})`,
		)
	}
}
