/**
 * The generated-file writer must absorb Windows' transient rename locks
 * (antivirus/watcher handles surfacing as EPERM/EACCES/EBUSY) with a bounded
 * backoff instead of failing the whole setup, while still failing fast on
 * real errors. Observed in CI: "EPERM: operation not permitted, rename ...
 * pika.css" killing the integration context on windows-latest.
 */
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'pathe'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { realFs, renameMock } = vi.hoisted(() => ({
	realFs: { rename: undefined as any },
	renameMock: vi.fn(),
}))

vi.mock('node:fs/promises', async (importOriginal) => {
	const actual = await importOriginal<typeof import('node:fs/promises')>()
	realFs.rename = actual.rename
	return {
		...actual,
		rename: renameMock,
	}
})

const { replaceGeneratedFile } = await import('./generatedFileWriter')

function transientError(code: string) {
	const error = new Error(`${code}: operation not permitted, rename`) as NodeJS.ErrnoException
	error.code = code
	return error
}

const createdDirs: string[] = []

async function createTempDir() {
	const dir = await mkdtemp(join(tmpdir(), 'pikacss-writer-'))
	createdDirs.push(dir)
	return dir
}

beforeEach(() => {
	renameMock.mockReset()
	renameMock.mockImplementation((...args: [string, string]) => realFs.rename(...args))
})

afterEach(async () => {
	while (createdDirs.length > 0)
		await rm(createdDirs.pop()!, { recursive: true, force: true })
})

describe('replaceGeneratedFile rename retry', () => {
	it('retries transient EPERM rename failures and completes the replacement', async () => {
		const dir = await createTempDir()
		const target = join(dir, 'out', 'pika.css')
		const tempDir = join(dir, 'tmp')

		let failures = 0
		renameMock.mockImplementation((from: string, to: string) => {
			if (failures < 2) {
				failures += 1
				throw transientError('EPERM')
			}
			return realFs.rename(from, to)
		})

		await replaceGeneratedFile(target, '.pk-a{color:red;}', tempDir)

		expect(renameMock)
			.toHaveBeenCalledTimes(3)
		expect(await readFile(target, 'utf-8'))
			.toBe('.pk-a{color:red;}')
		// The temp file was consumed by the successful rename, not leaked.
		expect(await readdir(tempDir))
			.toEqual([])
	})

	it('gives up after the bounded retries and cleans up the temp file', async () => {
		const dir = await createTempDir()
		const target = join(dir, 'out', 'pika.css')
		const tempDir = join(dir, 'tmp')

		renameMock.mockImplementation(() => {
			throw transientError('EBUSY')
		})

		await expect(replaceGeneratedFile(target, '.pk-a{color:red;}', tempDir))
			.rejects.toThrow('EBUSY')
		// Bounded: initial attempt + one per backoff step, never unbounded.
		expect(renameMock.mock.calls.length)
			.toBe(6)
		expect(await readdir(tempDir))
			.toEqual([])
	})

	it('fails fast on non-retryable rename errors', async () => {
		const dir = await createTempDir()
		const target = join(dir, 'out', 'pika.css')
		const tempDir = join(dir, 'tmp')

		renameMock.mockImplementation(() => {
			throw transientError('ENOSPC')
		})

		await expect(replaceGeneratedFile(target, '.pk-a{color:red;}', tempDir))
			.rejects.toThrow('ENOSPC')
		expect(renameMock)
			.toHaveBeenCalledTimes(1)
		expect(await readdir(tempDir))
			.toEqual([])
	})
})
