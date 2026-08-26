import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import process from 'node:process'
import { dirname, join } from 'pathe'

// Windows can transiently lock a rename target (antivirus scanners and
// directory watchers briefly holding a handle), surfacing as EPERM/EACCES/
// EBUSY — observed in CI as "EPERM: operation not permitted, rename ...
// pika.css" killing the whole integration setup. A short bounded backoff
// absorbs those transient locks; any other error (or exhaustion) still throws.
const RETRYABLE_RENAME_CODES = new Set(['EPERM', 'EACCES', 'EBUSY'])
const RENAME_RETRY_DELAYS_MS = [10, 20, 40, 80, 160]

async function renameWithRetry(from: string, to: string, shouldPublish?: () => boolean): Promise<boolean> {
	for (let attempt = 0; ; attempt++) {
		if (shouldPublish?.() === false)
			return false
		try {
			await rename(from, to)
			return true
		}
		catch (error: any) {
			if (attempt >= RENAME_RETRY_DELAYS_MS.length || !RETRYABLE_RENAME_CODES.has(error?.code))
				throw error
			await new Promise(resolve => setTimeout(resolve, RENAME_RETRY_DELAYS_MS[attempt]))
		}
	}
}

/**
 * Atomically replaces a generated file's content, skipping byte-identical
 * writes so watchers never observe a no-op change.
 *
 * @param filepath - Absolute path of the generated file to replace.
 * @param content - The full new file content.
 * @param tempDir - Directory for the intermediate temp file. Must be on the
 * same filesystem as `filepath`, and must NOT be inside a watched run
 * directory (#111: temp churn beside the watched target swallows the
 * target's rename event on Linux).
 * @param shouldPublish - Optional freshness fence evaluated immediately before
 * every rename attempt. Returning false discards the prepared temp file.
 *
 * @remarks
 * Internal shared writer for the runtime CSS and TypeScript codegen outputs
 * (#112). Unique `pid-uuid` temp names keep concurrent invocations from
 * clobbering each other; the temp file is removed on both write and rename
 * failure. Transient Windows rename locks (EPERM/EACCES/EBUSY) are retried
 * with a bounded backoff.
 */
export async function replaceGeneratedFile(
	filepath: string,
	content: string,
	tempDir: string,
	shouldPublish?: () => boolean,
) {
	await mkdir(dirname(filepath), { recursive: true })
		.catch(() => {})
	const current = await readFile(filepath, 'utf-8')
		.catch(() => null)
	if (current === content)
		return

	await mkdir(tempDir, { recursive: true })
		.catch(() => {})
	const tempPath = join(tempDir, `${process.pid}-${randomUUID()}.tmp`)
	try {
		// Both the temp write and the replacement sit inside the cleanup
		// boundary: a failed/partial temp write must not leave the temp file
		// behind any more than a failed rename may.
		await writeFile(tempPath, content)
		const published = await renameWithRetry(tempPath, filepath, shouldPublish)
		if (!published) {
			await unlink(tempPath)
				.catch(() => {})
		}
	}
	catch (error) {
		await unlink(tempPath)
			.catch(() => {})
		throw error
	}
}
