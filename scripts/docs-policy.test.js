import { describe, expect, it } from 'vitest'
import {
	compareSets,
	declarationExports,
	documentedExports,
	extractMarkdownLinks,
	extractVerifiedSamples,
	resolveLocalLink,
} from './docs-policy.mjs'

describe('documentation policy', () => {
	it('extracts explicitly classified executable fences', () => {
		expect(extractVerifiedSamples('```ts verify=browser\nvoid 0\n```', 'README.md')).toEqual([
			{
				body: 'void 0\n',
				language: 'ts',
				line: 1,
				mode: 'browser',
				source: 'README.md',
			},
		])
		expect(() => extractVerifiedSamples('```tsx\n<div />\n```', 'README.md')).toThrow(
			'executable tsx fence needs verify=',
		)
	})

	it('extracts and resolves local markdown links', () => {
		const links = extractMarkdownLinks(
			'[local](../docs/CONTRACT.md#scope) [web](https://example.com)',
		)
		expect(links.map((link) => link.destination)).toEqual([
			'../docs/CONTRACT.md#scope',
			'https://example.com',
		])
		expect(resolveLocalLink('/repo/packages/tabula/README.md', links[0].destination)).toBe(
			'/repo/packages/docs/CONTRACT.md',
		)
		expect(resolveLocalLink('/repo/README.md', links[1].destination)).toBeNull()
	})

	it('compares declaration exports with the canonical table', () => {
		const declarations = declarationExports('declare const a: 1;\nexport { a, type B };\n')
		const docs = documentedExports(
			'<!-- api-table:main:start -->\n| Symbol | Purpose |\n|---|---|\n| `a` | value |\n| `B` | type |\n<!-- api-table:main:end -->',
			'main',
		)
		expect(() => compareSets(docs, declarations, 'main API')).not.toThrow()
		expect(() => compareSets(new Set(['a']), declarations, 'main API')).toThrow('missing: B')
	})
})
