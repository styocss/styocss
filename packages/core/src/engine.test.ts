import type { PreflightFn } from './types'
import { describe, expect, it } from 'vitest'

import { createDeferred } from '../../_shared/vitest'
import { calcAtomicStyleRenderingWeight, createEngine, Engine, renderAtomicStyles, renderPreflightDefinition, resolveEngineConfig, resolvePreflight, resolveStyleItemList, sortLayerNames } from './engine'
import { defineEnginePlugin } from './plugin'

describe('createEngine', () => {
	it('registers __layer and __important through deterministic Typegen properties', async () => {
		const engine = await createEngine({ layers: { components: 5 } })
		const contributions = engine.typegen.snapshot.contributions
		const layers = contributions.find(({ id }) => id === 'core:layers')
		const important = contributions.find(({ id }) => id === 'core:important')

		expect(layers?.properties)
			.toBe('__PikaLayerProperties')
		expect(layers?.declarations)
			.toContain('__layer?: __PikaLayerName')
		expect(layers?.declarations)
			.toContain('\"components\"')
		expect(layers?.declarations)
			.toContain('(string & {})')
		expect(important?.properties)
			.toBe('__PikaImportantProperties')
		expect(important?.declarations)
			.toContain('__important?: boolean')
	})

	it('orders configured layer Typegen literals deterministically', async () => {
		const engine = await createEngine({ layers: { zebra: 20, alpha: 2 } })
		const declarations = engine.typegen.snapshot.contributions.find(({ id }) => id === 'core:layers')?.declarations ?? ''
		const alpha = declarations.indexOf('\"alpha\"')
		const zebra = declarations.indexOf('\"zebra\"')

		expect(alpha)
			.toBeGreaterThanOrEqual(0)
		expect(zebra)
			.toBeGreaterThan(alpha)
	})

	it('runs style definitions through plugin transforms before rendering atomic styles', async () => {
		const engine = await createEngine({
			important: { default: true },
			layers: { components: 5 },
			plugins: [
				defineEnginePlugin({
					name: 'test:transform-color',
					order: 'pre',
					transformStyleDefinitions(styleDefinitions) {
						return styleDefinitions.map(styleDefinition => ({
							...styleDefinition,
							color: 'blue',
						}))
					},
				}),
			],
		})

		const ids = await engine.use({ __layer: 'components', color: 'red' })
		const css = await engine.renderAtomicStyles(false, { atomicStyleIds: ids })

		expect(ids)
			.toHaveLength(1)
		expect(css)
			.toContain('@layer components {')
		expect(css)
			.toContain(`.${ids[0]}{color:blue !important;}`)
	})

	it('calls extract-level transformStyleItems when a style definition contains nested arrays', async () => {
		const engine = await createEngine({
			shortcuts: {
				definitions: [
					{ name: 'btn', value: { display: 'flex' } },
				],
			},
		})

		const ids = await engine.use({ hover: ['btn'] as any })
		const css = await engine.renderAtomicStyles(false, { atomicStyleIds: ids })

		expect(css)
			.toContain('display:flex;')
	})

	it('renders deduplicated css imports before wrapping unlayered preflights into the default preflight layer', async () => {
		const engine = await createEngine({
			cssImports: [
				'@import url("theme.css")',
				'@import url("theme.css");',
			],
			preflights: [
				{
					':root': {
						color: 'red',
					},
				},
			],
		})

		const css = await engine.renderPreflights(false)

		expect(css.match(/@import url\("theme.css"\);/g))
			.toHaveLength(1)
		expect(css)
			.toContain('@layer preflights {')
		expect(css)
			.toContain(':root{color:red;}')
	})

	it('normalizes css imports and keeps layer order declarations stable when appending imports later', async () => {
		const engine = await createEngine({
			cssImports: [' @import url("theme.css") ', ''],
			layers: { components: 5 },
		})

		engine.appendCssImport('@import url("theme.css");')
		engine.appendCssImport(' @import url("extra.css") ')

		expect(engine.config.cssImports)
			.toEqual(['@import url("theme.css");', '@import url("extra.css");'])
		expect(engine.renderLayerOrderDeclaration())
			.toBe('@layer preflights, components, utilities;')
	})

	it('leaves unlayered preflights unwrapped when the default preflight layer name is not configured', async () => {
		const engine = await createEngine({
			defaultPreflightsLayer: 'base',
			preflights: [
				{ body: { color: 'red' } },
			],
		})

		expect(await engine.renderPreflights(false))
			.toBe('body{color:red;}')
	})
})

describe('engine helpers', () => {
	it('resolves wrapped preflights and normalizes engine config state', async () => {
		const resolvedPreflight = resolvePreflight({
			layer: 'base',
			preflight: {
				id: 'named',
				preflight: { body: { color: 'red' } },
			},
		})

		expect(resolvedPreflight.layer)
			.toBe('base')
		expect(resolvedPreflight.id)
			.toBe('named')
		expect(await resolvedPreflight.fn({} as any, false))
			.toEqual({ body: { color: 'red' } })

		const resolvedConfig = await resolveEngineConfig({
			cssImports: [' @import url("theme.css") ', '@import url("theme.css");'],
			preflights: [{ body: { color: 'red' } }],
			layers: { components: 5 },
		})

		expect(resolvedConfig.cssImports)
			.toEqual(['@import url("theme.css");'])
		expect(resolvedConfig.layers.components)
			.toBe(5)
		expect(resolvedConfig.preflights)
			.toHaveLength(1)
	})

	it('separates unknown items and prefixes extracted content when __layer is present', async () => {
		const result = await resolveStyleItemList({
			itemList: ['unknown', { __layer: 'components', color: 'red' } as any],
			transformStyleItems: async styleItems => styleItems,
			extractStyleDefinition: async () => [{ selector: ['%'], property: 'color', value: ['red'] }],
		})

		expect([...result.unknown])
			.toEqual(['unknown'])
		expect(result.contents)
			.toEqual([
				{ selector: ['@layer components', '%'], property: 'color', value: ['red'] },
			])
	})

	it('renders atomic styles across known and unknown layers while skipping invalid declarations', () => {
		const css = renderAtomicStyles({
			atomicStyles: [
				{ id: 'pk-a', content: { selector: ['@layer components', '%'], property: 'display', value: ['block'] } },
				{ id: 'pk-b', content: { selector: ['%:hover'], property: 'color', value: ['red'] } },
				{ id: 'pk-c', content: { selector: ['@layer ghost', '%'], property: 'margin', value: ['0'] } },
				{ id: 'pk-d', content: { selector: ['.missing-placeholder'], property: 'color', value: ['blue'] } },
				{ id: 'pk-e', content: { selector: ['%'], property: 'padding', value: null } as any },
			],
			isFormatted: false,
			defaultSelector: '%',
			layers: { components: 5, utilities: 10 },
			defaultUtilitiesLayer: 'utilities',
		})

		expect(css)
			.toContain('@layer utilities {pk-b:hover{color:red;}}')
		expect(css)
			.toContain('pk-c{margin:0;}')
		expect(css)
			.toContain('@layer components {pk-a{display:block;}}')
		expect(css.includes('.missing-placeholder'))
			.toBe(false)
	})

	it('renders preflight definitions after selector transforms', async () => {
		const engine = await createEngine({
			selectors: {
				definitions: [
					{ name: 'hover', value: '$:hover' },
				],
			},
		})

		expect(await renderPreflightDefinition({
			engine,
			preflightDefinition: {
				hover: { color: 'red' },
			},
			isFormatted: false,
		}))
			.toBe(':hover{color:red;}')
	})

	it('renders stored atomic styles through the engine instance when no id filter is provided', async () => {
		const engine = await createEngine()
		const ids = await engine.use({ color: 'red' }, { '&:hover': { color: 'blue' } })

		expect(await engine.renderAtomicStyles(false))
			.toContain(`&:hover{.${ids[1]}{color:blue;}}`)
	})

	it('returns the same ids without re-registering when use is called with duplicate styles', async () => {
		const engine = await createEngine()
		const ids1 = await engine.use({ color: 'red' })
		const ids2 = await engine.use({ color: 'red' })

		expect(ids1)
			.toEqual(ids2)
	})

	it('reuses a shorthand utility across use calls when its existing order already fits later longhand conflicts', async () => {
		const engine = await createEngine()
		const ids1 = await engine.use({ paddingBottom: '8px', padding: '32px' })
		const ids2 = await engine.use({ padding: '32px', paddingBottom: '8px' })
		const css = await engine.renderAtomicStyles(false)

		expect(ids1[1])
			.toBe(ids2[0])
		expect(css.match(/padding:32px;/g))
			.toHaveLength(1)
	})

	it('renders atomic styles without layer grouping when no layer config is provided', () => {
		expect(renderAtomicStyles({
			atomicStyles: [
				{ id: 'pk-a', content: { selector: ['%:hover'], property: 'color', value: ['red'] } },
				{ id: 'pk-b', content: { selector: ['%'], property: 'display', value: ['block'] } },
			],
			isFormatted: false,
			defaultSelector: '%',
		}))
			.toBe('pk-b{display:block;}pk-a:hover{color:red;}')
	})

	it('falls back to the last known layer when defaultUtilitiesLayer is missing and leaves styles unlayered when layer config is empty', () => {
		expect(renderAtomicStyles({
			atomicStyles: [
				{ id: 'pk-a', content: { selector: ['%'], property: 'color', value: ['red'] } },
			],
			isFormatted: false,
			defaultSelector: '%',
			layers: {},
		}))
			.toBe('pk-a{color:red;}')

		expect(renderAtomicStyles({
			atomicStyles: [
				{ id: 'pk-a', content: { selector: ['%', '&:hover'], property: 'color', value: ['red'] } },
			],
			isFormatted: false,
			defaultSelector: '%',
			layers: { components: 5, utilities: 10 },
			defaultUtilitiesLayer: 'ghost',
		}))
			.toContain('@layer utilities {pk-a{&:hover{color:red;}}}')
	})

	it('treats a layer selector with only whitespace after the prefix as unlayered', () => {
		const result = renderAtomicStyles({
			atomicStyles: [
				{ id: 'pk-a', content: { selector: ['@layer   ', '%'], property: 'color', value: ['red'] } },
			],
			isFormatted: false,
			defaultSelector: '%',
			layers: { utilities: 10 },
		})

		expect(result)
			.toContain('@layer utilities {')
		expect(result)
			.toContain('pk-a')
		expect(result)
			.toContain('color:red;')
	})

	it('skips empty transformed preflight selectors and nullish values while preserving nested blocks', async () => {
		const engine = await createEngine({
			plugins: [
				defineEnginePlugin({
					name: 'test:drop-empty-selector',
					async transformSelectors(selectors) {
						return selectors[0] === 'skip'
							? []
							: selectors
					},
				}),
			],
		})

		expect(await renderPreflightDefinition({
			engine,
			preflightDefinition: {
				skip: { color: 'red' },
				body: {
					'color': null,
					'&:hover': { color: 'blue' },
				},
			},
			isFormatted: false,
		}))
			.toBe('body{&:hover{color:blue;}}')
	})

	it('renders raw css preflights, grouped layers, and multi-part transformed selectors', async () => {
		const engine = await createEngine({
			plugins: [
				defineEnginePlugin({
					name: 'test:multipart-selectors',
					async transformSelectors(selectors) {
						return selectors[0] === 'compound'
							? ['html', '&:focus']
							: selectors
					},
				}),
			],
			preflights: [
				() => '.raw{display:block;}',
				{ layer: 'components', preflight: { body: { color: 'red' } } },
			],
		})

		expect(await engine.renderPreflights(true))
			.toContain('.raw{display:block;}')
		expect(await renderPreflightDefinition({
			engine,
			preflightDefinition: {
				body: null as any,
				compound: { color: 'blue' },
			},
			isFormatted: false,
		}))
			.toBe('html{&:focus{color:blue;}}')
	})

	it('notifies hooks only when imports, preflights, or atomic styles actually change', async () => {
		const calls = { atomic: 0, preflight: 0 }
		const engine = await createEngine({
			plugins: [defineEnginePlugin({
				name: 'test:observer',
				atomicStyleAdded() { calls.atomic += 1 },
				preflightUpdated() { calls.preflight += 1 },
			})],
		})
		const initialPreflightCalls = calls.preflight

		engine.appendCssImport('')
		engine.appendCssImport('@import url("theme.css")')
		engine.appendCssImport('@import url("theme.css")')
		engine.addPreflight({ body: { color: 'red' } })
		await engine.use({ color: 'red' }, { color: 'red' })

		expect(calls.preflight - initialPreflightCalls)
			.toBe(2)
		expect(calls.atomic)
			.toBe(1)
		expect('appendAutocomplete' in engine)
			.toBe(false)
	})

	it('supports empty layer declarations and deterministic layer ordering helpers', async () => {
		const resolved = await resolveEngineConfig({ layers: { zeta: 2, alpha: 2, base: 1 } })
		const engine = new Engine({ ...resolved, layers: {} as any })

		expect(engine.renderLayerOrderDeclaration())
			.toBe('')
		expect(sortLayerNames(resolved.layers))
			.toEqual(['base', 'preflights', 'alpha', 'zeta', 'utilities'])
		expect(calcAtomicStyleRenderingWeight({
			id: 'pk-a',
			content: { selector: ['@layer utilities', '%'], property: 'color', value: ['red'] },
		}, '%'))
			.toBe(0)
	})

	it('groups multiple preflights with the same layer into a single layer block', async () => {
		const engine = await createEngine({
			preflights: [
				{ layer: 'base', preflight: { html: { margin: '0' } } },
				{ layer: 'base', preflight: { body: { padding: '0' } } },
			],
		})

		const css = await engine.renderPreflights(false)
		const layerMatches = css.match(/@layer base \{/g)

		expect(layerMatches)
			.toHaveLength(1)
		expect(css)
			.toContain('margin:0;')
		expect(css)
			.toContain('padding:0;')
	})

	it('renders layered atomic styles in formatted mode with line breaks', () => {
		const css = renderAtomicStyles({
			atomicStyles: [
				{ id: 'pk-a', content: { selector: ['@layer components', '%'], property: 'display', value: ['block'] } },
			],
			isFormatted: true,
			defaultSelector: '%',
			layers: { components: 5 },
		})

		expect(css)
			.toContain('@layer components {')
		expect(css)
			.toContain('display: block;')
	})

	it('treats digit-prefixed percent signs in selectors as literal percentages', async () => {
		const engine = await createEngine()

		const ids = await engine.use({ '@supports (width: 50%)': { color: 'red' } })
		const css = await engine.renderAtomicStyles(false, { atomicStyleIds: ids })

		expect(css)
			.toContain('@supports (width: 50%){')
		expect(css)
			.toContain(`.${ids[0]}{color:red;}`)
	})

	it('finalizes deterministic file and directory-membership dependencies after configureEngine', async () => {
		let dependenciesDuringConfigure: unknown
		const engine = await createEngine({
			plugins: [
				defineEnginePlugin({
					name: 'test:config-dependencies',
					configureEngine(configurator) {
						const engine = configurator.runtime
						engine.addConfigDependency('/tmp/z-missing.json')
						engine.addConfigDirectoryMembershipDependency('/tmp/z-icons')
						engine.addConfigDependency('/tmp/a.json')
						engine.addConfigDirectoryMembershipDependency('/tmp/a-icons')
						engine.addConfigDependency('/tmp/a.json')
						dependenciesDuringConfigure = engine.configDependencies
					},
				}),
			],
		})

		const expectedDependencies = [
			{ type: 'file', path: '/tmp/a.json' },
			{ type: 'file', path: '/tmp/z-missing.json' },
			{ type: 'directory-membership', path: '/tmp/a-icons' },
			{ type: 'directory-membership', path: '/tmp/z-icons' },
		]
		expect(dependenciesDuringConfigure)
			.toEqual(expectedDependencies)
		expect(engine.configDependencies)
			.toEqual(expectedDependencies)
		expect(Object.isFrozen(engine.configDependencies))
			.toBe(true)
		expect(engine.configDependencies.every(Object.isFrozen))
			.toBe(true)
		expect(() => engine.addConfigDependency('/tmp/late.json'))
			.toThrow('Engine config dependencies are finalized')
		expect(() => engine.addConfigDirectoryMembershipDependency('/tmp/late-icons'))
			.toThrow('Engine config dependencies are finalized')
	})

	it('uses an injected atomic style ID strategy only for genuinely new allocations', async () => {
		const allocations: number[] = []
		const engine = await createEngine({}, {
			atomicStyleIdStrategy: ({ index, prefix }) => {
				allocations.push(index)
				return `${prefix}custom-${index}`
			},
		})

		expect(await engine.use({ color: 'red' }))
			.toEqual(['pk-custom-0'])
		expect(await engine.use({ color: 'red' }))
			.toEqual(['pk-custom-0'])
		expect(await engine.use({ color: 'blue' }))
			.toEqual(['pk-custom-1'])
		expect(allocations)
			.toEqual([0, 1])
	})

	it('does not expose the legacy variables runtime producer ingress', async () => {
		const engine = await createEngine({
			variables: { definitions: { '--x': { value: 'red' } } },
		})

		expect('variables' in engine)
			.toBe(false)
		expect((engine.pika.getStatic('var') as Record<string, unknown>)['--x'])
			.toBe('var(--x)')
	})

	it('accepts numeric property values and numeric fallback tuples', async () => {
		const engine = await createEngine()

		const marginIds = await engine.use({ margin: 0 })
		const tupleIds = await engine.use({ padding: ['auto', [0]] })

		expect(marginIds)
			.toHaveLength(1)
		expect(await engine.renderAtomicStyles(false, { atomicStyleIds: marginIds }))
			.toContain(`.${marginIds[0]}{margin:0;}`)
		expect(tupleIds)
			.toHaveLength(1)
		expect(await engine.renderAtomicStyles(false, { atomicStyleIds: tupleIds }))
			.toContain(`.${tupleIds[0]}{padding:0;padding:auto;}`)
	})

	it('treats quoted percent signs as literal content and appends the default selector', async () => {
		const engine = await createEngine()

		const ids = await engine.use({ '[data-content="%"]': { color: 'red' } })
		const css = await engine.renderAtomicStyles(false, { atomicStyleIds: ids })

		expect(css)
			.toContain(`[data-content="%"]{.${ids[0]}{color:red;}}`)
	})

	it('substitutes real placeholders while leaving quoted percent signs untouched', async () => {
		const engine = await createEngine()

		const ids = await engine.use({ '[data-content="%"] $': { color: 'red' } })
		const css = await engine.renderAtomicStyles(false, { atomicStyleIds: ids })

		expect(css)
			.toContain(`[data-content="%"] .${ids[0]}{color:red;}`)
	})

	it('normalizes selectors containing CSS-escaped quotes outside quoted segments', async () => {
		const engine = await createEngine()

		const ids = await engine.use({ '.it\\\'s $': { color: 'red' } })
		const css = await engine.renderAtomicStyles(false, { atomicStyleIds: ids })

		expect(css)
			.toContain(`.it\\'s .${ids[0]}{color:red;}`)
	})

	it('memoizes preflight invocations per render pass even when passes overlap', async () => {
		const engine = await createEngine()
		let executions = 0
		const counted: PreflightFn = async () => {
			executions++
			return ''
		}
		engine.addPreflight(counted)
		// Mimics the variables pruning preflight: it awaits, then invokes
		// another preflight through the render-pass context.
		engine.addPreflight(async (engine, isFormatted, ctx) => {
			await new Promise(resolve => setTimeout(resolve, 30))
			await engine.invokePreflight(counted, isFormatted, ctx)
			return ''
		})

		const first = engine.renderPreflights(false)
		await new Promise(resolve => setTimeout(resolve, 10))
		const second = engine.renderPreflights(false)
		await Promise.all([first, second])

		expect(executions)
			.toBe(2)
	})
})

describe('prepareUse / commitUse (#114)', () => {
	it('prepareUse consumes zero committed state: no ids, no store entries, no notifications', async () => {
		let added = 0
		const engine = await createEngine({
			plugins: [
				defineEnginePlugin({
					name: 'test:observer',
					atomicStyleAdded() {
						added += 1
					},
				}),
			],
		})

		const plan = await engine.prepareUse({ color: 'red' }, 'unresolved-ref')

		expect(plan.contents)
			.toHaveLength(1)
		expect(plan.unknown.has('unresolved-ref'))
			.toBe(true)
		expect(engine.store.atomicStyles.size)
			.toBe(0)
		expect(engine.store.atomicStyleIds.size)
			.toBe(0)
		expect(engine.store.atomicStyleIdsByBaseKey.size)
			.toBe(0)
		expect(engine.store.atomicStyleOrder.size)
			.toBe(0)
		expect(added)
			.toBe(0)

		// Committing the plan produces exactly what use() would have.
		const ids = engine.commitUse(plan)
		expect(ids)
			.toEqual(['unresolved-ref', 'pk-a'])
		expect(engine.store.atomicStyles.size)
			.toBe(1)
		expect(added)
			.toBe(1)
	})

	it('discarding an uncommitted plan leaves the engine unchanged and ids unconsumed', async () => {
		const engine = await createEngine()

		// Prepared but never committed: must not consume the next ordinal id.
		await engine.prepareUse({ color: 'red' })
		const ids = await engine.use({ color: 'blue' })

		expect(ids)
			.toEqual(['pk-a'])
		expect(engine.store.atomicStyles.size)
			.toBe(1)
	})

	it('resolves reuse-vs-fresh at commit time, not prepare time', async () => {
		const engine = await createEngine()

		// Both plans prepared before either commit: the second commit must
		// observe the first commit's store state and reuse its id.
		const plan1 = await engine.prepareUse({ color: 'red' })
		const plan2 = await engine.prepareUse({ color: 'red' })
		const ids1 = engine.commitUse(plan1)
		const ids2 = engine.commitUse(plan2)

		expect(ids1)
			.toEqual(ids2)
		expect(engine.store.atomicStyles.size)
			.toBe(1)
	})

	it('keeps order-sensitive reuse semantics across split-phase commits', async () => {
		const engine = await createEngine()
		const ids1 = engine.commitUse(await engine.prepareUse({ paddingBottom: '8px', padding: '32px' }))
		const ids2 = engine.commitUse(await engine.prepareUse({ padding: '32px', paddingBottom: '8px' }))
		const css = await engine.renderAtomicStyles(false)

		expect(ids1[1])
			.toBe(ids2[0])
		expect(css.match(/padding:32px;/g))
			.toHaveLength(1)
	})

	it('a throwing committed notification is diagnosed but never rolls back the commit', async () => {
		const diagnostics: any[] = []
		const engine = await createEngine({
			plugins: [
				defineEnginePlugin({
					name: 'test:explosive-observer',
					atomicStyleAdded() {
						throw new Error('observer boom')
					},
				}),
			],
		}, { onDiagnostic: diagnostic => diagnostics.push(diagnostic) })

		const ids = await engine.use({ color: 'red' })

		expect(ids)
			.toEqual(['pk-a'])
		expect(engine.store.atomicStyles.has('pk-a'))
			.toBe(true)
		expect(diagnostics)
			.toHaveLength(1)
		expect(diagnostics[0].code)
			.toBe('plugin-hook-error')
		expect(diagnostics[0].plugin)
			.toBe('test:explosive-observer')
		expect(diagnostics[0].hook)
			.toBe('atomicStyleAdded')
	})
})

describe('transformStyleContents seam (#114)', () => {
	it('rewrites normalized contents 1→1 before any id exists', async () => {
		const engine = await createEngine({
			plugins: [
				defineEnginePlugin({
					name: 'test:prefix-lowering',
					transformStyleContents(styleContents) {
						return styleContents.map(content => content.property === 'user-select'
							? { ...content, property: '-webkit-user-select' }
							: content)
					},
				}),
			],
		})

		const ids = await engine.use({ userSelect: 'none' })
		const css = await engine.renderAtomicStyles(false)

		expect(ids)
			.toHaveLength(1)
		expect(css)
			.toContain('-webkit-user-select:none;')
		expect(css)
			.not.toContain('.pk-a{user-select:none;}')
	})

	it('expands normalized contents 1→N and recomputes order sensitivity for hook output', async () => {
		const engine = await createEngine({
			plugins: [
				defineEnginePlugin({
					name: 'test:expander',
					transformStyleContents(styleContents) {
						return styleContents.flatMap(content => content.property === 'margin-inline'
							? [
									{ selector: content.selector, property: 'margin', value: content.value },
									{ selector: content.selector, property: 'margin-top', value: ['0px'] },
								]
							: [content])
					},
				}),
			],
		})

		const ids = await engine.use({ marginInline: '4px' })

		expect(ids)
			.toHaveLength(2)
		// `margin-top` overlaps `margin`, so the re-optimization pass after the
		// hook must mark the hook-produced entry as order-sensitive.
		const marginTop = [...engine.store.atomicStyles.values()]
			.find(style => style.content.property === 'margin-top')
		expect(marginTop?.content.orderSensitiveTo)
			.toBeDefined()
		expect(marginTop?.content.orderSensitiveTo!.length)
			.toBeGreaterThan(0)
	})

	it('a rejecting content transform aborts preparation with zero committed state', async () => {
		const engine = await createEngine({
			plugins: [
				defineEnginePlugin({
					name: 'test:rejecting-contents',
					transformStyleContents() {
						throw new Error('contents boom')
					},
				}),
			],
		})

		await expect(engine.prepareUse({ color: 'red' }))
			.rejects.toThrow('contents boom')
		expect(engine.store.atomicStyles.size)
			.toBe(0)
		expect(engine.store.atomicStyleIds.size)
			.toBe(0)
	})
})

describe('caller-owned config immutability (#117)', () => {
	function snapshotOf(value: unknown) {
		return JSON.parse(JSON.stringify(value, (_key, entry) => {
			if (entry instanceof Map)
				return { __map: [...entry.entries()] }
			if (entry instanceof Set)
				return { __set: [...entry.values()] }
			if (entry instanceof RegExp)
				return { __regexp: [entry.source, entry.flags, entry.lastIndex] }
			if (typeof entry === 'function')
				return `__fn:${entry.name}`
			return entry
		}))
	}

	// Sanity only: no built-in core plugin mutates raw config in place, so
	// this pins the no-custom-plugin baseline; the load-bearing #117 coverage
	// is in the configure-hook / reuse / concurrency tests below.
	it('engine startup without custom plugins is a no-op on the caller graph (sanity)', async () => {
		const caller = {
			layers: {},
			variables: { definitions: [{ '--base': 'blue' }] },
			shortcuts: { definitions: [{ name: 'btn', value: { color: 'red' } }] },
		} as any
		const before = snapshotOf(caller)

		await createEngine(caller)

		expect(snapshotOf(caller))
			.toEqual(before)
	})

	it('keeps plugin configure-hook mutations inside the engine-local working copy', async () => {
		const caller = {
			layers: {},
			foo: { options: { enabled: false } },
		} as any
		const before = snapshotOf(caller)
		let observedWorkingLayers: unknown

		await createEngine({
			...caller,
			plugins: [
				defineEnginePlugin({
					name: 'test:mutating-configure',
					configureRawConfig: (config: any) => {
						// The documented mutable configure-hook pattern: it must hit
						// the working copy, never the caller's graph.
						config.layers ??= {}
						config.layers.custom = 5
						config.foo.options.enabled = true
						config.variables ??= {}
						config.variables.definitions = [{ '--injected': 'red' }]
						observedWorkingLayers = config.layers
					},
				}),
			],
		})

		expect(snapshotOf(caller))
			.toEqual(before)
		expect(observedWorkingLayers)
			.toEqual({ custom: 5 })
	})

	it('reusing one caller config across engines starts each engine from the declared config', async () => {
		const plugin = defineEnginePlugin({
			name: 'test:accumulator',
			configureRawConfig: (config: any) => {
				config.layers ??= {}
				// Would accumulate across engines if the working copy leaked back.
				config.layers.count = (config.layers.count ?? 0) + 1
			},
			configureEngine: (configurator) => {
				const engine: any = configurator.runtime
				engine.__count = engine.config.layers.count
			},
		})
		const caller = { layers: {}, plugins: [plugin] } as any

		const a = await createEngine(caller)
		const b = await createEngine(caller)

		expect((a as any).__count)
			.toBe(1)
		expect((b as any).__count)
			.toBe(1)
		expect(caller.layers)
			.toEqual({})
		expect(caller.plugins)
			.toEqual([plugin])
	})

	it('concurrently created engines from one caller config cannot observe each other\'s working copies', async () => {
		const holdA = createDeferred()
		const releaseB = createDeferred()
		const observed: Record<string, unknown> = {}
		let creations = 0

		const plugin = defineEnginePlugin({
			name: 'test:concurrent-mutator',
			configureRawConfig: async (config: any) => {
				creations += 1
				const label = creations === 1 ? 'a' : 'b'
				// Mutates PRE-EXISTING nested caller state: without the entry
				// clone this object is shared between both concurrent creations
				// (the old top-level spread only isolated fresh top-level keys).
				config.layers.marker = label
				if (label === 'a') {
					releaseB.resolve()
					await holdA.promise
				}
				observed[label] = config.layers.marker
			},
		})
		const caller = { layers: {}, plugins: [plugin] } as any

		const creatingA = createEngine(caller)
		await releaseB.promise
		await createEngine(caller)
		holdA.resolve()
		await creatingA

		// A resumed after B fully configured; each saw only its own marker —
		// without per-creation working copies, B's write clobbers A's.
		expect(observed)
			.toEqual({ a: 'a', b: 'b' })
		expect(caller.layers)
			.toEqual({})
	})
})
