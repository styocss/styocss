import type { EngineConfig } from '@pikacss/core'
import type { FileSpread, FixtureProject, ProbePosition, ScenarioParams } from './types'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export async function generateFixture(params: ScenarioParams, repoRoot: string): Promise<FixtureProject> {
	const dir = await mkdtemp(join(tmpdir(), 'pikacss-type-bench-'))

	await writeTsConfig(dir, repoRoot)
	const engineConfig = await buildEngineConfig(params, repoRoot)
	await generatePikaGenTs(dir, engineConfig, repoRoot)
	const probePositions = await generateSourceFiles(dir, params)

	return { dir, probePositions }
}

async function writeTsConfig(dir: string, repoRoot: string): Promise<void> {
	const tsconfig = {
		compilerOptions: {
			target: 'ES2022',
			module: 'ESNext',
			moduleResolution: 'bundler',
			strict: true,
			skipLibCheck: true,
			noEmit: true,
			types: [],
			paths: {
				'@pikacss/core': [`${join(repoRoot, 'packages/core/src/index.ts')}`],
				'@pikacss/integration': [`${join(repoRoot, 'packages/integration/src/index.ts')}`],
				'@pikacss/unplugin-pikacss': [`${join(repoRoot, 'packages/unplugin/src/index.ts')}`],
			},
		},
		include: ['src/**/*.ts', 'pika.gen.ts'],
	}
	await writeFile(join(dir, 'tsconfig.json'), JSON.stringify(tsconfig, null, '\t'))
}

async function buildEngineConfig(params: ScenarioParams, repoRoot: string): Promise<EngineConfig> {
	const plugins: EngineConfig['plugins'] = []

	// designTokens dimension: register the real @pikacss/plugin-design-tokens through the
	// same createCtx() codegen pipeline the other dimensions use. The generated DTCG tokens
	// are passed as an inline source, so their CSS variables flow into pika.gen.ts and grow
	// the autocomplete type surface exactly as a real project's tokens would.
	let designTokensConfig: unknown
	// `designTokens` and `designTokensStrict` are mutually exclusive dimensions
	// (each other's baseline is 0). The strict variant enables `strict.types` so the
	// generated pika.gen.ts carries the exclusive value unions.
	const tokenCount = params.designTokensStrict > 0 ? params.designTokensStrict : params.designTokens
	if (tokenCount > 0) {
		const { designTokens } = await import(join(repoRoot, 'packages/plugin-design-tokens/src/index.ts'))
		plugins.push(designTokens())
		designTokensConfig = {
			sources: generateDesignTokens(tokenCount),
			...(params.designTokensStrict > 0 ? { strict: { types: true } } : {}),
		}
	}

	// The type complexity comes from the generated pika.gen.ts, not from plugin runtime.
	// For pluginCount > 0 we add dummy plugins that register autocomplete entries,
	// simulating the type surface area that real plugins would produce.
	for (let i = 0; i < params.pluginCount; i++) {
		plugins.push({
			name: `bench-plugin-${i}`,
			configureEngine: (engine: any) => {
				// Each plugin adds some selectors and shortcuts to grow the autocomplete union
				const selectors: Array<[string, string]> = []
				const shortcuts: Array<[string, Record<string, string>]> = []
				for (let j = 0; j < 5; j++) {
					selectors.push([`@p${i}-sel-${j}`, `.p${i}-sel-${j} $`])
					shortcuts.push([`p${i}-sc-${j}`, { display: 'block' }])
				}
				engine.selectors?.add?.(...selectors)
				engine.shortcuts?.add?.(...shortcuts)
			},
		} as any)
	}

	// Generate selectors
	const selectors: Array<[string, string]> = []
	for (let i = 0; i < Math.min(params.autocompleteSize, 50); i++) {
		selectors.push([`@sel-${i}`, `.sel-${i} $`])
	}

	// Generate shortcuts
	const shortcuts: Array<[string, Record<string, string>]> = []
	for (let i = 0; i < params.autocompleteSize; i++) {
		shortcuts.push([`sc-${i}`, { color: 'red' }])
	}

	// Generate variables
	const variables: Record<string, string> = {}
	for (let i = 0; i < Math.min(params.autocompleteSize, 30); i++) {
		variables[`--bench-var-${i}`] = `#ff00${String(i)
			.padStart(2, '0')}`
	}

	return {
		plugins,
		selectors: { selectors },
		shortcuts: { shortcuts },
		variables: { variables },
		...(designTokensConfig != null ? { designTokens: designTokensConfig } : {}),
	} as EngineConfig
}

type DesignTokenGroup = Record<string, unknown>

/**
 * Generate a realistically-shaped W3C Design Tokens (DTCG) group containing exactly
 * `count` leaf tokens. Tokens use nested paths (e.g. `color.grey.100`) and a mix of
 * `$type` values (color, dimension, duration, fontFamily, fontWeight, number),
 * round-robined across producers so the distribution stays even at every scale.
 */
function generateDesignTokens(count: number): DesignTokenGroup {
	const root: DesignTokenGroup = {}

	const setPath = (path: string[], node: unknown): void => {
		let cursor = root
		for (let i = 0; i < path.length - 1; i++) {
			const key = path[i]!
			cursor[key] ??= {}
			cursor = cursor[key] as DesignTokenGroup
		}
		cursor[path[path.length - 1]!] = node
	}

	const colorFamilies = ['grey', 'red', 'orange', 'yellow', 'green', 'teal', 'blue', 'indigo', 'purple', 'pink']
	const shades = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900]
	const dimensionGroups = ['spacing', 'size', 'radius']
	const fontFamilyStacks = [
		['Inter', 'system-ui', 'sans-serif'],
		['Georgia', 'Cambria', 'serif'],
		['SFMono-Regular', 'Menlo', 'monospace'],
	]
	const fontWeightNames: Array<[string, number]> = [
		['thin', 100],
		['light', 300],
		['regular', 400],
		['medium', 500],
		['semibold', 600],
		['bold', 700],
		['black', 900],
	]
	const numberGroups = ['opacity', 'z-index', 'scale']

	let ci = 0
	let di = 0
	let dui = 0
	let ffi = 0
	let fwi = 0
	let ni = 0

	const producers: Array<() => void> = [
		// color: color.<family>.<shade> (e.g. color.grey.100)
		() => {
			const family = colorFamilies[ci % colorFamilies.length]!
			const shade = shades[Math.floor(ci / colorFamilies.length) % shades.length]!
			const wrap = Math.floor(ci / (colorFamilies.length * shades.length))
			const path = wrap === 0
				? ['color', family, String(shade)]
				: ['color', `palette-${wrap}`, family, String(shade)]
			const hex = `#${(((ci * 2654435761) >>> 8) & 0xFFFFFF).toString(16)
				.padStart(6, '0')}`
			setPath(path, { $value: hex, $type: 'color' })
			ci++
		},
		// dimension: <group>.<index> (e.g. spacing.4)
		() => {
			const group = dimensionGroups[di % dimensionGroups.length]!
			const idx = Math.floor(di / dimensionGroups.length)
			setPath([group, String(idx)], { $value: `${idx * 4}px`, $type: 'dimension' })
			di++
		},
		// duration: duration.step-<index>
		() => {
			setPath(['duration', `step-${dui}`], { $value: `${(dui + 1) * 50}ms`, $type: 'duration' })
			dui++
		},
		// fontFamily: font.family.<index> (array value)
		() => {
			const stack = fontFamilyStacks[ffi % fontFamilyStacks.length]!
			setPath(['font', 'family', String(ffi)], { $value: [...stack], $type: 'fontFamily' })
			ffi++
		},
		// fontWeight: font.weight.<name> (numeric value)
		() => {
			const [name, weight] = fontWeightNames[fwi % fontWeightNames.length]!
			const wrap = Math.floor(fwi / fontWeightNames.length)
			const key = wrap === 0 ? name : `${name}-${wrap}`
			setPath(['font', 'weight', key], { $value: weight, $type: 'fontWeight' })
			fwi++
		},
		// number: <group>.<index> (unitless numeric value)
		() => {
			const group = numberGroups[ni % numberGroups.length]!
			const idx = Math.floor(ni / numberGroups.length)
			setPath([group, String(idx)], { $value: idx, $type: 'number' })
			ni++
		},
	]

	for (let i = 0; i < count; i++)
		producers[i % producers.length]!()

	return root
}

async function generatePikaGenTs(dir: string, engineConfig: EngineConfig, repoRoot: string): Promise<void> {
	// Use the real codegen pipeline via dynamic import
	const { createCtx } = await import(join(repoRoot, 'packages/integration/src/ctx.ts'))

	const ctx = createCtx({
		cwd: dir,
		currentPackageName: '@pikacss/unplugin-pikacss',
		configOrPath: engineConfig,
		fnName: 'pika',
		transformedFormat: 'string' as const,
		tsCodegen: 'pika.gen.ts',
		scan: { include: ['src/**/*.ts'], exclude: [] },
		autoCreateConfig: false,
	})

	await ctx.setup()
	await ctx.writeTsCodegenFile()
	await ctx.writeCssCodegenFile()
}

async function generateSourceFiles(dir: string, params: ScenarioParams): Promise<ProbePosition[]> {
	const srcDir = join(dir, 'src')
	await mkdir(srcDir, { recursive: true })

	const fileCount = getFileCount(params.fileSpread)
	const callsPerFile = Math.ceil(params.callCount / fileCount)
	const allProbes: ProbePosition[] = []
	// In the strict-types dimension, call sites use governed properties with values
	// the exclusive union accepts, so they exercise the narrowed types cleanly.
	const strict = params.designTokensStrict > 0

	for (let f = 0; f < fileCount; f++) {
		const filename = fileCount === 1 ? 'main.ts' : `file-${f}.ts`
		const calls = f === fileCount - 1
			? params.callCount - callsPerFile * (fileCount - 1) // last file gets remainder
			: callsPerFile

		const { content, probes } = generateFileContent(calls, params.nestingDepth, f, join(srcDir, filename), strict)
		await writeFile(join(srcDir, filename), content)
		allProbes.push(...probes)
	}

	// Generate barrel file if multiple files
	if (fileCount > 1) {
		const imports = Array.from({ length: fileCount }, (_, i) => `import './file-${i}'`)
			.join('\n')
		await writeFile(join(srcDir, 'index.ts'), imports)
	}

	return allProbes
}

function getFileCount(spread: FileSpread): number {
	switch (spread) {
		case 'single': return 1
		case '10files': return 10
		case '50files': return 50
	}
}

function generateFileContent(callCount: number, nestingDepth: number, fileIndex: number, filePath: string, strict = false): { content: string, probes: ProbePosition[] } {
	const lines: string[] = [
		`/// <reference path="../pika.gen.ts" />`,
		``,
	]
	const probes: ProbePosition[] = []

	// Add probe-instrumented pika calls at the beginning of the first file
	if (fileIndex === 0) {
		// Probe 1: property-value — cursor inside a CSS property value position
		// pika({ color: '|' })
		const probeLine1 = lines.length + 1 // 1-indexed
		lines.push(`const _probe_pv = pika({ color: '' })`)
		probes.push({ file: filePath, line: probeLine1, character: 34, kind: 'property-value' })

		// Probe 2: shortcut-string — cursor inside a shortcut string
		// pika('|')
		const probeLine2 = lines.length + 1
		lines.push(`const _probe_sc = pika('')`)
		probes.push({ file: filePath, line: probeLine2, character: 25, kind: 'shortcut-string' })

		// Probe 3: selector-key — cursor at a selector key position
		// pika({ '|': {} })
		const probeLine3 = lines.length + 1
		lines.push(`const _probe_sel = pika({ '': { color: 'red' } })`)
		probes.push({ file: filePath, line: probeLine3, character: 28, kind: 'selector-key' })

		// Probe 4: hover on pika call
		const probeLine4 = lines.length + 1
		lines.push(`const _probe_hover = pika({ display: 'flex' })`)
		probes.push({ file: filePath, line: probeLine4, character: 22, kind: 'hover' })

		lines.push(``)
	}

	for (let i = 0; i < callCount; i++) {
		const varName = `cls_${fileIndex}_${i}`
		const callCode = strict ? generateStrictPikaCall(i) : generatePikaCall(i, nestingDepth)
		lines.push(`const ${varName} = ${callCode}`)
	}

	// Use variables to avoid unused warnings
	if (callCount > 0) {
		lines.push('')
		const probeExports = fileIndex === 0 ? ', _probe_pv, _probe_sc, _probe_sel, _probe_hover' : ''
		lines.push(`export const results = [${Array.from({ length: callCount }, (_, i) => `cls_${fileIndex}_${i}`)
			.join(', ')}${probeExports}]`)
	}

	return { content: lines.join('\n'), probes }
}

function generatePikaCall(index: number, nestingDepth: number): string {
	if (nestingDepth <= 1) {
		// Diverse property combinations to exercise type resolution
		const allProps = [
			`color: 'red'`,
			`display: 'flex'`,
			`padding: '${index}px'`,
			`margin: '${index % 10}rem'`,
			`backgroundColor: '#${String(index)
				.padStart(6, '0')}'`,
			`fontSize: '${12 + (index % 20)}px'`,
			`fontWeight: '${(index % 9 + 1) * 100}'`,
			`lineHeight: '${1 + (index % 5) * 0.25}'`,
			`width: '${index % 100}%'`,
			`height: 'auto'`,
			`position: 'relative'`,
			`zIndex: '${index}'`,
			`opacity: '${(index % 10) / 10}'`,
			`border: '1px solid #ccc'`,
			`borderRadius: '${index % 12}px'`,
			`overflow: 'hidden'`,
		]
		// Pick a varying subset of properties per call
		const start = index % allProps.length
		const count = 3 + (index % 5)
		const props: string[] = []
		for (let i = 0; i < count; i++) {
			props.push(allProps[(start + i) % allProps.length]!)
		}
		return `pika({ ${props.join(', ')} })`
	}

	// Nested call with selectors
	return `pika(${generateNestedStyleDef(nestingDepth, 0, index)})`
}

/**
 * Generate a flat `pika()` call on governed CSS properties using only values the
 * strict-type exclusive union accepts: `var(--token)` references to the
 * deterministic first color/dimension tokens, CSS-wide keywords, the built-in
 * allowlist, and functional escape hatches. Exercises the narrowed property types
 * without producing type errors.
 */
function generateStrictPikaCall(index: number): string {
	// Deterministic first tokens produced by generateDesignTokens (color.grey.50
	// and spacing.0), always present at every strict scale (>= 100 tokens).
	const colorValues = [
		`'var(--color-grey-50)'`,
		`'inherit'`,
		`'transparent'`,
		`'currentColor'`,
		`'color-mix(in srgb, red, blue)'`,
	]
	const dimensionValues = [
		`'var(--spacing-0)'`,
		`'0'`,
		`'auto'`,
		`'calc(100% - 8px)'`,
		`'inherit'`,
	]
	const colorProps = ['color', 'backgroundColor', 'borderColor']
	const dimensionProps = ['padding', 'margin', 'width', 'height', 'fontSize', 'borderRadius']

	const props: string[] = []
	const colorProp = colorProps[index % colorProps.length]!
	props.push(`${colorProp}: ${colorValues[index % colorValues.length]!}`)
	for (let k = 0; k < 3; k++) {
		const dimProp = dimensionProps[(index + k) % dimensionProps.length]!
		props.push(`${dimProp}: ${dimensionValues[(index + k) % dimensionValues.length]!}`)
	}
	return `pika({ ${props.join(', ')} })`
}

function generateNestedStyleDef(maxDepth: number, currentDepth: number, seed: number): string {
	const indent = '\t'.repeat(currentDepth + 1)
	const cssProps = ['color', 'display', 'padding', 'margin', 'fontSize', 'backgroundColor']
	const prop1 = cssProps[seed % cssProps.length]
	const prop2 = cssProps[(seed + 1) % cssProps.length]
	const props = [`${indent}${prop1}: 'blue'`, `${indent}${prop2}: 'grid'`]

	if (currentDepth < maxDepth - 1) {
		const selectors = ['@media (min-width: 768px)', '@media (min-width: 1024px)', ':hover', ':focus']
		const sel = selectors[currentDepth % selectors.length]
		const nested = generateNestedStyleDef(maxDepth, currentDepth + 1, seed + 1)
		props.push(`${indent}'${sel}': ${nested}`)
	}

	return `{\n${props.join(',\n')}\n${'\t'.repeat(currentDepth)}}`
}
