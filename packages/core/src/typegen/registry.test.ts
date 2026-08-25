import { describe, expect, it } from 'vitest'

import { createEngine } from '../engine'
import { defineEnginePlugin } from '../plugin'

describe('context-bound Pika and Typegen initialization registries', () => {
	it('keeps owner capabilities valid across awaited configureEngine continuations and finalizes read-side managers', async () => {
		const implementation = { nested: { value: 'btn' } }
		const plugin = defineEnginePlugin({
			name: 'test:registries',
			async configureEngine(_engine, context) {
				await Promise.resolve()
				context.pika.extendStatic('sc', implementation)
				context.typegen.add({
					id: 'shortcuts',
					declarations: 'type __Shortcuts = { btn: string }\n',
					pika: { sc: '__Shortcuts' },
					selectors: '__Selectors',
					properties: '__Properties',
					cssProperties: '__CssProperties',
					cssPropertyValues: '__CssPropertyValues',
					propertyConstraints: '__Constraints',
				})
			},
		})

		const engine = await createEngine({ plugins: [plugin] })

		expect(engine.pika.getStatic('sc'))
			.toBe(implementation)
		expect((engine.pika as any).extendStatic)
			.toBeUndefined()
		expect((engine.typegen as any).add)
			.toBeUndefined()
		expect(Object.isFrozen(engine.pika))
			.toBe(true)
		expect(Object.isFrozen(engine.typegen))
			.toBe(true)
		expect(engine.typegen.snapshot)
			.toEqual({
				contributions: [{
					id: 'shortcuts',
					declarations: 'type __Shortcuts = { btn: string }\n',
					pika: { sc: '__Shortcuts' },
					selectors: '__Selectors',
					properties: '__Properties',
					cssProperties: '__CssProperties',
					cssPropertyValues: '__CssPropertyValues',
					propertyConstraints: '__Constraints',
				}],
			})
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
				configureEngine(_engine, context) {
					context.typegen.add(contribution)
					pika.tk = '__Mutated'
					contribution.declarations = 'mutated'
				},
			})],
		})

		expect(engine.typegen.snapshot.contributions)
			.toEqual([{
				id: 'tokens',
				declarations: '/* exact */\ntype __Tokens = { primary: string }',
				pika: { tk: '__Tokens' },
			}])
	})

	it('rejects capability use before configureEngine and after its hook completes', async () => {
		await expect(createEngine({
			plugins: [defineEnginePlugin({
				name: 'test:too-early',
				configureResolvedConfig(config, context) {
					context.typegen.add({ id: 'early' })
					return config
				},
			})],
		})).rejects.toThrow('configureEngine hook')

		let latePika!: () => void
		let lateTypegen!: () => void
		await createEngine({
			plugins: [defineEnginePlugin({
				name: 'test:late-registration',
				configureEngine(_engine, context) {
					latePika = () => context.pika.extendStatic('late', {})
					lateTypegen = () => context.typegen.add({ id: 'late' })
				},
			})],
		})

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
			configureEngine(_engine, context) {
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
			async configureEngine(_engine, context) {
				context.typegen.add({ id: 'b-types', pika: { late: '__B' } })
				await lateDone
			},
		})

		const engine = await createEngine({ plugins: [a, b] })
		expect(lateTypegenOutcome)
			.toBe('rejected')
		expect(latePikaOutcome)
			.toBe('rejected')
		expect(engine.typegen.snapshot)
			.toEqual({ contributions: [{ id: 'b-types', pika: { late: '__B' } }] })
	})

	it('rejects duplicate runtime roots from the same or different owners', async () => {
		await expect(createEngine({
			plugins: [defineEnginePlugin({
				name: 'same-owner',
				configureEngine(_engine, context) {
					context.pika.extendStatic('sc', {})
					context.pika.extendStatic('sc', {})
				},
			})],
		})).rejects.toThrow('Pika static extension root "sc" is already registered')

		await expect(createEngine({
			plugins: [
				defineEnginePlugin({ name: 'a', configureEngine: (_engine, context) => context.pika.extendStatic('sc', {}) }),
				defineEnginePlugin({ name: 'b', configureEngine: (_engine, context) => context.pika.extendStatic('sc', {}) }),
			],
		})).rejects.toThrow('Pika static extension root "sc" is already registered')
	})

	it('rejects empty and duplicate Typegen contribution ids and duplicate Pika roots', async () => {
		await expect(createEngine({
			plugins: [defineEnginePlugin({
				name: 'empty',
				configureEngine: (_engine, context) => context.typegen.add({ id: '' }),
			})],
		})).rejects.toThrow('Typegen contribution id must be a non-empty string')

		await expect(createEngine({
			plugins: [defineEnginePlugin({
				name: 'duplicate',
				configureEngine(_engine, context) {
					context.typegen.add({ id: 'same' })
					context.typegen.add({ id: 'same' })
				},
			})],
		})).rejects.toThrow('Typegen contribution id "same" is already registered')

		await expect(createEngine({
			plugins: [defineEnginePlugin({
				name: 'duplicate-root',
				configureEngine(_engine, context) {
					context.typegen.add({ id: 'a', pika: { sc: 'A' } })
					context.typegen.add({ id: 'b', pika: { sc: 'B' } })
				},
			})],
		})).rejects.toThrow('Typegen Pika root "sc" is already registered')
	})

	it('allows runtime-only and Typegen-only roots and same-owner dual claims', async () => {
		const owner = defineEnginePlugin({
			name: 'same-owner',
			configureEngine(_engine, context) {
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
				defineEnginePlugin({ name: 'runtime-owner', configureEngine: (_engine, context) => context.pika.extendStatic('sc', {}) }),
				defineEnginePlugin({ name: 'type-owner', configureEngine: (_engine, context) => context.typegen.add({ id: 'sc-types', pika: { sc: '__Sc' } }) }),
			],
		})).rejects.toThrow('Pika root "sc" has different runtime and Typegen owners')
	})

	it('uses exact plugin definition identity rather than plugin.name for shared-root ownership', async () => {
		const runtimeOwner = defineEnginePlugin({
			name: 'same-diagnostic-name',
			configureEngine(_engine, context) {
				context.pika.extendStatic('identity', {})
			},
		})
		const typegenOwner = defineEnginePlugin({
			name: 'same-diagnostic-name',
			configureEngine(_engine, context) {
				context.typegen.add({ id: 'identity-types', pika: { identity: '__Identity' } })
			},
		})

		await expect(createEngine({ plugins: [runtimeOwner, typegenOwner] }))
			.rejects.toThrow('Pika root "identity" has different runtime and Typegen owners')
	})
})
