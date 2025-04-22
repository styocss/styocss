import { icons } from '@pikacss/plugin-icons'
import { defineEngineConfig } from './pika.gen'

export default defineEngineConfig({
	plugins: [
		icons(),
	],
	variables: [
		['color-primary', '#ff007f'],
	],
	selectors: [
		['@light', 'html:not(.dark) &'],
		['@dark', 'html.dark &'],
		['@screen-xs', '@media screen and (max-width: 575.9px)'],
		['@screen-sm', '@media screen and (min-width: 576px) and (max-width: 767.9px)'],
		['@screen-md', '@media screen and (min-width: 768px) and (max-width: 991.9px)'],
		['@screen-lg', '@media screen and (min-width: 992px) and (max-width: 1199.9px)'],
		['@screen-xl', '@media screen and (min-width: 1200px) and (max-width: 1399.9px)'],
		['@screen-xxl', '@media screen and (min-width: 1400px)'],

		[':hover', '&:hover'],
		[':focus', '&:focus'],
		[':active', '&:active'],
		[':disabled', '&:disabled'],
	],
	shortcuts: [
		['main', {
			'width': '100dvw',
			'height': '100dvh',
			'display': 'flex',
			'justifyContent': 'center',
			'alignItems': 'center',

			'@dark': {
				background: '#222',
				color: 'white',
			},
		}],
	],
	icons: {
		autoInstall: true,
	},
})
