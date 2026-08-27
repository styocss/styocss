import process from 'node:process'
import { describe, expect, it } from 'vitest'
import { createInlineIntegrationTestContext } from './testing'

describe('createInlineIntegrationTestContext', () => {
	it('uses the repository-private canonical defaults', () => {
		const context = createInlineIntegrationTestContext()

		expect(context.cwd)
			.toBe(process.cwd())
		expect(context.currentPackageName)
			.toBe('@pikacss/internal-test-harness')
		expect(context.fnName)
			.toBe('pika')
		expect(context.transformedFormat)
			.toBe('string')
		expect(context.transformFilter.include)
			.toEqual(['**/*.ts', '**/*.vue'])
		expect(context.transformFilter.exclude)
			.toEqual(['.pikacss/**'])
	})

	it('forwards explicit cwd, include patterns, and inline EngineConfig', async () => {
		const context = createInlineIntegrationTestContext({
			cwd: '/tmp/pikacss-inline-harness',
			include: ['src/**/*.ts'],
			config: { prefix: 'test-' },
		})

		expect(context.cwd)
			.toBe('/tmp/pikacss-inline-harness')
		expect(context.transformFilter.include)
			.toEqual(['src/**/*.ts'])
		await context.setup()
		expect(context.resolvedConfig?.prefix)
			.toBe('test-')
	})
})
