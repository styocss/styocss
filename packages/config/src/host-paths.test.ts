import { describe, expect, it } from 'vitest'
import { assertStateDirSafe, isEqualOrDescendant, normalizeAbsolutePath, resolveFrom, stripLoaderSuffix } from './host-paths'

describe('config host path semantics', () => {
	it('normalizes POSIX and Windows-style absolute paths without realpath/case folding', () => {
		expect(normalizeAbsolutePath('/repo/app/../app', 'projectRoot'))
			.toBe('/repo/app')
		expect(normalizeAbsolutePath('C:\\repo\\app', 'projectRoot'))
			.toBe('C:/repo/app')
		expect(() => normalizeAbsolutePath('relative/project', 'projectRoot'))
			.toThrow('must be an absolute filesystem path')
	})

	it('resolves relative values once against the supplied base and leaves absolute values absolute', () => {
		expect(resolveFrom('/repo/config', '../src/**/*.ts'))
			.toBe('/repo/src/**/*.ts')
		expect(resolveFrom('/repo/config', '/other/**/*.ts'))
			.toBe('/other/**/*.ts')
		expect(resolveFrom('C:/repo/config', '../src/**/*.ts'))
			.toBe('C:/repo/src/**/*.ts')
	})

	it('classifies equal/descendant relationships across POSIX and Windows paths', () => {
		expect(isEqualOrDescendant('/repo', '/repo'))
			.toBe(true)
		expect(isEqualOrDescendant('/repo', '/repo/src/a.ts'))
			.toBe(true)
		expect(isEqualOrDescendant('/repo/src', '/repo'))
			.toBe(false)
		expect(isEqualOrDescendant('C:/repo', 'C:/repo/src'))
			.toBe(true)
		expect(isEqualOrDescendant('C:/repo/.state', 'C:/repo'))
			.toBe(false)
		expect(isEqualOrDescendant('D:/state', 'C:/repo'))
			.toBe(false)
	})

	it('rejects state directories that equal or contain projectRoot, not descendants', () => {
		expect(() => assertStateDirSafe('/repo/app', '/repo/app'))
			.toThrow('must not equal or contain projectRoot')
		expect(() => assertStateDirSafe('/repo/app', '/repo'))
			.toThrow('must not equal or contain projectRoot')
		expect(() => assertStateDirSafe('C:/repo/app', 'C:/repo'))
			.toThrow('must not equal or contain projectRoot')
		expect(() => assertStateDirSafe('/repo/app', '/repo/app/.pikacss')).not.toThrow()
		expect(() => assertStateDirSafe('/repo/app', '/other/state')).not.toThrow()
	})

	it('strips only loader query/fragment suffixes for watcher-compatible ids', () => {
		expect(stripLoaderSuffix('/repo/config.ts?raw#x'))
			.toBe('/repo/config.ts')
		expect(stripLoaderSuffix('C:/repo/config.ts'))
			.toBe('C:/repo/config.ts')
	})
})
