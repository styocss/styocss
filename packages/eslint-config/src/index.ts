import type { ESLint, Linter } from 'eslint'
import { loadPikaConfig } from '@pikacss/config/host'
import { resolve } from 'pathe'
import packageJson from '../package.json'
import { deriveLintProject } from './lint-project'
import { createStaticUsageRule } from './rules/static-usage'

declare const process: { cwd: () => string }

/**
 * Options accepted by the PikaCSS ESLint configuration factory functions.
 *
 * @remarks
 * Project semantics are loaded from the canonical PikaCSS config. The only
 * public option selects that config file.
 *
 * @example
 * ```ts
 * import pikacss from '@pikacss/eslint-config'
 * export default [await pikacss({ config: './pika.config.mts' })]
 * ```
 */
export interface PikacssConfigOptions {
	/** Explicit config-file selection. Omit to use canonical auto-discovery. */
	config?: string
}

/**
 * Creates the configured PikaCSS ESLint flat-config entry.
 *
 * @param options - Optional canonical config-file selection.
 * @returns A promise for one flat-config entry.
 *
 * @remarks
 * One Config-host load derives both the readonly globals and the private model
 * captured by the configured rule instance.
 *
 * @example
 * ```ts
 * import pikacss from '@pikacss/eslint-config'
 * export default [await pikacss()]
 * ```
 */
export async function pikacss(options?: PikacssConfigOptions): Promise<Linter.Config> {
	const config = options?.config === undefined ? {} : { config: options.config }
	const loaded = await loadPikaConfig({
		projectRoot: resolve(process.cwd()),
		...(config),
	})
	const { model, globals } = deriveLintProject(loaded)
	const staticUsage = createStaticUsageRule(model)
	const configuredPlugin: ESLint.Plugin = {
		meta: {
			name: packageJson.name,
			version: packageJson.version,
		},
		rules: {
			'static-usage': staticUsage,
		},
	}

	return {
		languageOptions: {
			globals,
		},
		plugins: {
			pikacss: configuredPlugin,
		},
		rules: {
			'pikacss/static-usage': 'error',
		},
	}
}

/**
 * Named alias for the default async PikaCSS setup factory.
 *
 * @param options - Optional canonical config-file selection.
 */
export const recommended = pikacss

export default pikacss
