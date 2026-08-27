/* eslint-disable no-template-curly-in-string */
import { describe, expect, it, vi } from 'vitest'
import { icons } from './index'

function createEngine() {
	return {
		addConfigDependency: vi.fn(),
		addConfigDirectoryMembershipDependency: vi.fn(),
		addPreflight: vi.fn(),
		store: { atomicStyles: new Map() },
	}
}

function createTestContext(plugin: any) {
	return {
		onDiagnostic: vi.fn(),
		state: plugin.createState?.(),
		pika: { extendStatic: vi.fn() },
		typegen: { add: vi.fn() },
		host: {},
	}
}

describe('neutral icons entry', () => {
	it('registers one Core dynamic shortcut family without a Node.js local loader', async () => {
		const engine = createEngine()
		const plugin = icons()
		const context = createTestContext(plugin)
		const rawConfig: any = { icons: {} }

		await plugin.configureRawConfig?.(rawConfig, context)
		const definition = rawConfig.shortcuts.definitions.at(-1)
		expect(definition.pattern.test('i-mdi:home'))
			.toBe(true)
		expect(definition.inputType)
			.toContain('`i-${string}:${string}`')

		await plugin.configureEngine?.({ ...context, runtime: engine } as any)
		expect(context.state.resolveShortcut)
			.toBeTypeOf('function')
	})
})
