import type { FileSystemAPI, FileSystemTree, IFSWatcher, WebContainer } from '@webcontainer/api'
import { reactive, ref } from 'vue'

const HIDDEN_ROOT_ENTRIES = new Set([
	'.git',
	'node_modules',
])

const REFRESH_DELAY_MS = 75

export const explorerTree = reactive<FileSystemTree>({})
export const workspaceFsReady = ref(false)

let watcher: IFSWatcher | null = null
let refreshTimer: ReturnType<typeof setTimeout> | null = null
let activeContainer: WebContainer | null = null
let activeChangeHandler: ((paths: readonly string[]) => void | Promise<void>) | null = null
let refreshQueue: Promise<void> = Promise.resolve()
let lifecycleRevision = 0
const pendingPaths = new Set<string>()

function normalizeWorkspacePath(path: string): string {
	return path.replace(/^\.\//, '')
		.replace(/^\/+/, '')
		.replace(/\\/g, '/')
}

export function isVisibleWorkspacePath(path: string): boolean {
	const normalized = normalizeWorkspacePath(path)
	const [root] = normalized.split('/')
	return root ? !HIDDEN_ROOT_ENTRIES.has(root) : true
}

export function isGeneratedWorkspacePath(path: string): boolean {
	const normalized = normalizeWorkspacePath(path)
	return normalized === '.pikacss' || normalized.startsWith('.pikacss/')
}

export function workspaceTreeHasPath(path: string, tree: FileSystemTree = explorerTree): boolean {
	const segments = normalizeWorkspacePath(path)
		.split('/')
		.filter(Boolean)
	let current = tree
	for (const [index, segment] of segments.entries()) {
		const node = current[segment]
		if (!node)
			return false
		if (index === segments.length - 1)
			return true
		if (!('directory' in node))
			return false
		current = node.directory
	}
	return false
}

function decodeWatchPath(filename: string | Uint8Array): string {
	return normalizeWorkspacePath(typeof filename === 'string'
		? filename
		: new TextDecoder()
				.decode(filename))
}

/**
 * Build the lightweight tree shown by Explorer from the real WebContainer FS.
 * File contents intentionally stay out of this state: the WebContainer owns
 * live contents, while the template tree separately owns shareable edits.
 */
export async function readVisibleWorkspaceTree(fs: FileSystemAPI, directory = ''): Promise<FileSystemTree> {
	const fsPath = directory ? `/${directory}` : '/'
	const entries = await fs.readdir(fsPath, { withFileTypes: true })
	const tree: FileSystemTree = {}

	for (const entry of entries) {
		const path = directory ? `${directory}/${entry.name}` : entry.name
		if (!isVisibleWorkspacePath(path))
			continue

		if (entry.isDirectory()) {
			tree[entry.name] = {
				directory: await readVisibleWorkspaceTree(fs, path),
			}
		}
		else if (entry.isFile()) {
			tree[entry.name] = {
				file: { contents: '' },
			}
		}
	}

	return tree
}

function replaceExplorerTree(nextTree: FileSystemTree) {
	for (const key of Object.keys(explorerTree))
		delete explorerTree[key]
	Object.assign(explorerTree, nextTree)
}

export async function refreshWorkspaceTree(
	container = activeContainer,
	expectedRevision = lifecycleRevision,
): Promise<void> {
	if (!container)
		return
	const nextTree = await readVisibleWorkspaceTree(container.fs)
	if (expectedRevision !== lifecycleRevision || container !== activeContainer)
		return
	replaceExplorerTree(nextTree)
}

export async function reconcileWorkspaceFs(paths: readonly string[] = []): Promise<void> {
	const revision = lifecycleRevision
	const container = activeContainer
	const changeHandler = activeChangeHandler
	if (!container)
		return

	// Serialize rescans so a slower, older snapshot can never overwrite a newer
	// tree when watch events arrive while readdir recursion is still in flight.
	refreshQueue = refreshQueue
		.then(async () => {
			if (revision !== lifecycleRevision || container !== activeContainer)
				return
			await refreshWorkspaceTree(container, revision)
			if (revision === lifecycleRevision && container === activeContainer)
				await changeHandler?.(paths)
		})
		.catch(error => console.error('[workspace-fs] Failed to refresh Explorer:', error))
	await refreshQueue
}

async function flushWorkspaceChanges() {
	refreshTimer = null
	const paths = [...pendingPaths]
	pendingPaths.clear()
	await reconcileWorkspaceFs(paths)
}

function scheduleWorkspaceRefresh(path: string) {
	pendingPaths.add(path)
	if (refreshTimer)
		clearTimeout(refreshTimer)
	refreshTimer = setTimeout(() => void flushWorkspaceChanges(), REFRESH_DELAY_MS)
}

export async function startWorkspaceFsSync(
	container: WebContainer,
	onChange?: (paths: readonly string[]) => void | Promise<void>,
): Promise<void> {
	stopWorkspaceFsSync()
	const revision = lifecycleRevision
	activeContainer = container
	activeChangeHandler = onChange ?? null
	replaceExplorerTree({})
	workspaceFsReady.value = true

	// Arm the watcher before the initial projection so changes that happen while
	// the recursive readdir is in flight are queued for a follow-up reconciliation.
	// WebContainer creates the underlying watcher asynchronously, so callers also
	// reconcile once more at server-ready to close that final registration gap.
	watcher = container.fs.watch('/', { recursive: true }, (_event, filename) => {
		if (revision !== lifecycleRevision || container !== activeContainer)
			return
		const path = decodeWatchPath(filename)
		if (path && !isVisibleWorkspacePath(path))
			return
		scheduleWorkspaceRefresh(path)
	})

	await reconcileWorkspaceFs()
}

export function stopWorkspaceFsSync() {
	lifecycleRevision++
	watcher?.close()
	watcher = null
	if (refreshTimer)
		clearTimeout(refreshTimer)
	refreshTimer = null
	pendingPaths.clear()
	activeContainer = null
	activeChangeHandler = null
	workspaceFsReady.value = false
}
