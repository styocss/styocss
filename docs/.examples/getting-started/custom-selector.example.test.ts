import { it } from 'vitest'
import { readExampleFile, renderExampleCSS } from '../_utils/pika-example'

it('custom selector example output matches engine', async ({ expect }) => {
	const usage = await readExampleFile(new URL('./custom-selector.example.pikain.ts', import.meta.url))
	const css = await renderExampleCSS({
		config: {
			selectors: {
				definitions: [
					{ name: '@dark', value: 'html.dark $' },
				],
			},
		},
		usageCode: usage,
	})
	await expect(css).toMatchFileSnapshot('./custom-selector.example.pikaout.css')
})
