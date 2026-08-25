/* eslint-disable no-template-curly-in-string */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockEncodeSvgForCss = vi.fn((svg: string) => `encoded:${svg}`)
const mockLoadIcon = vi.fn()
const mockQuicklyValidateIconSet = vi.fn()
const mockSearchForIcon = vi.fn()
const mockStringToIcon = vi.fn()
const mockLoadNodeIcon = vi.fn()
const mockFetch = vi.fn()

vi.mock('@iconify/utils', () => ({
	encodeSvgForCss: mockEncodeSvgForCss,
	loadIcon: mockLoadIcon,
	quicklyValidateIconSet: mockQuicklyValidateIconSet,
	searchForIcon: mockSearchForIcon,
	stringToIcon: mockStringToIcon,
}))

vi.mock('@iconify/utils/lib/loader/node-loader', () => ({
	loadNodeIcon: mockLoadNodeIcon,
}))

vi.mock('ofetch', () => ({
	$fetch: mockFetch,
}))

function createEngine() {
	return {
		addConfigDependency: vi.fn(),
	}
}

function createTestContext(plugin: any) {
	return {
		onDiagnostic: vi.fn(),
		state: plugin.createState?.(),
		pika: { extendStatic: () => {} },
		typegen: { add: () => {} },
		host: {},
	}
}

const originalVSCodePid = process.env.VSCODE_PID
const originalESLint = process.env.ESLINT

beforeEach(() => {
	vi.clearAllMocks()
	delete process.env.VSCODE_PID
	delete process.env.ESLINT
})

afterEach(() => {
	if (originalVSCodePid == null)
		delete process.env.VSCODE_PID
	else
		process.env.VSCODE_PID = originalVSCodePid

	if (originalESLint == null)
		delete process.env.ESLINT
	else
		process.env.ESLINT = originalESLint
})

describe('icons plugin', () => {
	it('registers one dynamic shortcut family with concrete autocomplete and resolves custom icons into mask styles', async () => {
		const { icons } = await import('./node')
		const engine = createEngine()
		const plugin = icons()
		const context = createTestContext(plugin)

		mockStringToIcon.mockReturnValue({ prefix: 'mdi', name: 'home' })
		mockLoadIcon.mockImplementation(async (_prefix, _name, options) => {
			const props: Record<string, string> = {}
			await options.customizations.iconCustomizer?.('custom', 'check', props)
			expect(props)
				.toEqual({})
			return '<svg currentColor />'
		})

		const rawConfig: any = {
			icons: { autocomplete: ['mdi:home'] },
		}
		await plugin.configureRawConfig?.(rawConfig, context)
		const definition = rawConfig.shortcuts.definitions.at(-1)
		expect(definition.pattern.test('i-mdi:home'))
			.toBe(true)
		expect(definition.pattern.test('i-mdi:home?mask'))
			.toBe(true)
		expect(definition.inputType)
			.toContain('`i-${string}:${string}`')
		expect(definition.inputType)
			.toContain('`i-${string}:${string}?auto`')
		expect(definition.autocomplete)
			.toEqual(['i-mdi:home'])
		expect(definition.autocomplete).not.toContain('i-')

		await plugin.configureEngine?.({ ...context, runtime: engine } as any)
		const style = await context.state.resolveShortcut(['i-mdi:home', 'mdi:home', 'auto'])
		expect(style)
			.toMatchObject({
				'--svg-icon': 'url("data:image/svg+xml;utf8,encoded:<svg currentColor />")',
				'-webkit-mask': 'var(--svg-icon) no-repeat',
				'background-color': 'currentColor',
			})
	})

	it('publishes icon authoring only through the Core Shortcuts Typegen owner', async () => {
		const { createEngine } = await import('@pikacss/core')
		const { icons } = await import('./node')
		const engine = await createEngine({
			plugins: [icons()],
			icons: {
				prefix: ['i-', 'icon-'],
				autocomplete: ['mdi:home', 'i-lucide:star'],
			},
		})

		const ids = engine.typegen.snapshot.contributions.map(({ id }) => id)
		expect(ids)
			.toContain('core:shortcuts')
		expect(ids)
			.not.toContain('icons')
		const declarations = engine.typegen.snapshot.contributions
			.find(({ id }) => id === 'core:shortcuts')?.declarations ?? ''
		expect(declarations)
			.toContain('"i-mdi:home": string')
		expect(declarations)
			.toContain('"icon-mdi:home": string')
		expect(declarations)
			.toContain('"i-lucide:star": string')
		expect(declarations)
			.toContain('"icon-lucide:star": string')
		expect(declarations)
			.toContain('`i-${string}:${string}?mask`')
		expect(declarations)
			.toContain('`icon-${string}:${string}?auto`')
		expect(declarations.match(/type __PikaDynamicShortcutInput =/g))
			.toHaveLength(1)
	})

	it('falls back to local node icons in bg mode and passes resolved metadata to the processor', async () => {
		const { icons } = await import('./node')
		const engine = createEngine()
		const processor = vi.fn()
		const plugin = icons()
		const context = createTestContext(plugin)

		mockStringToIcon.mockReturnValue({ prefix: 'mdi', name: 'account' })
		mockLoadIcon.mockResolvedValue(null)
		mockLoadNodeIcon.mockResolvedValue('<svg><path /></svg>')

		await plugin.configureRawConfig?.({
			icons: {
				mode: 'bg',
				prefix: ['i-', 'icon-'],
				autocomplete: ['mdi:account'],
				processor,
			},
		} as any, context)
		await plugin.configureEngine?.({ ...context, runtime: engine } as any)

		const shortcutEntry = { value: context.state.resolveShortcut }
		const style = await shortcutEntry.value(['icon-mdi:account', 'mdi:account', 'bg'])

		expect(style)
			.toMatchObject({
				'background': 'var(--svg-icon) no-repeat',
				'background-color': 'transparent',
			})
		expect(processor)
			.toHaveBeenCalledWith(
				expect.objectContaining({
					'background-size': '100% 100%',
				}),
				expect.objectContaining({
					collection: 'mdi',
					name: 'account',
					source: 'local',
					mode: 'bg',
				}),
			)
	})

	it('dedupes prefixes and forwards loader customizations, units, and used props', async () => {
		const { icons } = await import('./node')
		const engine = createEngine()
		const plugin = icons()
		const context = createTestContext(plugin)

		mockStringToIcon.mockReturnValue({ prefix: 'mdi', name: 'gear2Filled' })
		mockLoadIcon.mockImplementation(async (_prefix, _name, options) => {
			expect(options.scale)
				.toBe(2)
			expect(options.cwd)
				.toBe('/workspace')
			expect(options.customizations.additionalProps)
				.toEqual({ role: 'img', stroke: 'currentColor' })

			const props: Record<string, string> = {}
			await options.customizations.iconCustomizer?.('mdi', 'gear2Filled', props)
			expect(props)
				.toEqual({ width: '2rem', height: '2rem' })

			if (options.usedProps)
				options.usedProps.stroke = 'currentColor'

			return '<svg><path /></svg>'
		})

		const rawConfig: any = {
			icons: {
				prefix: ['i-', '', 'icon-', 'i-'],
				scale: 2,
				cwd: '/workspace',
				unit: 'rem',
				extraProperties: { stroke: 'currentColor' },
				customizations: {
					additionalProps: { role: 'img' },
				},
			},
		}
		await plugin.configureRawConfig?.(rawConfig, context)
		const definition = rawConfig.shortcuts.definitions.at(-1)
		expect(definition.autocomplete)
			.toEqual([])
		expect(definition.inputType)
			.toContain('`i-${string}:${string}`')
		expect(definition.inputType)
			.toContain('`icon-${string}:${string}`')
		expect(definition.pattern.test('icon-mdi:gear2Filled?bg'))
			.toBe(true)

		await plugin.configureEngine?.({ ...context, runtime: engine } as any)
		const style = await context.state.resolveShortcut(['icon-mdi:gear2Filled', 'mdi:gear2Filled', 'bg'])
		expect(style)
			.toMatchObject({
				background: 'var(--svg-icon) no-repeat',
				stroke: 'currentColor',
			})
	})

	it('preserves width and height produced by a custom icon customizer and forwards non-default loader options', async () => {
		const { icons } = await import('./node')
		const engine = createEngine()
		const plugin = icons()
		const context = createTestContext(plugin)

		mockStringToIcon.mockReturnValue({ prefix: 'custom', name: 'badge' })
		mockLoadIcon.mockImplementation(async (_prefix, _name, options) => {
			expect(options.autoInstall)
				.toBe(true)
			expect(options.customCollections)
				.toEqual({ custom: { badge: '<svg />' } })
			expect(options.customizations.trimCustomSvg)
				.toBe(false)

			const props: Record<string, string> = { width: '24px', height: '12px' }
			await options.customizations.iconCustomizer?.('custom', 'badge', props)
			expect(props)
				.toEqual({ width: '24px', height: '12px' })

			return '<svg><rect /></svg>'
		})

		await plugin.configureRawConfig?.({
			icons: {
				autoInstall: true,
				collections: { custom: { badge: '<svg />' } } as any,
				unit: 'rem',
				customizations: {
					trimCustomSvg: false,
					async iconCustomizer(_collection: any, _icon: any, props: { width: string, height: string }) {
						props.width = '24px'
						props.height = '12px'
					},
				},
			},
		} as any, context)
		await plugin.configureEngine?.({ ...context, runtime: engine } as any)

		const shortcutEntry = { value: context.state.resolveShortcut }
		const style = await shortcutEntry.value(['i-custom:badge', 'custom:badge', 'bg'])

		expect(style)
			.toMatchObject({
				background: 'var(--svg-icon) no-repeat',
			})
	})

	it('loads icons from the configured CDN when bundled sources are unavailable', async () => {
		const { icons } = await import('./node')
		const engine = createEngine()
		const processor = vi.fn()
		const plugin = icons()
		const context = createTestContext(plugin)

		mockStringToIcon.mockReturnValue({ prefix: 'mdi', name: 'bell' })
		mockLoadIcon.mockResolvedValue(null)
		mockLoadNodeIcon.mockResolvedValue(null)
		mockFetch.mockResolvedValue({ prefix: 'mdi' })
		mockQuicklyValidateIconSet.mockReturnValue({ prefix: 'mdi' })
		mockSearchForIcon.mockResolvedValue('<svg><circle /></svg>')

		await plugin.configureRawConfig?.({
			icons: {
				cdn: 'https://cdn.example.com/{collection}.json',
				processor,
			},
		} as any, context)
		await plugin.configureEngine?.({ ...context, runtime: engine } as any)

		const shortcutEntry = { value: context.state.resolveShortcut }
		const style = await shortcutEntry.value(['i-mdi:bell', 'mdi:bell', 'auto'])

		expect(mockFetch)
			.toHaveBeenCalledWith('https://cdn.example.com/mdi.json')
		expect(style)
			.toMatchObject({
				background: 'var(--svg-icon) no-repeat',
			})
		expect(processor)
			.toHaveBeenCalledWith(
				expect.any(Object),
				expect.objectContaining({
					source: 'cdn',
					mode: 'bg',
				}),
			)
	})

	it('still runs the local node loader under VS Code (VSCODE_PID is ambient, not an editor-tooling signal)', async () => {
		const { icons } = await import('./node')
		const engine = createEngine()

		// A dev/build spawned from a VS Code integrated terminal inherits
		// VSCODE_PID; it must still resolve icons from the local filesystem.
		process.env.VSCODE_PID = '1'
		const plugin = icons()
		const context = createTestContext(plugin)
		mockStringToIcon.mockReturnValue({ prefix: 'vscode-icons', name: 'default-folder' })
		mockLoadIcon.mockResolvedValue(null)
		mockLoadNodeIcon.mockResolvedValue('<svg currentColor></svg>')

		await plugin.configureRawConfig?.({ icons: {} } as any, context)
		await plugin.configureEngine?.({ ...context, runtime: engine } as any)

		const shortcutEntry = { value: context.state.resolveShortcut }
		const style = await shortcutEntry.value(['i-vscode-icons:default-folder', 'vscode-icons:default-folder', 'auto'])

		expect(mockLoadNodeIcon)
			.toHaveBeenCalled()
		expect(mockFetch)
			.not.toHaveBeenCalled()
		expect(style)
			.toMatchObject({
				'-webkit-mask': 'var(--svg-icon) no-repeat',
			})
	})

	it('expands CDN base URLs without placeholders when local sources are unavailable', async () => {
		const { icons } = await import('./node')
		const engine = createEngine()

		const plugin = icons()
		const context = createTestContext(plugin)
		mockStringToIcon.mockReturnValue({ prefix: 'mdi', name: 'bell' })
		mockLoadIcon.mockResolvedValue(null)
		mockLoadNodeIcon.mockResolvedValue(null)
		mockFetch.mockResolvedValue({ prefix: 'mdi' })
		mockQuicklyValidateIconSet.mockReturnValue({ prefix: 'mdi' })
		mockSearchForIcon.mockResolvedValue('<svg currentColor></svg>')

		await plugin.configureRawConfig?.({
			icons: {
				cdn: 'https://cdn.example.com/icons',
			},
		} as any, context)
		await plugin.configureEngine?.({ ...context, runtime: engine } as any)

		const shortcutEntry = { value: context.state.resolveShortcut }
		const style = await shortcutEntry.value(['i-mdi:bell', 'mdi:bell', 'auto'])

		expect(mockFetch)
			.toHaveBeenCalledWith('https://cdn.example.com/icons/mdi.json')
		expect(style)
			.toMatchObject({
				'-webkit-mask': 'var(--svg-icon) no-repeat',
			})
	})

	it('skips the local node loader in ESLint environments and warns when CDN loading fails due to fetch errors', async () => {
		const { icons } = await import('./node')
		const engine = createEngine()

		process.env.ESLINT = '1'
		const plugin = icons()
		const context = createTestContext(plugin)
		mockStringToIcon.mockReturnValue({ prefix: 'mdi', name: 'alert' })
		mockLoadIcon.mockResolvedValue(null)
		mockFetch.mockRejectedValue(new Error('network'))

		await plugin.configureRawConfig?.({
			icons: {
				cdn: 'https://cdn.example.com/icons/',
			},
		} as any, context)
		await plugin.configureEngine?.({ ...context, runtime: engine } as any)

		const shortcutEntry = { value: context.state.resolveShortcut }

		expect(await shortcutEntry.value(['i-mdi:alert', 'mdi:alert', 'auto']))
			.toBeUndefined()
		expect(mockLoadNodeIcon)
			.not.toHaveBeenCalled()
		expect(mockFetch)
			.toHaveBeenCalledWith('https://cdn.example.com/icons/mdi.json')
		expect(context.onDiagnostic)
			.toHaveBeenCalledWith(expect.objectContaining({
				level: 'warning',
				code: 'icons-load-failed',
				message: 'failed to load icon "i-mdi:alert"',
			}))
	})

	it('warns when CDN payloads cannot be validated into an icon set', async () => {
		const { icons } = await import('./node')
		const engine = createEngine()
		const plugin = icons()
		const context = createTestContext(plugin)

		mockStringToIcon.mockReturnValue({ prefix: 'mdi', name: 'alert' })
		mockLoadIcon.mockResolvedValue(null)
		mockLoadNodeIcon.mockResolvedValue(null)
		mockFetch.mockResolvedValue({ prefix: 'mdi' })
		mockQuicklyValidateIconSet.mockReturnValue(null)

		await plugin.configureRawConfig?.({
			icons: {
				cdn: 'https://cdn.example.com/icons',
			},
		} as any, context)
		await plugin.configureEngine?.({ ...context, runtime: engine } as any)

		const shortcutEntry = { value: context.state.resolveShortcut }

		expect(await shortcutEntry.value(['i-mdi:alert', 'mdi:alert', 'auto']))
			.toBeUndefined()
		expect(mockFetch)
			.toHaveBeenCalledWith('https://cdn.example.com/icons/mdi.json')
		expect(context.onDiagnostic)
			.toHaveBeenCalledWith(expect.objectContaining({
				level: 'warning',
				code: 'icons-load-failed',
				message: 'failed to load icon "i-mdi:alert"',
			}))
	})

	it('warns when icon names are invalid or the icon cannot be loaded from any source', async () => {
		const { icons } = await import('./node')
		const engine = createEngine()
		const plugin = icons()
		const context = createTestContext(plugin)

		await plugin.configureRawConfig?.({ icons: {} } as any, context)
		await plugin.configureEngine?.({ ...context, runtime: engine } as any)

		const shortcutEntry = { value: context.state.resolveShortcut }

		mockStringToIcon.mockReturnValueOnce(null)
		expect(await shortcutEntry.value(['i-invalid', 'invalid', 'auto']))
			.toEqual({})

		mockStringToIcon.mockReturnValueOnce({ prefix: 'mdi', name: 'ghost' })
		mockLoadIcon.mockResolvedValueOnce(null)
		mockLoadNodeIcon.mockResolvedValueOnce(null)
		expect(await shortcutEntry.value(['i-mdi:ghost', 'mdi:ghost', 'auto']))
			.toBeUndefined()

		expect(context.onDiagnostic.mock.calls.map(([diagnostic]) => diagnostic))
			.toEqual(expect.arrayContaining([
				expect.objectContaining({
					code: 'icons-invalid-name',
					message: 'invalid icon name "i-invalid"',
				}),
				expect.objectContaining({
					code: 'icons-load-failed',
					message: 'failed to load icon "i-mdi:ghost"',
				}),
			]))
	})

	it('reuses cached CDN collections across multiple icon resolutions and falls back when search returns null', async () => {
		const { icons } = await import('./node')
		const engine = createEngine()
		const plugin = icons()
		const context = createTestContext(plugin)

		mockLoadIcon.mockResolvedValue(null)
		mockLoadNodeIcon.mockResolvedValue(null)
		mockFetch.mockResolvedValue({ prefix: 'mdi' })
		mockQuicklyValidateIconSet.mockReturnValue({ prefix: 'mdi' })

		// First icon resolves, second does not
		mockStringToIcon
			.mockReturnValueOnce({ prefix: 'mdi', name: 'bell' })
			.mockReturnValueOnce({ prefix: 'mdi', name: 'missing' })
		mockSearchForIcon
			.mockResolvedValueOnce('<svg><circle /></svg>')
			.mockResolvedValueOnce(null)

		await plugin.configureRawConfig?.({
			icons: {
				cdn: 'https://cdn.example.com/{collection}.json',
			},
		} as any, context)
		await plugin.configureEngine?.({ ...context, runtime: engine } as any)

		const shortcutEntry = { value: context.state.resolveShortcut }

		// First call: cache miss — fetches from CDN
		const style1 = await shortcutEntry.value(['i-mdi:bell', 'mdi:bell', 'auto'])
		expect(style1)
			.toMatchObject({ background: 'var(--svg-icon) no-repeat' })

		// Second call: cache hit — reuses CDN collection, but icon not found
		const style2 = await shortcutEntry.value(['i-mdi:missing', 'mdi:missing', 'auto'])
		expect(style2)
			.toBeUndefined()

		// CDN was fetched only once (cache hit on second call)
		expect(mockFetch)
			.toHaveBeenCalledTimes(1)
		expect(context.onDiagnostic)
			.toHaveBeenCalledWith(expect.objectContaining({
				level: 'warning',
				code: 'icons-load-failed',
				message: 'failed to load icon "i-mdi:missing"',
			}))
	})

	it('generates distinct CSS variable names for icon ids that sanitize to the same string', async () => {
		const { icons } = await import('./node')
		const engine = createEngine()
		const plugin = icons()
		const context = createTestContext(plugin)

		// Both bodies sanitize to 'mdi-home-alert' when ':' is replaced with '-'
		mockStringToIcon
			.mockReturnValueOnce({ prefix: 'mdi', name: 'home-alert' })
			.mockReturnValueOnce({ prefix: 'mdi-home', name: 'alert' })
		mockLoadIcon
			.mockResolvedValueOnce('<svg><path d="a" /></svg>')
			.mockResolvedValueOnce('<svg><path d="b" /></svg>')

		await plugin.configureRawConfig?.({ icons: {} } as any, context)
		await plugin.configureEngine?.({ ...context, runtime: engine } as any)

		const shortcutEntry = { value: context.state.resolveShortcut }
		const style1 = await shortcutEntry.value(['i-mdi:home-alert', 'mdi:home-alert', 'bg'])
		const style2 = await shortcutEntry.value(['i-mdi-home:alert', 'mdi-home:alert', 'bg'])

		expect(style1['--svg-icon'])
			.not.toBe(style2['--svg-icon'])
	})

	it('matches the longest prefix first when prefixes overlap', async () => {
		const { icons } = await import('./node')
		const engine = createEngine()
		const plugin = icons()
		const context = createTestContext(plugin)

		const rawConfig: any = { icons: { prefix: ['i-', 'i-custom-'] } }
		await plugin.configureRawConfig?.(rawConfig, context)
		const definition = rawConfig.shortcuts.definitions.at(-1)
		expect(definition.pattern.exec('i-custom-mdi:home')?.[1])
			.toBe('mdi:home')
		expect(definition.pattern.exec('i-mdi:home')?.[1])
			.toBe('mdi:home')
		await plugin.configureEngine?.({ ...context, runtime: engine } as any)
	})

	it('retries CDN collection loading after a failed fetch instead of caching the failure', async () => {
		const { icons } = await import('./node')
		const engine = createEngine()
		const plugin = icons()
		const context = createTestContext(plugin)

		mockStringToIcon.mockReturnValue({ prefix: 'mdi', name: 'bell' })
		mockLoadIcon.mockResolvedValue(null)
		mockLoadNodeIcon.mockResolvedValue(null)
		mockFetch
			.mockRejectedValueOnce(new Error('network'))
			.mockResolvedValueOnce({ prefix: 'mdi' })
		mockQuicklyValidateIconSet.mockReturnValue({ prefix: 'mdi' })
		mockSearchForIcon.mockResolvedValue('<svg><circle /></svg>')

		await plugin.configureRawConfig?.({
			icons: {
				cdn: 'https://cdn.example.com/{collection}.json',
			},
		} as any, context)
		await plugin.configureEngine?.({ ...context, runtime: engine } as any)

		const shortcutEntry = { value: context.state.resolveShortcut }

		// First call fails to fetch the collection
		expect(await shortcutEntry.value(['i-mdi:bell', 'mdi:bell', 'auto']))
			.toBeUndefined()
		expect(context.onDiagnostic)
			.toHaveBeenCalledWith(expect.objectContaining({
				level: 'warning',
				code: 'icons-load-failed',
				message: 'failed to load icon "i-mdi:bell"',
			}))

		// Second call retries the fetch and succeeds
		const style = await shortcutEntry.value(['i-mdi:bell', 'mdi:bell', 'auto'])
		expect(style)
			.toMatchObject({
				background: 'var(--svg-icon) no-repeat',
			})
		expect(mockFetch)
			.toHaveBeenCalledTimes(2)
	})

	it('does not cache failed icon loads and produces the icon on a later resolve', async () => {
		const { createEngine } = await import('@pikacss/core')
		const { icons } = await import('./node')
		const diagnostics: { code: string, message: string }[] = []

		mockStringToIcon.mockReturnValue({ prefix: 'custom', name: 'badge' })
		mockLoadIcon
			.mockResolvedValueOnce(null)
			.mockResolvedValue('<svg currentColor />')
		mockLoadNodeIcon.mockResolvedValue(null)

		const engine = await createEngine({
			plugins: [icons()],
			icons: {},
		}, {
			onDiagnostic: diagnostic => diagnostics.push(diagnostic),
		})

		expect(await engine.use('i-custom:badge'))
			.toEqual(['i-custom:badge'])
		expect(diagnostics)
			.toContainEqual(expect.objectContaining({
				code: 'icons-load-failed',
				message: 'failed to load icon "i-custom:badge"',
			}))

		const ids = await engine.use('i-custom:badge')
		expect(ids).not.toContain('i-custom:badge')
		expect(await engine.renderAtomicStyles(false, { atomicStyleIds: ids }))
			.toContain('data:image/svg+xml')
		expect(mockLoadIcon)
			.toHaveBeenCalledTimes(2)
	})

	it('falls back to empty config when icons is not specified in configureRawConfig', async () => {
		const { icons } = await import('./node')
		const engine = createEngine()
		const plugin = icons()
		const context = createTestContext(plugin)

		await plugin.configureRawConfig?.({} as any, context)
		await plugin.configureEngine?.({ ...context, runtime: engine } as any)

		const shortcutEntry = { value: context.state.resolveShortcut }
		expect(shortcutEntry)
			.toBeDefined()
	})
})

describe('plugin definition reuse (#116)', () => {
	it('keeps engine A\'s registered shortcut resolving with A\'s config and engine after B initializes', async () => {
		const { icons } = await import('./node')
		const plugin = icons()
		const contextA = createTestContext(plugin)
		const contextB = createTestContext(plugin)
		const engineA = createEngine()
		const engineB = createEngine()

		mockStringToIcon.mockReturnValue({ prefix: 'mdi', name: 'home' })
		mockLoadIcon.mockResolvedValue('<svg />')

		// A configures mask mode; B (same definition!) omits icons config and
		// gets the defaults. B fully initializes after A.
		await plugin.configureRawConfig?.({ icons: { mode: 'mask' } } as any, contextA)
		await plugin.configureEngine?.({ ...contextA, runtime: engineA } as any)
		await plugin.configureRawConfig?.({ icons: {} } as any, contextB)
		await plugin.configureEngine?.({ ...contextB, runtime: engineB } as any)

		// A's long-lived shortcut callback must still observe A's mode and
		// report through A's engine — not whichever engine configured last.
		const shortcutA = { value: contextA.state.resolveShortcut }
		const styleA = await shortcutA.value(['i-mdi:home', 'mdi:home', undefined])
		expect(styleA)
			.toMatchObject({ '-webkit-mask': 'var(--svg-icon) no-repeat' })

		// B's own callback uses B's defaults (auto mode; svg has no
		// currentColor, so it resolves to bg mode).
		const shortcutB = { value: contextB.state.resolveShortcut }
		const styleB = await shortcutB.value(['i-mdi:home', 'mdi:home', undefined])
		expect(styleB)
			.toMatchObject({ background: 'var(--svg-icon) no-repeat' })
	})

	it('interleaved configuration of two engines does not leak config between them', async () => {
		const { icons } = await import('./node')
		const plugin = icons()
		const contextA = createTestContext(plugin)
		const contextB = createTestContext(plugin)
		const engineA = createEngine()
		const engineB = createEngine()

		mockStringToIcon.mockReturnValue({ prefix: 'mdi', name: 'home' })
		mockLoadIcon.mockResolvedValue('<svg />')

		// A's raw config lands first, then B's whole lifecycle runs before A's
		// configureEngine — the closure-state implementation made A observe
		// B's config here.
		const rawA: any = { icons: { prefix: 'icon-a-' } }
		const rawB: any = { icons: { prefix: 'icon-b-' } }
		await plugin.configureRawConfig?.(rawA, contextA)
		await plugin.configureRawConfig?.(rawB, contextB)
		await plugin.configureEngine?.({ ...contextB, runtime: engineB } as any)
		await plugin.configureEngine?.({ ...contextA, runtime: engineA } as any)

		expect(rawA.shortcuts.definitions.at(-1).inputType)
			.toContain('icon-a-')
		expect(rawA.shortcuts.definitions.at(-1).inputType)
			.not.toContain('icon-b-')
		expect(rawB.shortcuts.definitions.at(-1).inputType)
			.toContain('icon-b-')
		expect(rawB.shortcuts.definitions.at(-1).inputType)
			.not.toContain('icon-a-')
	})

	it('keeps CDN collection caches per engine', async () => {
		const { icons } = await import('./node')
		const plugin = icons()
		const contextA = createTestContext(plugin)
		const contextB = createTestContext(plugin)
		const engineA = createEngine()
		const engineB = createEngine()

		mockStringToIcon.mockReturnValue({ prefix: 'mdi', name: 'home' })
		mockLoadIcon.mockResolvedValue(undefined)
		mockLoadNodeIcon.mockResolvedValue(undefined)
		mockQuicklyValidateIconSet.mockImplementation((set: any) => set)
		mockSearchForIcon.mockResolvedValue('<svg />')
		mockFetch.mockResolvedValue({ prefix: 'mdi', icons: {} })

		await plugin.configureRawConfig?.({ icons: { cdn: 'https://cdn-a.test/' } } as any, contextA)
		await plugin.configureEngine?.({ ...contextA, runtime: engineA } as any)
		await plugin.configureRawConfig?.({ icons: { cdn: 'https://cdn-b.test/' } } as any, contextB)
		await plugin.configureEngine?.({ ...contextB, runtime: engineB } as any)

		await contextA.state.resolveShortcut(['i-mdi:home', 'mdi:home', undefined])
		await contextB.state.resolveShortcut(['i-mdi:home', 'mdi:home', undefined])

		// One fetch per engine: B must not be served A's cached collection,
		// because the cache lives in per-engine state keyed by that engine's
		// own CDN endpoint.
		const fetchedUrls = mockFetch.mock.calls.map(call => call[0] as string)
		expect(fetchedUrls.some(url => url.startsWith('https://cdn-a.test')))
			.toBe(true)
		expect(fetchedUrls.some(url => url.startsWith('https://cdn-b.test')))
			.toBe(true)
	})
})
