import { describe, expect, it } from 'vitest'
import { bindStyleEl, renderAtomicStyoRule, renderAtomicStyoRules } from '@styocss/helpers'
import { createStyoEngine } from '@styocss/core'
import type { HTMLStyleElement } from 'happy-dom'
import { Window } from 'happy-dom'

describe('test runtime helpers', () => {
	it('should render atomic style rule correctly (renderAtomicStyoRule)', () => {
		// without nested
		expect(renderAtomicStyoRule({
			registeredAtomicStyle: {
				name: 'a',
				content: {
					nested: '',
					selector: '.{a}',
					important: false,
					property: 'color',
					value: 'red',
				},
			},
		})).toBe('.a{color:red}')
		// with nested
		expect(renderAtomicStyoRule({
			registeredAtomicStyle: {
				name: 'a',
				content: {
					nested: '@media screen and (min-width: 768px)',
					selector: '.{a}:hover',
					important: true,
					property: 'color',
					value: 'red',
				},
			},
		})).toBe('@media screen and (min-width: 768px){.a:hover{color:red !important}}')
	})

	it('should return null if the atomic style rule is invalid (renderAtomicStyoRule)', () => {
		// selector does not include `{a}`
		expect(renderAtomicStyoRule({
			registeredAtomicStyle: {
				name: 'a',
				content: {
					nested: '',
					selector: '.a',
					important: false,
					property: 'color',
					value: 'red',
				},
			},
		})).toBeNull()
		// value is null or undefined
		expect(renderAtomicStyoRule({
			registeredAtomicStyle: {
				name: 'a',
				content: {
					nested: '',
					selector: '.{a}',
					important: false,
					property: 'color',
					value: null,
				},
			},
		})).toBeNull()
	})

	it('should render atomic style rules correctly (renderAtomicStyoRules)', () => {
		expect(renderAtomicStyoRules({
			registeredAtomicStyleList: [
				{
					name: 'a',
					content: {
						nested: '',
						selector: '.{a}',
						important: false,
						property: 'color',
						value: 'red',
					},
				},
				{
					name: 'b',
					content: {
						nested: '@media screen and (min-width: 768px)',
						selector: '.{a}:hover',
						important: true,
						property: 'color',
						value: 'red',
					},
				},
			],
		})).toBe([
			'/* AtomicStyoRule */',
			'.a{color:red}',
			'@media screen and (min-width: 768px){.b:hover{color:red !important}}',
		].join('\n'))
	})

	it('should bind style element correctly (bindStyleEl with sheet strategy)', () => {
		const window = new Window()
		const document = window.document
		const styleEl = document.createElement('style') as HTMLStyleElement
		document.head.appendChild(styleEl)

		const engine = createStyoEngine()
		bindStyleEl(engine, styleEl as any, { strategy: 'sheet' })

		const sheet = styleEl.sheet

		engine.styo({
			display: 'flex',
			alignItems: 'center',
			justifyContent: 'center',
			padding: '1rem',
			color: 'red',
		})

		expect([...sheet.cssRules].length).toBe(5)
		expect([...sheet.cssRules].map(r => r.cssText))
			.toEqual([
				'.a { display: flex; }',
				'.b { align-items: center; }',
				'.c { justify-content: center; }',
				'.d { padding: 1rem; }',
				'.e { color: red; }',
			])
	})

	it('should bind style element correctly (bindStyleEl with innerHTML strategy)', () => {
		const window = new Window()
		const document = window.document
		const styleEl = document.createElement('style') as HTMLStyleElement
		document.head.appendChild(styleEl)

		const engine = createStyoEngine()
		bindStyleEl(engine, styleEl as any, { strategy: 'innerHTML' })

		engine.styo({
			display: 'flex',
			alignItems: 'center',
			justifyContent: 'center',
			padding: '1rem',
			color: 'red',
		})

		expect(styleEl.innerHTML)
			.toBe([
				'/* AtomicStyoRule */',
				'.a{display:flex}',
				'.b{align-items:center}',
				'.c{justify-content:center}',
				'.d{padding:1rem}',
				'.e{color:red}',
			].join('\n'))
	})
})
