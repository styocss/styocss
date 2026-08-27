/// <reference types="vite/client" />

declare module '@pikacss/integration/testing' {
	import type { Engine, EngineConfig } from '@pikacss/core'

	interface InlineIntegrationTestContext {
		readonly engine: Engine
		setup: () => Promise<void>
		transform: (code: string, id: string) => Promise<unknown>
	}

	export function createInlineIntegrationTestContext(options?: {
		readonly config?: EngineConfig
		readonly cwd?: string
		readonly include?: readonly string[]
	}): InlineIntegrationTestContext
}
