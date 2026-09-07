import type { PackageDef } from '../_skill-shared'
import { describe, expect, it } from 'vitest'
import { normalizePublicRoute, readmeIssues } from './check-readmes'

const pkg: PackageDef = {
	name: '@pikacss/example',
	dir: 'example',
	slug: 'example',
	order: 10,
	description: 'Example package',
	pageTitle: 'Example API reference',
}

const routes = new Set(['/', '/playground', '/api/example', '/guide/example'])

describe('package README checks', () => {
	it('normalizes root and trailing-slash routes', () => {
		expect(normalizePublicRoute('/'))
			.toBe('/')
		expect(normalizePublicRoute('/api/example/'))
			.toBe('/api/example')
	})

	it('accepts compact READMEs, route slashes, and Markdown link titles', () => {
		const content = `# @pikacss/example

Compact package description.

See the [home](https://pikacss.github.io/) and [API](https://pikacss.github.io/api/example/ "Example API").
`

		expect(readmeIssues(pkg, content, routes))
			.toEqual([])
	})

	it('ignores H1-looking text inside fenced code', () => {
		const content = `\`\`\`sh
# @pikacss/wrong
\`\`\`

# @pikacss/example

See the [API](https://pikacss.github.io/api/example).
`

		expect(readmeIssues(pkg, content, routes))
			.toEqual([])
	})

	it('rejects an incorrect package identity', () => {
		const content = `# @pikacss/wrong

See the [API](https://pikacss.github.io/api/example).
`

		expect(readmeIssues(pkg, content, routes))
			.toContain('README H1 must be \'@pikacss/example\' (found \'@pikacss/wrong\')')
	})

	it('rejects missing or unsupported public-site routes', () => {
		expect(readmeIssues(pkg, '# @pikacss/example\n', routes))
			.toContain('README must link to at least one public PikaCSS site page')

		const stale = `# @pikacss/example

See the [old guide](https://pikacss.github.io/legacy/example).
`
		expect(readmeIssues(pkg, stale, routes))
			.toContain('README PikaCSS site link points to an unsupported route: https://pikacss.github.io/legacy/example')
	})
})
