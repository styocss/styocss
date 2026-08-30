import type { FileSystemTree } from '@webcontainer/api'
import type Terminal from '../components/Terminal.vue'
import { useDebounceFn } from '@vueuse/core'
import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string'
import { reactive, ref, watch } from 'vue'
import { templates } from '../templates'
import { useWebContainer } from './useWebContainer'
import { workspaceTreeHasPath } from './useWorkspaceFs'

// Singleton state
// The app may be served under a sub-path (e.g. /playground/), so the template
// segment is whatever follows the Vite base URL. A `?template=` query param
// overrides it (used by the snapshot generator so it doesn't depend on routing).
const BASE_URL = import.meta.env.BASE_URL
const pathTemplateKey = window.location.pathname.startsWith(BASE_URL)
	? window.location.pathname.slice(BASE_URL.length)
		.split('/')[0]
	: window.location.pathname.split('/')[1]
const requestedTemplateKey = new URLSearchParams(window.location.search)
	.get('template') || pathTemplateKey
const initialTemplateKey = (requestedTemplateKey && Object.hasOwn(templates, requestedTemplateKey))
	? requestedTemplateKey as keyof typeof templates
	: 'solid-ts'

export const selectedTemplate = ref<string>(initialTemplateKey)
export const activeFilePath = ref<string>(templates[initialTemplateKey]!.entryFile)
export const activeFileContent = ref<string>('')
export const isReadOnly = ref(false)
export const isResizing = ref(false)
export const projectTree = reactive<FileSystemTree>(JSON.parse(JSON.stringify(templates[initialTemplateKey]!.files)))
export const terminalInstance = ref<InstanceType<typeof Terminal> | null>(null)
export const terminalOutput = ref('')

const { instance, writeFile } = useWebContainer()

const pendingWriteTimers = new Map<string, ReturnType<typeof setTimeout>>()
const writeQueues = new Map<string, Promise<void>>()
const deletedTemplatePaths = new Set<string>()
let fileSelectionRevision = 0

// Helper functions (internal)
export function writeToTerminal(data: string) {
	terminalOutput.value += data
	terminalInstance.value?.write(data)
}
export function flattenTree(tree: FileSystemTree, prefix = ''): Record<string, string> {
	const result: Record<string, string> = {}
	for (const [name, node] of Object.entries(tree)) {
		const path = prefix ? `${prefix}/${name}` : name
		if ('file' in node) {
			if ('contents' in node.file && typeof node.file.contents === 'string') {
				result[path] = node.file.contents
			}
		}
		else if ('directory' in node) {
			Object.assign(result, flattenTree(node.directory, path))
		}
	}
	return result
}

const templateFilePaths = new Set(Object.keys(flattenTree(templates[initialTemplateKey]!.files)))

function removeTreeFile(tree: FileSystemTree, path: string) {
	const segments = path.split('/')
	const name = segments.pop()
	if (!name)
		return
	let current = tree
	for (const segment of segments) {
		const node = current[segment]
		if (!node || !('directory' in node))
			return
		current = node.directory
	}
	delete current[name]
}

function setTreeFile(tree: FileSystemTree, path: string, content: string) {
	const segments = path.split('/')
	const name = segments.pop()
	if (!name)
		return
	let current = tree
	for (const segment of segments) {
		const existing = current[segment]
		if (!existing || !('directory' in existing))
			current[segment] = { directory: {} }
		current = (current[segment] as { directory: FileSystemTree }).directory
	}
	current[name] = { file: { contents: content } }
}

async function readWorkspaceFile(path: string): Promise<string | null> {
	const container = instance.value
	if (!container)
		return null
	const absolutePath = path.startsWith('/') ? path : `/${path}`
	for (let attempt = 0; attempt < 3; attempt++) {
		try {
			return await container.fs.readFile(absolutePath, 'utf-8')
		}
		catch {
			if (attempt < 2)
				await new Promise(resolve => setTimeout(resolve, 40 * (attempt + 1)))
		}
	}
	return null
}

function updateTreeFromMap(tree: FileSystemTree, map: Record<string, string>, prefix = '') {
	for (const [name, node] of Object.entries(tree)) {
		const path = prefix ? `${prefix}/${name}` : name
		if ('file' in node) {
			if (map[path] !== undefined && 'contents' in node.file) {
				node.file.contents = map[path]
			}
		}
		else if ('directory' in node) {
			updateTreeFromMap(node.directory, map, path)
		}
	}
}

function findTemplateFile(path: string) {
	const segments = path.split('/')
	let current: any = projectTree
	for (const segment of segments) {
		if (current[segment]?.directory) {
			current = current[segment].directory
		}
		else if (current[segment]?.file) {
			return current[segment].file
		}
		else {
			return null
		}
	}
	return null
}

export const updateHash = useDebounceFn(() => {
	const state = {
		version: 2,
		files: flattenTree(projectTree),
		deleted: [...deletedTemplatePaths].sort(),
	}
	const hash = compressToEncodedURIComponent(JSON.stringify(state))
	window.history.replaceState(null, '', `#${hash}`)
}, 1000)

function scheduleTemplateWrite(path: string, content: string) {
	const previousTimer = pendingWriteTimers.get(path)
	if (previousTimer)
		clearTimeout(previousTimer)

	pendingWriteTimers.set(path, setTimeout(() => {
		pendingWriteTimers.delete(path)
		const previousWrite = writeQueues.get(path) ?? Promise.resolve()
		const operation = previousWrite
			.catch(() => {})
			.then(async () => {
				try {
					await writeFile(path, content)
					updateHash()
				}
				catch (error) {
					console.error(`[workbench] Failed to write ${path}:`, error)
				}
			})
		writeQueues.set(path, operation)
		void operation.finally(() => {
			if (writeQueues.get(path) === operation)
				writeQueues.delete(path)
		})
	}, 500))
}

function hasLocalWriteOwnership(path: string) {
	return pendingWriteTimers.has(path) || writeQueues.has(path)
}

function pathWasAffected(path: string, changedPaths: readonly string[]) {
	return changedPaths.length === 0 || changedPaths.some(changedPath => !changedPath
		|| changedPath === path
		|| path.startsWith(`${changedPath}/`)
		|| changedPath.startsWith(`${path}/`))
}

export interface WorkspaceFileUpdate {
	path: string
	content: string
}

/**
 * Reconcile the real WebContainer contents into the shareable template snapshot.
 * Local editor writes retain ownership until their per-path write queue drains.
 * Structural template deletions are encoded explicitly in the v2 share hash.
 */
export async function syncWorkspaceFileChanges(changedPaths: readonly string[]): Promise<WorkspaceFileUpdate[]> {
	const updates: WorkspaceFileUpdate[] = []
	let hashChanged = false

	for (const path of templateFilePaths) {
		if (!pathWasAffected(path, changedPaths) || hasLocalWriteOwnership(path))
			continue

		const livePresent = workspaceTreeHasPath(path)
		const templateFile = findTemplateFile(path)
		if (!livePresent) {
			if (!templateFile)
				continue
			removeTreeFile(projectTree, path)
			deletedTemplatePaths.add(path)
			hashChanged = true
			updates.push({ path, content: '' })
			if (activeFilePath.value === path) {
				isReadOnly.value = true
				activeFileContent.value = ''
			}
			continue
		}

		const content = await readWorkspaceFile(path)
		// The live tree can briefly race atomic replacement/rename. A failed read
		// never means an empty file; keep the last known source state and retry on
		// the next watch/reconciliation event.
		if (content == null || hasLocalWriteOwnership(path))
			continue

		const reappeared = deletedTemplatePaths.delete(path)
		if (!templateFile)
			setTreeFile(projectTree, path, content)
		else if (templateFile.contents !== content)
			templateFile.contents = content
		else if (!reappeared)
			continue

		hashChanged = true
		updates.push({ path, content })
		if (activeFilePath.value === path) {
			isReadOnly.value = false
			activeFileContent.value = content
		}
	}

	const activePath = activeFilePath.value
	if (!templateFilePaths.has(activePath) && pathWasAffected(activePath, changedPaths)) {
		if (!workspaceTreeHasPath(activePath)) {
			if (isReadOnly.value)
				activeFileContent.value = ''
			updates.push({ path: activePath, content: '' })
		}
		else {
			const content = await readWorkspaceFile(activePath)
			if (content != null && activeFilePath.value === activePath && isReadOnly.value) {
				activeFileContent.value = content
				updates.push({ path: activePath, content })
			}
		}
	}

	if (hashChanged)
		updateHash()
	return updates
}

// Actions
export async function onFileSelect(path: string) {
	const revision = ++fileSelectionRevision
	activeFilePath.value = path
	const templateFile = findTemplateFile(path)
	if (templateFile) {
		isReadOnly.value = false
		activeFileContent.value = typeof templateFile.contents === 'string' ? templateFile.contents : ''
		return
	}

	// Files created by the live runtime (including `.pikacss/*`) are inspectable
	// but are not part of the template/hash ownership model, so keep them read-only.
	// Guard the asynchronous read: rapidly selecting another file must not let a
	// slower generated-file read overwrite the newly selected editor content.
	isReadOnly.value = true
	activeFileContent.value = ''
	const content = await readWorkspaceFile(path)
	if (revision !== fileSelectionRevision || activeFilePath.value !== path || content == null)
		return
	activeFileContent.value = content
}

export function handleTemplateSwitch(key: string) {
	if (key === selectedTemplate.value)
		return
	// Trailing slash hits the per-template index.html directly on static hosts.
	window.location.href = `${BASE_URL}${key}/`
}

export function loadFromHash() {
	const hash = window.location.hash.slice(1)
	if (!hash)
		return false
	try {
		const json = decompressFromEncodedURIComponent(hash)
		if (json) {
			const state = JSON.parse(json)
			if (state?.version === 2 && state.files && Array.isArray(state.deleted)) {
				updateTreeFromMap(projectTree, state.files)
				for (const path of state.deleted) {
					if (typeof path !== 'string' || !templateFilePaths.has(path))
						continue
					deletedTemplatePaths.add(path)
					removeTreeFile(projectTree, path)
				}
			}
			else {
				// Backward compatibility with the original flat-map hash format.
				updateTreeFromMap(projectTree, state)
			}
			return true
		}
	}
	catch (e) {
		console.error('Failed to load from hash', e)
	}
	return false
}

// Watcher for editable template content changes. Capture the path at change time
// so switching to a generated/read-only file cannot redirect a pending write.
watch(activeFileContent, (newVal) => {
	if (isReadOnly.value)
		return
	const path = activeFilePath.value
	const targetNode = findTemplateFile(path)
	if (!targetNode || targetNode.contents === newVal)
		return
	targetNode.contents = newVal
	scheduleTemplateWrite(path, newVal)
})

export function getDeletedTemplatePaths() {
	return [...deletedTemplatePaths]
}

export function getInitialTemplateKey() {
	return initialTemplateKey
}
