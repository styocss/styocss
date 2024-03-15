// Helpers for runtime
import type {
	AddedAtomicStyle,
	StyoEngine,
} from '@styocss/core'
import {
	ATOMIC_STYLE_NAME_PLACEHOLDER,
	ATOMIC_STYLE_NAME_PLACEHOLDER_RE_GLOBAL,
} from '@styocss/core'

export function renderAtomicStyoRule({
	registeredAtomicStyle: {
		name,
		content: {
			nested,
			selector,
			property,
			value,
			important,
		},
	},
}: {
	registeredAtomicStyle: AddedAtomicStyle
}) {
	if (
		!selector.includes(ATOMIC_STYLE_NAME_PLACEHOLDER)
		|| value == null
	)
		return null

	const body = `${selector.replace(ATOMIC_STYLE_NAME_PLACEHOLDER_RE_GLOBAL, name)}{${property}:${value}${important ? ' !important' : ''}}`

	if (nested === '')
		return body

	return `${nested}{${body}}`
}

export function renderAtomicStyoRules({
	registeredAtomicStyleList,
}: {
	registeredAtomicStyleList: AddedAtomicStyle[]
}): string {
	const cssLines: string[] = ['/* AtomicStyoRule */']

	registeredAtomicStyleList.forEach((registeredAtomicStyle) => {
		const css = renderAtomicStyoRule({
			registeredAtomicStyle,
		})
		if (css != null)
			cssLines.push(css)
	})

	return cssLines.join('\n')
}

export function bindStyleEl(
	styo: StyoEngine,
	styleEl: HTMLStyleElement,
	{
		strategy = 'sheet',
	}: {
		strategy?: 'innerHTML' | 'sheet'
	} = {},
) {
	if (strategy !== 'innerHTML' && strategy !== 'sheet')
		throw new Error(`Unknown strategy: ${strategy}`)

	styleEl.innerHTML = renderAtomicStyoRules({
		registeredAtomicStyleList: [...styo.atomicStylesMap.values()],
	})

	if (strategy === 'innerHTML') {
		styo.onAtomicStyleAdded((registered) => {
			const css = renderAtomicStyoRule({
				registeredAtomicStyle: registered,
			})
			if (css != null) {
				try {
					styleEl.innerHTML += `\n${css}`
				}
				catch (error) {
					console.error(error)
				}
			}
		})
	}
	else if (strategy === 'sheet') {
		const sheet = styleEl.sheet
		if (sheet == null)
			throw new Error('Cannot find the sheet of the style element')

		styo.onAtomicStyleAdded((registered) => {
			const css = renderAtomicStyoRule({
				registeredAtomicStyle: registered,
			})
			if (css != null) {
				try {
					sheet.insertRule(css, sheet.cssRules.length)
				}
				catch (error) {
					console.error(error)
				}
			}
		})
	}
}
