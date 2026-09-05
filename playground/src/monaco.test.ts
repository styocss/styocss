// @vitest-environment happy-dom

import * as monaco from 'monaco-editor'
import { describe, expect, it } from 'vitest'

describe('monaco TypeScript API', () => {
	it('exposes language defaults from the Monaco 0.56 top-level namespace', () => {
		expect(monaco.typescript.typescriptDefaults)
			.toBeDefined()
		expect(monaco.typescript.javascriptDefaults)
			.toBeDefined()
	})
})
