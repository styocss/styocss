import { describe, expect, it } from 'vitest'

import { createEngine } from '../engine'
import { resolveShortcutConfig } from './shortcuts'

describe('shortcuts plugin', () => {
	it('resolves configured shortcuts while unmatched strings remain raw classes', async () => {
		const engine = await createEngine({
			shortcuts: {
				definitions: [
					{ name: 'btn', value: { display: 'flex', alignItems: 'center' }, description: 'Button' },
					{
						pattern: /^m-(\d+)$/,
						inputType: '`m-$' + '{number}`',
						resolve: matched => ({ margin: `${matched[1]}px` }),
						autocomplete: ['m-4'],
					},
				],
			},
		})

		const ids = await engine.use('btn', 'm-4', 'raw-class')
		const css = await engine.renderAtomicStyles(false, { atomicStyleIds: ids })

		expect(css)
			.toContain('display:flex;')
		expect(css)
			.toContain('align-items:center;')
		expect(css)
			.toContain('margin:4px;')
		expect(ids)
			.toContain('raw-class')
		// Runtime hits no longer mutate global autocomplete state.
		expect(engine.config.autocomplete.shortcuts.has('m-4'))
			.toBe(false)
	})

	it('accepts only the frozen object grammar and exposes no runtime add ingress', async () => {
		expect(resolveShortcutConfig({ name: 'btn', value: { display: 'flex' } }))
			.toMatchObject({ type: 'static' })
		expect(resolveShortcutConfig({
			pattern: /^m-(\d+)$/,
			inputType: '`m-$' + '{number}`',
			resolve: matched => ({ margin: `${matched[1]}px` }),
		}))
			.toMatchObject({ type: 'dynamic' })
		expect(resolveShortcutConfig(['btn', { display: 'flex' }] as any))
			.toBeUndefined()

		const engine = await createEngine()
		expect((engine as any).shortcuts)
			.toBeUndefined()
	})
})
