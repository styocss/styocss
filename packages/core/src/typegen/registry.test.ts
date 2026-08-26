import { describe, expect, it } from 'vitest'

import { createEngine } from '../engine'
import { runCoreEngineFinalizers } from '../finalization'
import { defineEnginePlugin } from '../plugin'
import { createTypegenManager, createTypegenRegistrationController, finalizeTypegenManager, renderTypegenContributionDeclarations, setCoreGeneratedTypegenContribution } from './registry'

function customContributions(engine: Awaited<ReturnType<typeof createEngine>>) {
	return engine.typegen.snapshot.contributions.filter(({ id }) => !id.startsWith('core:'))
}

describe('engineConfigurator-bound Pika and Typegen initialization registries', () => {
	it('keeps owner capabilities valid across awaited configureEngine continuations and finalizes read-side managers', async () => {
		const implementation = { nested: { value: 'btn' } }
		const plugin = defineEnginePlugin({
			name: 'test:registries',
			async configureEngine(context) {
				await Promise.resolve()
				context.pika.extendStatic('demo', implementation)
				context.typegen.add({
					id: 'shortcuts',
					declarations: 'type __Shortcuts = { btn: string }\n',
					pika: { demo: '__Demo' },
					selectors: '__Selectors',
					properties: '__Properties',
					cssProperties: '__CssProperties',
					cssPropertyValues: '__CssPropertyValues',
					propertyConstraints: '__Constraints',
				})
			},
		})

		const engine = await createEngine({ plugins: [plugin] })

		expect(engine.pika.getStatic('demo'))
			.toBe(implementation)
		expect((engine.pika as any).extendStatic)
			.toBeUndefined()
		expect((engine.typegen as any).add)
			.toBeUndefined()
		expect(Object.isFrozen(engine.pika))
			.toBe(true)
		expect(Object.isFrozen(engine.typegen))
			.toBe(true)
		expect(customContributions(engine))
			.toEqual([{
				id: 'shortcuts',
				declarations: 'type __Shortcuts = { btn: string }\n',
				pika: { demo: '__Demo' },
				selectors: '__Selectors',
				properties: '__Properties',
				cssProperties: '__CssProperties',
				cssPropertyValues: '__CssPropertyValues',
				propertyConstraints: '__Constraints',
			}])
		expect(Object.isFrozen(engine.typegen.snapshot))
			.toBe(true)
		expect(Object.isFrozen(engine.typegen.snapshot.contributions))
			.toBe(true)
		expect(Object.isFrozen(engine.typegen.snapshot.contributions[0]))
			.toBe(true)
		expect(Object.isFrozen(engine.typegen.snapshot.contributions[0]!.pika))
			.toBe(true)
	})

	it('snapshots contribution data at registration without parsing or retaining later object mutation', async () => {
		const pika = { tk: '__Tokens' }
		const contribution = {
			id: 'tokens',
			declarations: '/* exact */\ntype __Tokens = { primary: string }',
			pika,
		}
		const engine = await createEngine({
			plugins: [defineEnginePlugin({
				name: 'test:snapshot-copy',
				configureEngine(context) {
					context.typegen.add(contribution)
					pika.tk = '__Mutated'
					contribution.declarations = 'mutated'
				},
			})],
		})

		expect(customContributions(engine))
			.toEqual([{
				id: 'tokens',
				declarations: '/* exact */\ntype __Tokens = { primary: string }',
				pika: { tk: '__Tokens' },
			}])
	})

	it('exposes registration capabilities only through EngineConfigurator and closes them after its hook completes', async () => {
		let ordinaryHookContext: unknown
		let latePika!: () => void
		let lateTypegen!: () => void
		await createEngine({
			plugins: [defineEnginePlugin({
				name: 'test:late-registration',
				configureResolvedConfig(config, context) {
					ordinaryHookContext = context
					return config
				},
				configureEngine(context) {
					latePika = () => context.pika.extendStatic('late', {})
					lateTypegen = () => context.typegen.add({ id: 'late' })
				},
			})],
		})

		expect((ordinaryHookContext as any).pika)
			.toBeUndefined()
		expect((ordinaryHookContext as any).typegen)
			.toBeUndefined()
		expect(latePika)
			.toThrow()
		expect(lateTypegen)
			.toThrow()
	})

	it('rejects a prior plugin fire-and-forget registration while a later plugin is awaiting', async () => {
		let resolveLate!: () => void
		const lateDone = new Promise<void>((resolve) => {
			resolveLate = resolve
		})
		let lateTypegenOutcome = 'pending'
		let latePikaOutcome = 'pending'
		const a = defineEnginePlugin({
			name: 'a',
			configureEngine(context) {
				setTimeout(() => {
					try {
						context.typegen.add({ id: 'a-late', pika: { late: '__A' } })
						lateTypegenOutcome = 'registered'
					}
					catch {
						lateTypegenOutcome = 'rejected'
					}
					try {
						context.pika.extendStatic('latePika', {})
						latePikaOutcome = 'registered'
					}
					catch {
						latePikaOutcome = 'rejected'
					}
					resolveLate()
				}, 0)
			},
		})
		const b = defineEnginePlugin({
			name: 'b',
			async configureEngine(context) {
				context.typegen.add({ id: 'b-types', pika: { late: '__B' } })
				await lateDone
			},
		})

		const engine = await createEngine({ plugins: [a, b] })
		expect(lateTypegenOutcome)
			.toBe('rejected')
		expect(latePikaOutcome)
			.toBe('rejected')
		expect(customContributions(engine))
			.toEqual([{ id: 'b-types', pika: { late: '__B' } }])
	})

	it('rejects duplicate runtime roots from the same or different owners', async () => {
		await expect(createEngine({
			plugins: [defineEnginePlugin({
				name: 'same-owner',
				configureEngine(context) {
					context.pika.extendStatic('dupe', {})
					context.pika.extendStatic('dupe', {})
				},
			})],
		})).rejects.toThrow('Pika static extension root "dupe" is already registered')

		await expect(createEngine({
			plugins: [
				defineEnginePlugin({ name: 'a', configureEngine: context => context.pika.extendStatic('dupe2', {}) }),
				defineEnginePlugin({ name: 'b', configureEngine: context => context.pika.extendStatic('dupe2', {}) }),
			],
		})).rejects.toThrow('Pika static extension root "dupe2" is already registered')
	})

	it('rejects empty and duplicate Typegen contribution ids and duplicate Pika roots', async () => {
		await expect(createEngine({
			plugins: [defineEnginePlugin({
				name: 'empty',
				configureEngine: context => context.typegen.add({ id: '' }),
			})],
		})).rejects.toThrow('Typegen contribution id must be a non-empty string')

		await expect(createEngine({
			plugins: [defineEnginePlugin({
				name: 'duplicate',
				configureEngine(context) {
					context.typegen.add({ id: 'same' })
					context.typegen.add({ id: 'same' })
				},
			})],
		})).rejects.toThrow('Typegen contribution id "same" is already registered')

		await expect(createEngine({
			plugins: [defineEnginePlugin({
				name: 'duplicate-root',
				configureEngine(context) {
					context.typegen.add({ id: 'a', pika: { duplicate: 'A' } })
					context.typegen.add({ id: 'b', pika: { duplicate: 'B' } })
				},
			})],
		})).rejects.toThrow('Typegen Pika root "duplicate" is already registered')
	})

	it('allows runtime-only and Typegen-only roots and same-owner dual claims', async () => {
		const owner = defineEnginePlugin({
			name: 'same-owner',
			configureEngine(context) {
				context.pika.extendStatic('shared', {})
				context.pika.extendStatic('runtimeOnly', {})
				context.typegen.add({ id: 'shared', pika: { shared: '__Shared' } })
				context.typegen.add({ id: 'typegen-only', pika: { typegenOnly: '__Only' } })
			},
		})

		await expect(createEngine({ plugins: [owner] })).resolves.toBeDefined()
	})

	it('rejects runtime and Typegen claims for one root from different plugin definitions', async () => {
		await expect(createEngine({
			plugins: [
				defineEnginePlugin({ name: 'runtime-owner', configureEngine: context => context.pika.extendStatic('mismatch', {}) }),
				defineEnginePlugin({ name: 'type-owner', configureEngine: context => context.typegen.add({ id: 'mismatch-types', pika: { mismatch: '__Mismatch' } }) }),
			],
		})).rejects.toThrow('Pika root "mismatch" has different runtime and Typegen owners')
	})

	it('uses exact plugin definition identity rather than plugin.name for shared-root ownership', async () => {
		const runtimeOwner = defineEnginePlugin({
			name: 'same-diagnostic-name',
			configureEngine(context) {
				context.pika.extendStatic('identity', {})
			},
		})
		const typegenOwner = defineEnginePlugin({
			name: 'same-diagnostic-name',
			configureEngine(context) {
				context.typegen.add({ id: 'identity-types', pika: { identity: '__Identity' } })
			},
		})

		await expect(createEngine({ plugins: [runtimeOwner, typegenOwner] }))
			.rejects.toThrow('Pika root "identity" has different runtime and Typegen owners')
	})

	it('rejects empty managed attachment refs while preserving opaque non-empty TypeScript exactly', async () => {
		for (const key of ['selectors', 'properties', 'cssProperties', 'cssPropertyValues', 'propertyConstraints'] as const) {
			await expect(createEngine({
				plugins: [defineEnginePlugin({
					name: `empty-${key}`,
					configureEngine(context) {
						context.typegen.add({ id: key, [key]: '   ' })
					},
				})],
			})).rejects.toThrow(`managed attachment "${key}" must be a non-empty string`)
		}

		await expect(createEngine({
			plugins: [defineEnginePlugin({
				name: 'invalid-declarations',
				configureEngine(context) {
					context.typegen.add({ id: 'invalid-declarations', declarations: 42 } as any)
				},
			})],
		})).rejects.toThrow('Typegen declarations must be a string')

		await expect(createEngine({
			plugins: [defineEnginePlugin({
				name: 'invalid-pika',
				configureEngine(context) {
					context.typegen.add({ id: 'invalid-pika', pika: [] } as any)
				},
			})],
		})).rejects.toThrow('Typegen Pika attachment must be an object')

		await expect(createEngine({
			plugins: [defineEnginePlugin({
				name: 'empty-pika-ref',
				configureEngine(context) {
					context.typegen.add({ id: 'pika-ref', pika: { badref: '  ' } })
				},
			})],
		})).rejects.toThrow('Typegen Pika root "badref" must reference a non-empty TypeScript expression')

		const exact = '  __Opaque<Type>  '
		const engine = await createEngine({
			plugins: [defineEnginePlugin({
				name: 'opaque-ref',
				configureEngine(context) {
					context.typegen.add({ id: 'opaque', selectors: exact, pika: { z: exact } })
				},
			})],
		})
		const opaque = customContributions(engine)
			.find(({ id }) => id === 'opaque')
		expect(opaque?.selectors)
			.toBe(exact)
		expect(opaque?.pika?.z)
			.toBe(exact)
	})

	it('sorts finalized contributions by stable id regardless of registration order', async () => {
		const create = (reverse: boolean) => createEngine({
			plugins: [defineEnginePlugin({
				name: reverse ? 'reverse' : 'forward',
				configureEngine(context) {
					const contributions = [
						{ id: 'zeta', declarations: 'type Z = string', properties: 'Z', pika: reverse ? { alpha: 'A', zed: 'Z' } : { zed: 'Z', alpha: 'A' } },
						{ id: 'alpha', declarations: 'type A = string', properties: 'A' },
					]
					for (const contribution of reverse ? [...contributions].reverse() : contributions)
						context.typegen.add(contribution)
				},
			})],
		})

		const [forward, reverse] = await Promise.all([create(false), create(true)])
		expect(customContributions(forward)
			.map(({ id }) => id))
			.toEqual(['alpha', 'zeta'])
		expect(customContributions(reverse))
			.toEqual(customContributions(forward))
	})

	it('does not inject Engine host paths into equivalent semantic snapshots', async () => {
		const plugin = defineEnginePlugin({
			name: 'host-independent-typegen',
			configureEngine(context) {
				context.typegen.add({ id: 'stable', declarations: 'type Stable = string', properties: 'Stable' })
			},
		})
		const [a, b] = await Promise.all([
			createEngine({ plugins: [plugin] }, { host: { projectRoot: '/host/a' } }),
			createEngine({ plugins: [plugin] }, { host: { projectRoot: '/host/b' } }),
		])

		expect(a.typegen.snapshot)
			.toEqual(b.typegen.snapshot)
		expect(JSON.stringify(a.typegen.snapshot))
			.not.toContain('/host/')
	})
})

describe('core-generated Typegen finalization seam', () => {
	it('validates Core preview assets, dedupes identical ids, and rejects conflicting content', () => {
		const manager = createTypegenManager()
		const owner = {}
		const controller = createTypegenRegistrationController(manager, owner)
		controller.open()
		controller.capability.add({ id: 'core:test', declarations: 'type Before = 1' })
		controller.close()

		expect(() => setCoreGeneratedTypegenContribution(manager, 'missing', {
			declarations: 'x',
			renderDeclarations: () => 'x',
		}))
			.toThrow('is not registered')
		for (const asset of [
			null,
			{ id: '', content: 'x', mediaType: 'image/svg+xml' },
			{ id: 'a', content: 1, mediaType: 'image/svg+xml' },
			{ id: 'a', content: 'x', mediaType: '' },
		] as any[]) {
			expect(() => setCoreGeneratedTypegenContribution(manager, 'core:test', {
				declarations: 'type After = 2',
				renderDeclarations: () => 'type After = 2',
				previewAssets: [asset],
			}))
				.toThrow()
		}

		const asset = { id: 'asset', content: '<svg/>', mediaType: 'image/svg+xml' }
		setCoreGeneratedTypegenContribution(manager, 'core:test', {
			declarations: 'type After = 2',
			renderDeclarations: bindings => bindings.resolvePreviewImageHref?.('asset') ?? 'type After = 2',
			previewAssets: [asset, { ...asset }],
		})
		expect(() => setCoreGeneratedTypegenContribution(manager, 'core:test', {
			declarations: 'type After = 2',
			renderDeclarations: () => 'type After = 2',
			previewAssets: [{ ...asset, content: '<svg>different</svg>' }],
		}))
			.toThrow('already registered with different content')

		finalizeTypegenManager(manager)
		expect(manager.snapshot.previewAssets)
			.toEqual([asset])
		const contribution = manager.snapshot.contributions[0]!
		expect(renderTypegenContributionDeclarations(manager.snapshot, contribution, {
			resolvePreviewImageHref: () => 'file:///asset.svg',
		}))
			.toBe('file:///asset.svg')
		expect(() => setCoreGeneratedTypegenContribution(manager, 'core:test', {
			declarations: 'late',
			renderDeclarations: () => 'late',
		}))
			.toThrow('finalized')
	})

	it('falls back to raw declarations for snapshots without a Core render override', async () => {
		const engine = await createEngine({
			plugins: [defineEnginePlugin({
				name: 'raw-only',
				configureEngine(configurator) {
					configurator.typegen.add({ id: 'raw-only', declarations: 'type RawOnly = true' })
				},
			})],
		})
		const contribution = engine.typegen.snapshot.contributions.find(({ id }) => id === 'raw-only')!
		expect(renderTypegenContributionDeclarations(engine.typegen.snapshot, contribution, {}))
			.toBe('type RawOnly = true')
	})

	it('treats an empty Core finalizer queue as a no-op', async () => {
		await expect(runCoreEngineFinalizers({})).resolves.toBeUndefined()
	})
})
