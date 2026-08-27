import { icons } from '@pikacss/plugin-icons'
import { reset } from '@pikacss/plugin-reset'
import { defineConfig } from '@pikacss/unplugin-pikacss'

export default defineConfig({
	engine: {
		plugins: [
			icons(),
			reset(),
		],
		variables: {
			definitions: {
				'--color-primary': { value: '#ff007f' },
			},
		},
		selectors: {
			definitions: [
				{ name: '@light', value: 'html:not(.dark) $' },
				{ name: '@dark', value: 'html.dark $' },
				{ name: '@screen-xs', value: '@media screen and (max-width: 575.9px)' },
				{ name: '@screen-sm', value: '@media screen and (min-width: 576px) and (max-width: 767.9px)' },
				{ name: '@screen-md', value: '@media screen and (min-width: 768px) and (max-width: 991.9px)' },
				{ name: '@screen-lg', value: '@media screen and (min-width: 992px) and (max-width: 1199.9px)' },
				{ name: '@screen-xl', value: '@media screen and (min-width: 1200px) and (max-width: 1399.9px)' },
				{ name: '@screen-xxl', value: '@media screen and (min-width: 1400px)' },
				{ name: ':hover', value: '$:hover' },
				{ name: ':focus', value: '$:focus' },
				{ name: ':active', value: '$:active' },
				{ name: ':disabled', value: '$:disabled' },
			],
		},
		shortcuts: {
			definitions: [
				{
					name: 'main',
					value: {
						'width': '100dvw',
						'height': '100dvh',
						'display': 'flex',
						'justifyContent': 'center',
						'alignItems': 'center',
						'@dark': {
							background: '#222',
							color: 'white',
						},
					},
				},
			],
		},
		icons: {
			autoInstall: true,
		},
	},
})
