import type { FileSystemTree } from '@webcontainer/api'

// IndexedDB-backed cache for WebContainer dependency snapshots — the gzip of a
// `webcontainer.export('.', { format: 'binary' })`. Because the snapshot is
// WebContainer's *own* filesystem (its WASM-swapped rollup/esbuild etc.), it can
// be re-mounted into a fresh container and works, unlike a host-built install.
//
// The cache is keyed by template + snapshot format + a signature of its
// package.json. The format component invalidates historical snapshots that may
// contain generated `.pikacss` state; package changes still invalidate naturally.

const DB_NAME = 'pikacss-playground'
const STORE = 'snapshots'
const SNAPSHOT_FORMAT_VERSION = 'v2'

function openDb(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const req = indexedDB.open(DB_NAME, 1)
		req.onupgradeneeded = () => req.result.createObjectStore(STORE)
		req.onsuccess = () => resolve(req.result)
		req.onerror = () => reject(req.error)
	})
}

function packageJsonOf(files: FileSystemTree): string {
	const node = files['package.json']
	return node != null && 'file' in node && 'contents' in node.file && typeof node.file.contents === 'string'
		? node.file.contents
		: ''
}

/** Short stable signature of the template's dependency set. */
async function signature(files: FileSystemTree): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder()
		.encode(packageJsonOf(files)))
	return Array.from(new Uint8Array(digest))
		.slice(0, 8)
		.map(b => b.toString(16)
			.padStart(2, '0'))
		.join('')
}

/**
 * Fetches the CI-generated static baseline snapshot for a template (emitted to
 * `snapshots/<template>.bin` by `scripts/gen-snapshots.mjs`), or null if absent.
 * Lets the *first* visit skip install too, not just repeat visits.
 */
export async function fetchStaticSnapshot(baseUrl: string, template: string): Promise<Uint8Array | null> {
	try {
		const response = await fetch(`${baseUrl}snapshots/${template}.bin`)
		if (!response.ok)
			return null
		const bytes = new Uint8Array(await response.arrayBuffer())
		// The SPA dev/preview server answers unknown paths with index.html; only
		// accept a real gzip payload.
		return bytes[0] === 0x1F && bytes[1] === 0x8B ? bytes : null
	}
	catch {
		return null
	}
}

/** Chunked base64 for large buffers (avoids a call-stack overflow on spread). */
export function bytesToBase64(bytes: Uint8Array): string {
	let binary = ''
	const chunk = 0x8000
	for (let i = 0; i < bytes.length; i += chunk)
		binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
	return btoa(binary)
}

/** Returns the cached gzip snapshot for this template's current deps, or null. */
export async function getCachedSnapshot(template: string, files: FileSystemTree): Promise<Uint8Array | null> {
	try {
		const key = `${template}@${SNAPSHOT_FORMAT_VERSION}@${await signature(files)}`
		const db = await openDb()
		return await new Promise((resolve) => {
			const req = db.transaction(STORE, 'readonly')
				.objectStore(STORE)
				.get(key)
			req.onsuccess = () => {
				const value = req.result
				resolve(value instanceof Uint8Array ? value : value instanceof ArrayBuffer ? new Uint8Array(value) : null)
			}
			req.onerror = () => resolve(null)
		})
	}
	catch {
		return null
	}
}

/** Stores the gzip snapshot, pruning older snapshots for the same template. */
export async function putCachedSnapshot(template: string, files: FileSystemTree, bytes: Uint8Array): Promise<void> {
	try {
		const key = `${template}@${SNAPSHOT_FORMAT_VERSION}@${await signature(files)}`
		const db = await openDb()
		await new Promise<void>((resolve) => {
			const tx = db.transaction(STORE, 'readwrite')
			const store = tx.objectStore(STORE)
			const keysReq = store.getAllKeys()
			keysReq.onsuccess = () => {
				for (const k of keysReq.result) {
					if (typeof k === 'string' && k.startsWith(`${template}@`) && k !== key)
						store.delete(k)
				}
				store.put(bytes, key)
			}
			tx.oncomplete = () => resolve()
			tx.onerror = () => resolve()
		})
	}
	catch {
		// Best-effort cache; ignore quota/availability errors.
	}
}
