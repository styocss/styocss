import { describe, expect, it, vi } from 'vitest'

import {
	addToSet,
	createLogger,
	escapeRegExp,
	isNotNullish,
	isNotString,
	isPlainObjectRecord,
	isPropertyValue,
	isString,
	numberToChars,
	renderCSSStyleBlocks,
	serialize,
	toKebab,
} from './utils'

describe('createLogger', () => {
	it('respects debug toggling, custom prefixes, and output handlers', () => {
		const debug = vi.fn()
		const info = vi.fn()
		const warn = vi.fn()
		const error = vi.fn()
		const logger = createLogger('[Test]')

		logger.setDebugFn(debug)
		logger.setInfoFn(info)
		logger.setWarnFn(warn)
		logger.setErrorFn(error)

		logger.debug('hidden')
		expect(debug)
			.not.toHaveBeenCalled()

		logger.toggleDebug()
		logger.debug('visible')
		logger.setPrefix('[Next]')
		logger.info('info')
		logger.warn('warn')
		logger.error('error')

		expect(debug)
			.toHaveBeenCalledWith('[Test][DEBUG]', 'visible')
		expect(info)
			.toHaveBeenCalledWith('[Next][INFO]', 'info')
		expect(warn)
			.toHaveBeenCalledWith('[Next][WARN]', 'warn')
		expect(error)
			.toHaveBeenCalledWith('[Next][ERROR]', 'error')
	})
})

describe('basic utilities', () => {
	it('handles string conversion and predicate helpers across edge cases', () => {
		expect(numberToChars(0))
			.toBe('a')
		expect(numberToChars(51))
			.toBe('Z')
		expect(numberToChars(52))
			.toBe('aa')

		expect(toKebab('backgroundColor'))
			.toBe('background-color')
		expect(toKebab('--token'))
			.toBe('--token')

		expect(isNotNullish('value'))
			.toBe(true)
		expect(isNotNullish(null))
			.toBe(false)
		expect(isString('value'))
			.toBe(true)
		expect(isString(1))
			.toBe(false)
		expect(isNotString('value'))
			.toBe(false)
		expect(isNotString({}))
			.toBe(true)

		expect(isPropertyValue(['1rem', ['2rem']]))
			.toBe(true)
		expect(isPropertyValue(['1rem']))
			.toBe(false)
		expect(isPropertyValue(null))
			.toBe(true)
		expect(isPropertyValue('red'))
			.toBe(true)
		expect(isPropertyValue({ color: 'red' }))
			.toBe(false)

		expect(serialize({ color: 'red' }))
			.toBe('{"color":"red"}')

		expect(isPlainObjectRecord({ a: 1 }))
			.toBe(true)
		expect(isPlainObjectRecord([1]))
			.toBe(false)
		expect(isPlainObjectRecord(null))
			.toBe(false)

		expect(escapeRegExp('a.b*c'))
			.toBe('a\\.b\\*c')
		expect(new RegExp(`^${escapeRegExp('i-(x)?[y]/z-')}$`)
			.test('i-(x)?[y]/z-'))
			.toBe(true)
	})

	it('reports whether adding values changes a set', () => {
		const values = new Set<string>()
		expect(addToSet(values, 'hover', 'hover'))
			.toBe(true)
		expect(addToSet(values, 'hover'))
			.toBe(false)
		expect(values)
			.toEqual(new Set(['hover']))
	})

	it('renders nested CSS blocks and skips empty selectors', () => {
		const blocks = new Map([
			['.empty', { properties: [], children: new Map() }],
			['.card', {
				properties: [{ property: 'color', value: 'red' }],
				children: new Map([
					['&:hover', {
						properties: [{ property: 'color', value: 'blue' }],
					}],
				]),
			}],
		]) as any

		expect(renderCSSStyleBlocks(blocks, false))
			.toBe('.card{color:red;&:hover{color:blue;}}')
		expect(renderCSSStyleBlocks(blocks, true))
			.toBe('.card {\n  color: red;\n  &:hover {\n    color: blue;\n  }\n}')
	})

	it('skips blocks whose children contain no renderable content', () => {
		const blocks = new Map([
			['.outer', {
				properties: [],
				children: new Map([
					['.inner', { properties: [], children: new Map() }],
				]),
			}],
			['.kept', {
				properties: [],
				children: new Map([
					['.deep', { properties: [{ property: 'color', value: 'red' }] }],
				]),
			}],
		]) as any

		expect(renderCSSStyleBlocks(blocks, false))
			.toBe('.kept{.deep{color:red;}}')
	})
})
