import { createEngine } from '@pikacss/core'
import { describe, expect, it } from 'vitest'

import { typography } from './index'
import { proseHrStyle, proseListsStyle, typographyVariables } from './styles'

function variableContribution(engine: Awaited<ReturnType<typeof createEngine>>) {
	return engine.typegen.snapshot.contributions.find(({ id }) => id === 'core:variables')?.declarations ?? ''
}

function shortcutContribution(engine: Awaited<ReturnType<typeof createEngine>>) {
	return engine.typegen.snapshot.contributions.find(({ id }) => id === 'core:shortcuts')?.declarations ?? ''
}

describe('typography plugin', () => {
	it('lowers default variables and prose shortcuts through Core semantic config', async () => {
		const engine = await createEngine({ plugins: [typography()] })

		const definitions = [engine.config.rawConfig.variables?.definitions ?? []].flat()
		const lowered = definitions.at(-1) as Record<string, { value: string }>
		expect(lowered['--pk-prose-color-body'])
			.toEqual({ value: typographyVariables['--pk-prose-color-body'] })

		const shortcutNames = engine.config.rawConfig.shortcuts?.definitions
			.flatMap(definition => 'name' in definition ? [definition.name] : []) ?? []
		expect(shortcutNames)
			.toEqual(expect.arrayContaining([
				'prose-base',
				'prose',
				'prose-sm',
				'prose-lg',
				'prose-xl',
				'prose-2xl',
				'prose-code',
				'prose-tables',
			]))

		expect(variableContribution(engine))
			.toContain('"--pk-prose-color-body"')
		expect(shortcutContribution(engine))
			.toContain('"prose"')

		const ids = await engine.use('prose-sm')
		const css = await engine.renderAtomicStyles(false, { atomicStyleIds: ids })
		expect(css)
			.toContain('font-size:0.875rem')
		expect(css)
			.toContain('color:var(--pk-prose-color-body)')
	})

	it('appends lowered definitions after existing Core variable and shortcut config', async () => {
		const engine = await createEngine({
			plugins: [typography()],
			variables: { definitions: { '--caller': { value: 'blue' } } },
			shortcuts: { definitions: [{ name: 'caller-shortcut', value: { color: 'red' } }] },
		})

		const definitions = [engine.config.rawConfig.variables?.definitions ?? []].flat()
		expect(definitions[0])
			.toEqual({ '--caller': { value: 'blue' } })
		expect((definitions.at(-1) as Record<string, unknown>)['--pk-prose-color-body'])
			.toBeDefined()
		const shortcutNames = engine.config.rawConfig.shortcuts?.definitions.flatMap(definition => 'name' in definition ? [definition.name] : []) ?? []
		expect(shortcutNames[0])
			.toBe('caller-shortcut')
		expect(shortcutNames)
			.toContain('prose')
	})

	it('scopes list-item edge margins to paragraphs so nested-list margins stay intact', () => {
		for (const list of ['ul', 'ol']) {
			expect(proseListsStyle)
				.toHaveProperty([`$ > ${list} > li > p:first-child`])
			expect(proseListsStyle)
				.toHaveProperty([`$ > ${list} > li > p:last-child`])
			expect(proseListsStyle).not.toHaveProperty([`$ > ${list} > li > :first-child`])
			expect(proseListsStyle).not.toHaveProperty([`$ > ${list} > li > :last-child`])
		}
	})

	it('declares an explicit hr border style so resets with `border: 0` do not hide it', () => {
		expect((proseHrStyle as Record<string, unknown>)['$ hr'])
			.toMatchObject({ borderTopStyle: 'solid', borderTopWidth: '1px' })
	})

	it('merges plugin variable overrides before Core Variables finalization', async () => {
		const engine = await createEngine({
			plugins: [typography()],
			typography: { variables: { '--pk-prose-color-body': '#123456' } },
		})
		const definitions = [engine.config.rawConfig.variables?.definitions ?? []].flat()
		const lowered = definitions.at(-1) as Record<string, { value: string }>
		expect(lowered['--pk-prose-color-body'])
			.toEqual({ value: '#123456' })

		await engine.use('prose')
		expect(await engine.renderPreflights(false))
			.toContain('--pk-prose-color-body:#123456;')
	})

	describe('reusable plugin definition isolation', () => {
		it('reuses one plugin instance across engines without leaking overrides', async () => {
			const plugin = typography()
			const engineA = await createEngine({
				plugins: [plugin],
				typography: { variables: { '--pk-prose-color-body': '#123456' } },
			})
			const engineB = await createEngine({ plugins: [plugin] })

			const varsA = [engineA.config.rawConfig.variables?.definitions ?? []].flat()
				.at(-1) as Record<string, { value: string }>
			const varsB = [engineB.config.rawConfig.variables?.definitions ?? []].flat()
				.at(-1) as Record<string, { value: string }>
			expect(varsA['--pk-prose-color-body']?.value)
				.toBe('#123456')
			expect(varsB['--pk-prose-color-body']?.value)
				.toBe('currentColor')
		})

		it('keeps concurrently created engines isolated', async () => {
			const plugin = typography()
			const [engineA, engineB] = await Promise.all([
				createEngine({ plugins: [plugin], typography: { variables: { '--pk-prose-color-body': '#654321' } } }),
				createEngine({ plugins: [plugin] }),
			])
			const varsA = [engineA.config.rawConfig.variables?.definitions ?? []].flat()
				.at(-1) as Record<string, { value: string }>
			const varsB = [engineB.config.rawConfig.variables?.definitions ?? []].flat()
				.at(-1) as Record<string, { value: string }>
			expect(varsA['--pk-prose-color-body']?.value)
				.toBe('#654321')
			expect(varsB['--pk-prose-color-body']?.value)
				.toBe('currentColor')
		})
	})
})
