import { describe, expect, it, vi } from 'vitest'
import { icons } from './index'

function createEngine() {
	return {
		config: { prefix: 'pk-' },
		appendAutocomplete: vi.fn(),
		shortcuts: { add: vi.fn() },
		variables: { store: new Map(), add: vi.fn() },
		reportDiagnostic: vi.fn(),
	}
}

function createTestContext(plugin: any) {
	return { onDiagnostic: () => {}, state: plugin.createState?.(), host: {} }
}

describe('neutral icons entry', () => {
	it('registers without a Node.js local loader', async () => {
		const engine = createEngine()
		const plugin = icons()
		const context = createTestContext(plugin)
		await plugin.configureRawConfig?.({ icons: {} } as any, context)
		await plugin.configureEngine?.(engine as any, context)
		expect(engine.shortcuts.add)
			.toHaveBeenCalledTimes(1)
	})
})
