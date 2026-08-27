import type { EngineConfig } from '@pikacss/core'
import type { IntegrationContext } from './types'
import process from 'node:process'
import { createCtx } from './ctx'

/**
 * Repository-private compatibility harness for tests that must execute source
 * through the real compiler -> prepare -> commit -> rewrite pipeline while
 * supplying an inline EngineConfig.
 *
 * This module is intentionally absent from package exports. Production hosts
 * must use canonical file-backed project configuration and createPikaCSSContext.
 */
export function createInlineIntegrationTestContext(options: {
	readonly config?: EngineConfig
	readonly cwd?: string
	readonly include?: readonly string[]
} = {}): IntegrationContext {
	return createCtx({
		cwd: options.cwd ?? process.cwd(),
		currentPackageName: '@pikacss/internal-test-harness',
		scan: {
			include: [...(options.include ?? ['**/*.ts', '**/*.vue'])],
			exclude: [],
		},
		configOrPath: options.config ?? {},
		fnName: 'pika',
		transformedFormat: 'string',
		tsCodegen: false,
		autoCreateConfig: false,
	})
}
