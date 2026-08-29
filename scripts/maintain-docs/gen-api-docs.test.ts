import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import { PACKAGES } from '../_skill-shared'
import { createApiProgram, extractPackageAPI, getPublicAPIEntries, renderDefaultValue, renderPackagePage } from './gen-api-docs'

describe('api entry discovery', () => {
	it('discovers public subpaths and renders entry-specific exports even when names shadow root exports', () => {
		const program = createApiProgram()
		const checker = program.getTypeChecker()

		const iconsPkg = PACKAGES.find(({ name }) => name === '@pikacss/plugin-icons')!
		const iconEntries = getPublicAPIEntries(iconsPkg)
		expect(iconEntries.map(entry => entry.subpath))
			.toContain('./node')
		expect(iconEntries.find(entry => entry.subpath === './node')?.sourceRelativePath)
			.toBe('packages/plugin-icons/src/node.ts')

		const iconsInfo = extractPackageAPI(iconsPkg, program, checker)
		const iconsPage = renderPackagePage(iconsInfo, [iconsInfo])
		expect(iconsPage)
			.toContain('## Public subpath: `@pikacss/plugin-icons/node`')
		expect(iconsPage)
			.toContain('### fileSystemIconCollection(options) {#subpath-node-function-filesystemiconcollection-options}')
		expect(iconsPage)
			.toContain('| `options.dir` | `string` | Directory holding one file per icon.')
		expect(iconsPage)
			.toContain('| `options.extension?` | `string` | File extension appended to the icon name.')
		expect(iconsPage)
			.toContain('### icons() {#subpath-node-function-icons}')

		const tokensPkg = PACKAGES.find(({ name }) => name === '@pikacss/plugin-design-tokens')!
		const tokensInfo = extractPackageAPI(tokensPkg, program, checker)
		const tokensPage = renderPackagePage(tokensInfo, [tokensInfo])
		expect(tokensPage)
			.toContain('## Public subpath: `@pikacss/plugin-design-tokens/node`')
		expect(tokensPage)
			.toContain('### designTokens() {#subpath-node-function-designtokens}')
	})

	it('keeps nested object parameters out of callable headings while rendering their rows', () => {
		const program = createApiProgram()
		const checker = program.getTypeChecker()
		const pkg = PACKAGES.find(({ name }) => name === '@pikacss/core')!
		const info = extractPackageAPI(pkg, program, checker)
		const page = renderPackagePage(info, [info])

		expect(page)
			.toContain('#### renderPreflights(isFormatted, options?)')
		expect(page)
			.not
			.toContain('#### renderPreflights(isFormatted, options?, options.usedAtomicStyleIds?)')
		expect(page)
			.toContain('| `options.usedAtomicStyleIds?` | `Iterable<string>` |')
	})

	it('does not render constructors for type-only classes', () => {
		const program = createApiProgram()
		const checker = program.getTypeChecker()
		const pkg = PACKAGES.find(({ name }) => name === '@pikacss/core')!
		const info = extractPackageAPI(pkg, program, checker)
		const engine = info.exports.find(exp => exp.name === 'Engine')!
		const page = renderPackagePage(info, [info])
		const engineSection = page.slice(page.indexOf('### Engine '), page.indexOf('\n### ', page.indexOf('### Engine ') + 1))

		expect(engine.typeOnly)
			.toBe(true)
		expect(engine.constructors)
			.toHaveLength(1)
		expect(engineSection)
			.toContain('**Type-only export.**')
		expect(engineSection)
			.not
			.toContain('**Constructors:**')
		expect(engineSection)
			.toContain('| `config` | `ResolvedEngineConfig` |')
	})

	it('renders public documented getters as read-only class members', () => {
		const program = createApiProgram()
		const checker = program.getTypeChecker()
		const pkg = PACKAGES.find(({ name }) => name === '@pikacss/core')!
		const info = extractPackageAPI(pkg, program, checker)
		const engine = info.exports.find(exp => exp.name === 'Engine')!
		const page = renderPackagePage(info, [info])

		expect(engine.members)
			.toEqual(expect.arrayContaining([
				expect.objectContaining({
					name: 'configDependencies',
					type: 'readonly EngineConfigDependency[]',
					description: 'Finalized external file and directory-membership dependencies for this engine.',
				}),
			]))
		expect(engine.methods?.some(method => method.name === 'configDependencies'))
			.toBe(false)
		expect(page)
			.toContain('| `configDependencies` | `readonly EngineConfigDependency[]` | Finalized external file and directory-membership dependencies for this engine.')
	})

	it('renders complete inferred return types without broken inline Markdown', () => {
		const program = createApiProgram()
		const checker = program.getTypeChecker()
		const pkg = PACKAGES.find(({ name }) => name === '@pikacss/core')!
		const info = extractPackageAPI(pkg, program, checker)
		const logger = info.exports.find(exp => exp.name === 'createLogger')!
		const page = renderPackagePage(info, [info])
		const start = page.indexOf('### createLogger(')
		const end = page.indexOf('\n### ', start + 1)
		const loggerSection = page.slice(start, end)
		const returnsLine = loggerSection
			.split('\n')
			.find(line => line.startsWith('**Returns:**'))

		expect(logger.returnType)
			.toMatch(/setErrorFn: .*=> void; \}$/)
		expect(logger.returnType?.endsWith('...'))
			.toBe(false)
		expect(returnsLine)
			.toContain('setErrorFn:')
		expect((returnsLine?.match(/`/g) ?? []).length % 2)
			.toBe(0)
	})

	it('renders literal unions in deterministic lexical order', () => {
		const program = createApiProgram()
		const checker = program.getTypeChecker()
		const pkg = PACKAGES.find(({ name }) => name === '@pikacss/plugin-reset')!
		const info = extractPackageAPI(pkg, program, checker)
		const page = renderPackagePage(info, [info])

		expect(page)
			.toContain('**Type:** `"andy-bell" | "eric-meyer" | "modern-normalize" | "normalize" | "the-new-css-reset"`')
	})

	it('renders authored RHS text for composite type aliases across packages', () => {
		const program = createApiProgram()
		const checker = program.getTypeChecker()
		const cases = [
			['@pikacss/core', '.', 'Arrayable', 'T | T[]'],
			['@pikacss/config', '.', 'ReportConfig', 'boolean | Readonly<{ output: string; }>'],
			['@pikacss/integration', '.', 'ProcessorLoader', '() => Promise<FrameworkProcessor>'],
			['@pikacss/plugin-icons', './node', 'FileSystemIconCatalogEnumerator', '(directory: string, extension: string) => Promise<readonly string[]>'],
			['@pikacss/plugin-icons', '.', 'IconCollectionDependencies', 'string | string[] | ((context: WatchableIconCollectionContext) => Awaitable<string | string[]>)'],
			['@pikacss/core', '.', 'CSSSelector', 'CSS.AtRules.Nested | CSSPseudos'],
		] as const

		for (const [packageName, subpath, name, expectedType] of cases) {
			const pkg = PACKAGES.find(({ name: candidate }) => candidate === packageName)!
			const info = extractPackageAPI(pkg, program, checker)
			const entry = info.entries.find(candidate => candidate.subpath === subpath)!
			const alias = entry.exports.find(exp => exp.name === name)!

			expect(alias.resolvedType, `${packageName} ${name}`)
				.toBe(expectedType)
			expect(renderPackagePage(info, [info]), `${packageName} ${name}`)
				.toContain(`**Type:** \`${expectedType}\``)
		}
	})

	it('discovers other package subpaths without package-specific generator entries', () => {
		const pkg = PACKAGES.find(({ name }) => name === '@pikacss/config')!
		expect(getPublicAPIEntries(pkg)
			.map(entry => entry.subpath))
			.toContain('./host')
	})

	it('covers every public manifest subpath with deterministic unique anchors', () => {
		const program = createApiProgram()
		const checker = program.getTypeChecker()

		for (const pkg of PACKAGES) {
			const manifest = JSON.parse(readFileSync(new URL(`../../packages/${pkg.dir}/package.json`, import.meta.url), 'utf8')) as { exports?: Record<string, unknown> }
			const expectedSubpaths = Object.keys(manifest.exports ?? {})
				.filter(subpath => subpath.startsWith('.'))
				.toSorted((left, right) => left === '.' ? -1 : right === '.' ? 1 : left.localeCompare(right))
			const entries = getPublicAPIEntries(pkg)
			expect(entries.map(entry => entry.subpath), pkg.name)
				.toEqual(expectedSubpaths)

			const info = extractPackageAPI(pkg, program, checker)
			const page = renderPackagePage(info, [info])
			const anchors = [...page.matchAll(/^#{3,4} .* \{#([^}]+)\}$/gm)].map(match => match[1])
			expect(new Set(anchors).size, pkg.name)
				.toBe(anchors.length)
		}
	})
})

describe('callable subpath defaults', () => {
	it('renders simple defaults as code and preserves authored Markdown', () => {
		expect(renderDefaultValue('{}'))
			.toBe('`{}`')
		expect(renderDefaultValue('\'string\''))
			.toBe('`\'string\'`')
		expect(renderDefaultValue('undefined'))
			.toBe('`undefined`')
		expect(renderDefaultValue('Host-provided default, otherwise `.pikacss`.'))
			.toBe('Host-provided default, otherwise `.pikacss`.')
		expect(renderDefaultValue('List: `one` | `two`'))
			.toBe('List: `one` \\| `two`')
	})

	it('renders callable signatures for bundler adapter default exports with unique subpath anchors', () => {
		const program = createApiProgram()
		const checker = program.getTypeChecker()
		const pkg = PACKAGES.find(({ name }) => name === '@pikacss/unplugin-pikacss')!
		const info = extractPackageAPI(pkg, program, checker)
		const subpaths = ['rolldown', 'rollup', 'rspack', 'vite', 'webpack']
		const defaultExports = subpaths.map((subpath) => {
			const entry = info.entries.find(candidate => candidate.subpath === `./${subpath}`)!
			return {
				subpath,
				export: entry.exports.find(candidate => candidate.name === 'default')!,
			}
		})

		for (const { export: defaultExport } of defaultExports) {
			expect(defaultExport.kind)
				.toBe('function')
			expect(defaultExport.params)
				.toEqual([{
					name: 'options',
					type: 'PluginOptions',
					description: 'Optional project config path and host project root.',
					optional: true,
				}])
			expect(defaultExport.returnType)
				.toBeTruthy()
		}
		expect(new Set(defaultExports.map(({ export: defaultExport }) => defaultExport.sourceKey)).size)
			.toBe(subpaths.length)

		const page = renderPackagePage(info, [info])
		for (const subpath of subpaths) {
			expect(page)
				.toContain(`### default(options?) {#subpath-${subpath}-function-default-options}`)
			expect(page)
				.not
				.toContain(`### default {#subpath-${subpath}-unknown-default}`)
		}

		const anchors = [...page.matchAll(/^### default\(options\?\) \{#([^}]+)\}/gm)].map(match => match[1])
		expect(new Set(anchors).size)
			.toBe(subpaths.length)
	})

	it('uses inferred return types for Node adapter factories', () => {
		const program = createApiProgram()
		const checker = program.getTypeChecker()

		for (const [packageName, expectedType, expectedDescription] of [
			['@pikacss/plugin-icons', 'EnginePlugin<any>', 'An icons plugin configured with the Iconify Node.js loader.'],
			['@pikacss/plugin-design-tokens', 'EnginePlugin<any>', 'A design-tokens plugin configured with `node:fs` and `process.cwd()` capabilities.'],
		] as const) {
			const pkg = PACKAGES.find(({ name }) => name === packageName)!
			const info = extractPackageAPI(pkg, program, checker)
			const entry = info.entries.find(candidate => candidate.subpath === './node')!
			const factory = entry.exports.find(candidate => candidate.name === 'icons' || candidate.name === 'designTokens')!
			expect(factory.returnType, packageName)
				.toBe(expectedType)

			const page = renderPackagePage(info, [info])
			expect(page, packageName)
				.toContain(`**Returns:** \`${expectedType}\``)
			expect(page, packageName)
				.toContain(expectedDescription)
		}
	})

	it('represents the Nuxt default as a module type and records its re-export surface', () => {
		const pkg = PACKAGES.find(({ name }) => name === '@pikacss/nuxt-pikacss')!
		const program = createApiProgram()
		const checker = program.getTypeChecker()
		const info = extractPackageAPI(pkg, program, checker)
		const defaultExport = info.exports.find(candidate => candidate.name === 'default')!

		expect(pkg.reExports)
			.toBe('@pikacss/unplugin-pikacss')
		expect(defaultExport.kind)
			.toBe('unknown')
		expect(defaultExport.resolvedType)
			.toBe('NuxtModule<ModuleOptions>')
		expect(defaultExport.returnType)
			.toBeUndefined()

		const page = renderPackagePage(info, [info])
		expect(page)
			.toContain('Nuxt module for PikaCSS Re-exports the public surface of [`@pikacss/unplugin-pikacss`](/api/unplugin).')
		expect(page)
			.toContain('**Type:** `NuxtModule<ModuleOptions>`')
		expect(page)
			.not
			.toContain('### default(')
	})

	it('documents public constructor signatures and parameter defaults', () => {
		const program = createApiProgram()
		const checker = program.getTypeChecker()

		const configPkg = PACKAGES.find(({ name }) => name === '@pikacss/config')!
		const configInfo = extractPackageAPI(configPkg, program, checker)
		const configHostError = configInfo.entries
			.find(entry => entry.subpath === './host')!
			.exports.find(exp => exp.name === 'PikaConfigHostError')!
		expect(configHostError.constructors?.[0]?.params.map(param => [param.name, param.type, param.defaultValue]))
			.toContainEqual(['options.selectedConfigPath', 'string | null', 'null'])

		const integrationPkg = PACKAGES.find(({ name }) => name === '@pikacss/integration')!
		const integrationInfo = extractPackageAPI(integrationPkg, program, checker)
		const transformError = integrationInfo.exports.find(exp => exp.name === 'PikaTransformError')!
		const optionsType = transformError.constructors?.[0]?.params.find(param => param.name === 'options')?.type
		expect(transformError.constructors?.[0]?.params)
			.toEqual(expect.arrayContaining([
				expect.objectContaining({ name: 'options.id', type: 'string' }),
				expect.objectContaining({ name: 'options.stage', type: 'TransformErrorStage' }),
			]))
		expect(optionsType)
			.toContain(';')
		expect(optionsType)
			.toContain('id: string; stage: TransformErrorStage; message: string;')
		const generatedType = ts.transpileModule(
			`type ConstructorOptions = ${optionsType};`,
			{ compilerOptions: { noEmit: true }, reportDiagnostics: true },
		)
		expect(generatedType.diagnostics)
			.toHaveLength(0)

		const page = renderPackagePage(integrationInfo, [integrationInfo])
		const configPage = renderPackagePage(configInfo, [configInfo])
		expect(page)
			.toContain('#### constructor(options) {#class-pikatransformerror-constructor-options}')
		expect(page)
			.toContain('| `options.id` | `string` |')
		expect(configPage)
			.not
			.toContain('Missing JSDoc summary.')
		expect(page)
			.not
			.toContain('Missing JSDoc summary.')
	})

	it('renders defaults as authored Markdown without double-wrapping', () => {
		const program = createApiProgram()
		const checker = program.getTypeChecker()
		const configPkg = PACKAGES.find(({ name }) => name === '@pikacss/config')!
		const configInfo = extractPackageAPI(configPkg, program, checker)
		const configPage = renderPackagePage(configInfo, [configInfo])

		expect(configPage)
			.toContain('| `engine?` | `EngineConfig` | Engine-specific configuration for this project entry. | `{}` |')
		expect(configPage)
			.toContain(`| \`transformedFormat?\` | \`'string' \\| 'array'\` | Replacement shape emitted for the configured base callable. | \`'string'\` |`)
		expect(configPage)
			.toContain(`| \`include?\` | \`string \\| readonly string[]\` | Source-file glob or globs to include in this entry's scan. | \`DEFAULT_SCAN_INCLUDE\` (all supported JavaScript, TypeScript, and Vue source files) |`)
		expect(configPage)
			.toContain('Host-provided default, otherwise `.pikacss`.')
		expect(configPage)
			.not
			.toContain('``DEFAULT_SCAN_INCLUDE``')

		const fontsPkg = PACKAGES.find(({ name }) => name === '@pikacss/plugin-fonts')!
		const fontsInfo = extractPackageAPI(fontsPkg, program, checker)
		const fontsPage = renderPackagePage(fontsInfo, [fontsInfo])
		expect(fontsPage)
			.toContain('| `provider?` | `FontsProvider` | Provider override for this font, taking precedence over the global `provider` option. | `undefined` |')
	})
})
