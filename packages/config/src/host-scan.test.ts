import { describe, expect, it } from 'vitest'
import { createPikaScanMatcher } from './host-scan'

describe('createPikaScanMatcher', () => {
	it('matches absolute include patterns, dotfiles, and excludes', () => {
		const matcher = createPikaScanMatcher({
			scan: {
				include: ['/repo/src/**/*.ts'],
				exclude: ['/repo/src/vendor/**'],
			},
			stateDir: '/repo/.pikacss',
		})

		expect(matcher.matches('/repo/src/a.ts'))
			.toBe(true)
		expect(matcher.matches('/repo/src/.hidden.ts'))
			.toBe(true)
		expect(matcher.matches('/repo/src/vendor/a.ts'))
			.toBe(false)
		expect(matcher.matches('/repo/test/a.ts'))
			.toBe(false)
	})

	it('unconditionally excludes stateDir even when includes explicitly cover it', () => {
		const matcher = createPikaScanMatcher({
			scan: { include: ['/repo/**'], exclude: [] },
			stateDir: '/repo/.pikacss',
		})
		expect(matcher.matches('/repo/.pikacss/generated.ts'))
			.toBe(false)
		expect(matcher.matches('/repo/.pikacss'))
			.toBe(false)
		expect(matcher.matches('/repo/src/a.ts'))
			.toBe(true)
	})

	it('normalizes Windows-style physical paths consistently', () => {
		const matcher = createPikaScanMatcher({
			scan: {
				include: ['C:/repo/src/**/*.ts'],
				exclude: ['C:/repo/src/generated/**'],
			},
			stateDir: 'C:/repo/.pikacss',
		})
		expect(matcher.matches('C:\\repo\\src\\a.ts'))
			.toBe(true)
		expect(matcher.matches('C:\\repo\\src\\generated\\a.ts'))
			.toBe(false)
		expect(matcher.matches('C:\\repo\\.pikacss\\x.ts'))
			.toBe(false)
	})

	it('rejects relative physical source identities', () => {
		const matcher = createPikaScanMatcher({
			scan: { include: ['/repo/**'], exclude: [] },
			stateDir: '/repo/.pikacss',
		})
		expect(() => matcher.matches('src/a.ts'))
			.toThrow('requires an absolute physical source path')
	})
})
