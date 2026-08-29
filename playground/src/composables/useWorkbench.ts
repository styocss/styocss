import type { FileSystemTree } from '@webcontainer/api'
import type Terminal from '../components/Terminal.vue'
import { useDebounceFn } from '@vueuse/core'
import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string'
import { reactive, ref, watch } from 'vue'
import { templates } from '../templates'
import { useWebContainer } from './useWebContainer'

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

const { readFile, writeFile } = useWebContainer()

const pendingWriteTimers = new Map<string, ReturnType<typeof setTimeout>>()
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
	const flatMap = flattenTree(projectTree)
	const hash = compressToEncodedURIComponent(JSON.stringify(flatMap))
	window.history.replaceState(null, '', `#${hash}`)
}, 1000)

function scheduleTemplateWrite(path: string, content: string) {
	const previous = pendingWriteTimers.get(path)
	if (previous)
		clearTimeout(previous)
	pendingWriteTimers.set(path, setTimeout(async () => {
		pendingWriteTimers.delete(path)
		await writeFile(path, content)
		updateHash()
	}, 500))
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
	const content = await readFile(path)
	if (revision !== fileSelectionRevision || activeFilePath.value !== path)
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
			const map = JSON.parse(json)
			updateTreeFromMap(projectTree, map)
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

export function getInitialTemplateKey() {
	return initialTemplateKey
}
