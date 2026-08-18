import process from 'node:process'
import { intro, outro } from '@clack/prompts'
import {
	ensureRootTsconfigExtends,
	preparePackageDir,
	promptSegment,
	readRootPackageJson,
	resolveWorkspaceRoot,
	validatePackageSegment,
	writeTemplates,
} from './utils/newPackage'

intro('Create a new plugin package')

const root = resolveWorkspaceRoot(import.meta.url)

let pluginNameInput = process.argv[2]
if (pluginNameInput) {
	const error = validatePackageSegment(pluginNameInput)
	if (error) {
		console.error(`Invalid plugin name: ${error}`)
		process.exit(1)
	}
}
else {
	pluginNameInput = await promptSegment({
		message: 'Plugin name (without prefix, e.g. "icons")',
	})
}

const pluginSlug = pluginNameInput.replace(/^plugin-/, '')
const pkgDirname = `plugin-${pluginSlug}`
const pkgName = pkgDirname

const pluginPascalName = toPascalCase(pluginSlug) || 'Plugin'
const pluginFactoryName = `create${pluginPascalName}Plugin`

const pkgJson = await readRootPackageJson(root)
const packageDir = await preparePackageDir(root, pkgDirname)

const templates = {
	'package.json': `
{
	"name": "@pikacss/${pkgName}",
	"type": "module",
	"publishConfig": {
		"access": "public"
	},
	"version": "${pkgJson.version}",
	"author": "DevilTea <ch19980814@gmail.com>",
	"license": "MIT",
	"repository": {
		"type": "git",
		"url": "git+https://github.com/pikacss/pikacss.git",
		"directory": "packages/${pkgDirname}"
	},
	"bugs": {
		"url": "https://github.com/pikacss/pikacss/issues"
	},
	"keywords": [
		"pikacss",
		"pikacss-plugin",
		"${pluginSlug}"
	],
	"exports": {
		".": {
			"import": {
				"types": "./dist/index.d.mts",
				"default": "./dist/index.mjs"
			}
		}
	},
	"module": "dist/index.mjs",
	"types": "dist/index.d.mts",
	"files": [
		"dist"
	],
	"scripts": {
		"build": "tsdown",
		"build:pack": "pnpm build && pnpm pack",
		"typecheck": "pnpm typecheck:package && pnpm typecheck:test",
		"typecheck:package": "tsc --project ./tsconfig.package.json --noEmit",
		"typecheck:test": "tsc --project ./tsconfig.tests.json --noEmit",
		"test": "vitest run",
		"test:watch": "vitest"
	},
	"peerDependencies": {
		"@pikacss/core": "workspace:*"
	},
	"devDependencies": {
		"@pikacss/core": "workspace:*"
	}
}
	`.trim(),
	'tsdown.config.ts': `
import { defineConfig } from 'tsdown'

export default defineConfig({
	entry: ['src/index.ts'],
	format: ['esm'],
	dts: {
		tsconfig: './tsconfig.package.json',
	},
	clean: true,
})
	`.trim(),
	'vitest.config.ts': `
import { defineConfig } from 'vitest/config'

import { createPackageVitestConfig } from '../_shared/vitest'

export default defineConfig(createPackageVitestConfig())
	`.trim(),
	'src/index.ts': `
import type { EnginePlugin } from '@pikacss/core'
import { defineEnginePlugin } from '@pikacss/core'

/**
 * User-facing configuration for the ${pluginPascalName} plugin.
 *
 * @remarks
 * Add field-level JSDoc directly above each option with @default and
 * @example tags when omission behavior or nested config shapes are
 * observable from the public contract.
 */
export interface ${pluginPascalName}PluginOptions {
}

/**
 * Creates the PikaCSS ${pluginSlug} engine plugin.
 *
 * @remarks
 * Registered hooks:
 * - \`configureEngine\` registers the plugin's engine-facing behavior.
 *
 * Extend this comment with additional hook semantics when the plugin starts
 * using \`configureRawConfig\`, \`rawConfigConfigured\`, or other engine hooks.
 *
 * @param options - Plugin configuration. Document semantic meaning,
 * accepted values, defaults, and omission behavior as fields are added.
 * @returns An {@link EnginePlugin} providing the ${pluginSlug} integration.
 *
 * @example
 * \`\`\`ts
 * import { ${pluginFactoryName} } from '@pikacss/${pkgName}'
 *
 * export default {
 *   plugins: [${pluginFactoryName}()],
 * }
 * \`\`\`
 */
export function ${pluginFactoryName}(options: ${pluginPascalName}PluginOptions = {}): EnginePlugin {
	// The returned plugin object is a reusable definition (#116): \`options\` may
	// stay in this closure only as long as hooks never mutate it. Any mutable
	// per-engine data (resolved config, caches, values read by long-lived
	// callbacks) belongs in \`createState\` and is accessed via \`context.state\`.
	return defineEnginePlugin({
		name: '${pluginSlug}',
		configureEngine: async () => {
			void options
		},
	})
}
	`.trim(),
	[`src/${pluginSlug}.test.ts`]: `
import { describe, expect, it } from 'vitest'

import { ${pluginFactoryName} } from './index'

describe('${pkgName}', () => {
	it('returns plugin definition', () => {
		const plugin = ${pluginFactoryName}()
		expect(plugin.name).toBe('${pluginSlug}')
	})
})
	`.trim(),
	'tsconfig.json': `
{
	"references": [
		{ "path": "./tsconfig.package.json" },
		{ "path": "./tsconfig.tests.json" }
	],
	"files": []
}
	`.trim(),
	'tsconfig.package.json': `
{
	"extends": "@deviltea/tsconfig/neutral",
	"compilerOptions": {
		"composite": true
	},
	"include": [
		"./src/**/*.ts"
	],
	"exclude": [
		"./src/**/*.test.ts"
	]
}
	`.trim(),
	'tsconfig.tests.json': `
{
	"extends": "./tsconfig.package.json",
	"compilerOptions": {
		"composite": true
	},
	"include": [
		"./src/**/*.ts",
		"./vitest.config.ts",
		"../_shared/vitest.ts"
	],
	// Neutralize the inherited package-config exclude: without this, the
	// parent's "exclude" of *.test.ts silently cancels the include above and
	// this project checks zero test files.
	"exclude": []
}
	`.trim(),
}

await writeTemplates(packageDir, templates)

await ensureRootTsconfigExtends(root, pkgDirname)

outro(`Plugin package "@pikacss/${pkgName}" created.`)

function toPascalCase(value: string) {
	return value.split('-')
		.filter(Boolean)
		.map(part => `${part[0]?.toUpperCase() ?? ''}${part.slice(1)}`)
		.join('')
}
