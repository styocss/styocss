import { it } from 'vitest'
import { readExampleFile, renderExampleCSS } from '../_utils/pika-example'

it('recipe shortcuts example output matches engine', async ({ expect }) => {
	const usage = await readExampleFile(new URL('./recipe-shortcuts.example.pikain.ts', import.meta.url))
	const css = await renderExampleCSS({
		config: {
			shortcuts: {
				definitions: [
					{
						name: 'btn',
						value: {
							display: 'inline-flex',
							alignItems: 'center',
							padding: '0.5rem 1rem',
							borderRadius: '0.5rem',
							border: 'none',
							cursor: 'pointer',
						},
					},
					{ name: 'btn-primary', value: ['btn', { backgroundColor: '#3b82f6', color: 'white' }] },
					{ name: 'btn-danger', value: ['btn', { backgroundColor: '#ef4444', color: 'white' }] },
				],
			},
		},
		usageCode: usage,
	})
	await expect(css).toMatchFileSnapshot('./recipe-shortcuts.example.pikaout.css')
})
