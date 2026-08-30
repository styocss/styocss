import type { WebContainerProcess } from '@webcontainer/api'
import { WebContainer } from '@webcontainer/api'
import { ref, shallowRef } from 'vue'
// import { files } from '../templates/files';

// In a cross-origin-isolated context a Uint8Array may be backed by a
// SharedArrayBuffer, which the Blob/stream DOM types reject; the runtime is
// fine, so gzip/gunzip through a small typed cast.
async function gzip(bytes: Uint8Array): Promise<Uint8Array> {
	const stream = new Blob([bytes as BlobPart])
		.stream()
		.pipeThrough(new CompressionStream('gzip'))
	return new Uint8Array(await new Response(stream)
		.arrayBuffer())
}

async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
	const stream = new Blob([bytes as BlobPart])
		.stream()
		.pipeThrough(new DecompressionStream('gzip'))
	return new Uint8Array(await new Response(stream)
		.arrayBuffer())
}

// Singleton instance
let webcontainerInstance: WebContainer | null = null

// Singleton State
const isBooting = ref(false)
const isInstalling = ref(false)
const isRunning = ref(false)
const iframeUrl = ref<string>('')
const terminalInstance = shallowRef<WebContainerProcess | null>(null)
const instance = shallowRef<WebContainer | null>(null)

export function useWebContainer() {
	/**
	 * Boot the WebContainer and mount the initial file system.
	 */
	async function boot() {
		if (webcontainerInstance)
			return

		try {
			isBooting.value = true
			webcontainerInstance = await WebContainer.boot()
			instance.value = webcontainerInstance
			// await webcontainerInstance.mount(files); // Removed default mount
			isBooting.value = false
		}
		catch (error) {
			console.error('Failed to boot WebContainer:', error)
			isBooting.value = false // Still technically failed
		}
	}

	/**
	 * Run `npm install` inside the container.
	 * Pipe output to a callback if provided.
	 */
	async function install(command: string = 'npm install', onOutput?: (data: string) => void) {
		if (!webcontainerInstance)
			return

		isInstalling.value = true
		const parts = command.split(' ')
		const cmd = parts[0]
		const args = parts.slice(1)

		if (!cmd)
			throw new Error('Invalid execute command')

		const process = await webcontainerInstance.spawn(cmd, args)

		process.output.pipeTo(
			new WritableStream({
				write(data) {
					if (onOutput)
						onOutput(data)
				},
			}),
		)

		const exitCode = await process.exit
		isInstalling.value = false

		if (exitCode !== 0) {
			throw new Error('Installation failed')
		}
	}

	/**
	 * Start the dev server (`npm run dev`).
	 */
	async function startDevServer(command: string = 'npm run dev', onOutput?: (data: string) => void) {
		if (!webcontainerInstance)
			return

		const parts = command.split(' ')
		const cmd = parts[0]
		const args = parts.slice(1)

		if (!cmd)
			throw new Error('Invalid execute command')

		const process = await webcontainerInstance.spawn(cmd, args)
		terminalInstance.value = process

		process.output.pipeTo(
			new WritableStream({
				write(data) {
					if (onOutput)
						onOutput(data)
				},
			}),
		)

		webcontainerInstance.on('server-ready', (_port, url) => {
			iframeUrl.value = url
			isRunning.value = true
		})
	}

	/**
	 * Mount a cached dependency snapshot (gzip of `export('.', binary)`) so the
	 * slow in-browser `npm install` can be skipped. Returns `false` (without
	 * throwing) on any failure so callers can fall back to installing. The
	 * caller should mount the current template source on top afterwards.
	 */
	async function mountCachedSnapshot(gzBytes: Uint8Array): Promise<boolean> {
		if (!webcontainerInstance)
			return false
		try {
			// Static `.bin` files are gzip; decompress unless a static server
			// already did (no gzip magic bytes), then mount.
			const isGzip = gzBytes[0] === 0x1F && gzBytes[1] === 0x8B
			const binary = isGzip ? await gunzip(gzBytes) : gzBytes
			await webcontainerInstance.mount(binary)
			// Historical/static dependency snapshots may contain generated state.
			// Always discard it after mount so every session derives fresh Typegen
			// from the currently mounted template + published dependencies.
			await webcontainerInstance.fs.rm('.pikacss', { recursive: true, force: true })
			// mount() drops the executable bit, so restore it or `npm run dev`
			// fails with `spawn vite EACCES`.
			const chmod = await webcontainerInstance.spawn('chmod', ['-R', '+x', 'node_modules'])
			await chmod.exit
			return true
		}
		catch (error) {
			console.warn('[snapshot] Failed to mount cached snapshot; falling back to npm install.', error)
			return false
		}
	}

	/**
	 * Export the current container filesystem as a gzip-compressed WebContainer
	 * binary snapshot, suitable for caching and later {@link mountCachedSnapshot}.
	 * Generated `.pikacss` state is deliberately excluded: dependency snapshots
	 * must never seed a future editor session with stale Typegen output.
	 * Returns `null` on failure.
	 */
	async function exportSnapshot(): Promise<Uint8Array | null> {
		if (!webcontainerInstance)
			return null
		try {
			const binary = await webcontainerInstance.export('.', {
				format: 'binary',
				excludes: ['.git', '.pikacss', '.pikacss/**'],
			})
			return await gzip(binary)
		}
		catch (error) {
			console.warn('[snapshot] Failed to export snapshot for caching.', error)
			return null
		}
	}

	/**
	 * Write a file to the container.
	 */
	async function writeFile(path: string, content: string) {
		if (!webcontainerInstance)
			return
		await webcontainerInstance.fs.writeFile(path, content)
	}

	/**
	 * Read a file from the container.
	 */
	async function readFile(path: string): Promise<string> {
		if (!webcontainerInstance)
			return ''
		try {
			const content = await webcontainerInstance.fs.readFile(path, 'utf-8')
			return content
		}
		catch {
			return ''
		}
	}

	return {
		boot,
		install,
		mountCachedSnapshot,
		exportSnapshot,
		startDevServer,
		writeFile,
		readFile,
		isBooting,
		isInstalling,
		isRunning,
		iframeUrl,
		instance,
	}
}
