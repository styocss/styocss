import { describe, expect, it, vi } from 'vitest'

import { renderTypegenJSDoc } from './jsdoc'

describe('renderTypegenJSDoc', () => {
	it('renders descriptions before the established fenced CSS preview with lexical safety', () => {
		const lines = renderTypegenJSDoc({
			description: 'Token docs\n@deprecated not-a-real-tag\ncloses */ safely',
			previewCss: '.demo {\n  content: "*/";\n}',
		}, {}, '  ')
		const output = lines.join('\n')

		expect(output)
			.toContain('### PikaCSS Preview')
		expect(output)
			.toContain('```css')
		expect(output)
			.toContain(`*\u2060/`)
		expect(output)
			.toContain(`\u2060@deprecated not-a-real-tag`)
		expect(output)
			.not.toContain('\u200E')
		expect(output)
			.toContain('   * ### PikaCSS Preview')
		expect(output)
			.toContain('   * ```css')
		expect(output.split('\n')
			.every(line => line.startsWith('  ')))
			.toBe(true)
	})

	it('keeps semantic image content path-free and binds hrefs only while rendering', () => {
		const resolvePreviewImageHref = vi.fn(() => 'file:///materialized/preview.svg')
		const image = { assetId: 'icon-0', alt: 'Icon' }
		const output = renderTypegenJSDoc({ previewImages: [image] }, { resolvePreviewImageHref })
			.join('\n')

		expect(resolvePreviewImageHref)
			.toHaveBeenCalledWith('icon-0')
		expect(output)
			.toContain('![Icon](file:///materialized/preview.svg)')
		expect(JSON.stringify(image))
			.not.toContain('file:///')
	})

	it('omits an image when host materialization provides no href while preserving other preview content', () => {
		const output = renderTypegenJSDoc({
			previewCss: '.demo { color: red; }',
			previewImages: [{ assetId: 'missing' }],
		}, { resolvePreviewImageHref: () => undefined })
			.join('\n')

		expect(output)
			.toContain('.demo { color: red; }')
		expect(output)
			.not.toContain('![')
	})

	it('returns no block when there is no renderable documentation', () => {
		expect(renderTypegenJSDoc({}))
			.toEqual([])
		expect(renderTypegenJSDoc({ previewImages: [{ assetId: 'unbound' }] }))
			.toEqual([])
	})

	it('keeps Typegen-owned semantic tags real while neutralizing arbitrary tag-like prose', () => {
		const output = renderTypegenJSDoc({
			description: '@deprecated user prose only',
			tags: [{ name: 'deprecated', text: 'Use the replacement. */ stays safe' }],
		})
			.join('\n')

		expect(output)
			.toContain('\u2060@deprecated user prose only')
		expect(output)
			.toContain('* @deprecated')
		expect(output)
			.toContain(`*\u2060/ stays safe`)
	})

	it('neutralizes tag-like CSS at-rules without disturbing Markdown fences or ordinary lines', () => {
		const output = renderTypegenJSDoc({
			previewCss: ':root {\n  color: red;\n}\n@media (min-width: 640px) {\n  .demo { display: grid; }\n}',
		})
			.join('\n')

		expect(output)
			.toContain(' * ### PikaCSS Preview\n * ```css\n * :root {\n *   color: red;')
		expect(output)
			.toContain(` * \u2060@media (min-width: 640px) {`)
		expect(output)
			.toContain('\n * ```\n */')
		expect(output)
			.not.toContain('\u200E')
	})

	it('renders bound preview images before the CSS preview', () => {
		const output = renderTypegenJSDoc({
			previewImages: [{ assetId: 'icon' }],
			previewCss: '.icon { display: block; }',
		}, { resolvePreviewImageHref: () => 'file:///icon.svg' })
			.join('\n')

		expect(output.indexOf('![PikaCSS Preview](file:///icon.svg)'))
			.toBeLessThan(output.indexOf('```css'))
	})

	it('rejects invalid internal semantic tag names instead of emitting malformed JSDoc', () => {
		expect(() => renderTypegenJSDoc({ tags: [{ name: 'bad tag' }] }))
			.toThrow('Invalid Typegen JSDoc tag name')
	})
})
