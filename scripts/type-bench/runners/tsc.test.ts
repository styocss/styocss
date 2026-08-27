import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { runTscDiagnostics } from './tsc'

const created: string[] = []

async function fixture(source: string): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), 'pikacss-type-bench-tsc-'))
	created.push(root)
	await writeFile(join(root, 'tsconfig.json'), JSON.stringify({
		compilerOptions: {
			strict: true,
			noEmit: true,
			target: 'ESNext',
		},
		include: ['main.ts'],
	}))
	await writeFile(join(root, 'main.ts'), source)
	return root
}

afterEach(async () => {
	await Promise.all(created.splice(0)
		.map(root => rm(root, { recursive: true, force: true })))
})

describe('type-bench tsc runner', () => {
	it('returns diagnostics only for a type-valid fixture', async () => {
		const root = await fixture('const value: string = \'ok\'\n')
		const result = await runTscDiagnostics({ fixtureDir: root, runs: 1 })
		expect(result.types)
			.toBeGreaterThan(0)
		expect(result.instantiations)
			.toBeGreaterThanOrEqual(0)
	})

	it('rejects a fixture with TypeScript errors instead of benchmarking it', async () => {
		const root = await fixture('const value: string = 123\n')
		await expect(runTscDiagnostics({ fixtureDir: root, runs: 1 }))
			.rejects.toThrow(/Type-bench fixture failed TypeScript validation/)
	})
})
