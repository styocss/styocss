import type { Theme } from 'vitepress'
import TwoslashFloatingVue from '@shikijs/vitepress-twoslash/client'
import DefaultTheme from 'vitepress/theme'
// https://vitepress.dev/guide/custom-theme
import { h } from 'vue'

import '@shikijs/vitepress-twoslash/style.css'
import 'virtual:group-icons.css'
import './style.css'
import 'virtual:pika.css'

export default {
	extends: DefaultTheme,
	Layout: () => {
		return h(DefaultTheme.Layout, null, {
			// https://vitepress.dev/guide/extending-default-theme#layout-slots
		})
	},
	enhanceApp({ app }) {
		app.use(TwoslashFloatingVue)
	},
} satisfies Theme
