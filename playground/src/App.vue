<script setup lang="ts">
import type { DockviewApi, DockviewReadyEvent } from 'dockview-vue'
import { useDebounceFn } from '@vueuse/core'
import { DockviewVue } from 'dockview-vue'
import { markRaw, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'
import EditorPanel from './components/panels/EditorPanel.vue'
import ExplorerPanel from './components/panels/ExplorerPanel.vue'
import PreviewPanel from './components/panels/PreviewPanel.vue'
import TerminalPanel from './components/panels/TerminalPanel.vue'
import TemplateSelector from './components/TemplateSelector.vue'
import { useMonacoConfig } from './composables/useMonacoConfig'
import { bytesToBase64, fetchStaticSnapshot, getCachedSnapshot, putCachedSnapshot } from './composables/useSnapshotCache'
import { useWebContainer } from './composables/useWebContainer'
import {
	activeFilePath,
	flattenTree,
	getInitialTemplateKey,
	handleTemplateSwitch,
	loadFromHash,
	onFileSelect,
	projectTree,
	selectedTemplate,
	writeToTerminal,
} from './composables/useWorkbench'
import { startWorkspaceFsSync, stopWorkspaceFsSync, workspaceTreeHasPath } from './composables/useWorkspaceFs'
import { templates } from './templates'

defineOptions({
	components: {
		ExplorerPanel,
		EditorPanel,
		PreviewPanel,
		TerminalPanel,
	},
})

// -- Dependencies --
const { boot, install, mountCachedSnapshot, exportSnapshot, startDevServer, isBooting, isInstalling, isRunning, instance } = useWebContainer()
const { loadMonacoConfig, loadPikaGlobals, loadPikaGenTypes, preloadTemplateModels, removePikaGenTypes } = useMonacoConfig()

// Resolves once node_modules types + tsconfig have been fed to Monaco; the
// generated pika types must load after it (loadTypes' setExtraLibs would wipe
// them, and their imports need the loaded node_modules to resolve).
let monacoConfigReady: Promise<void> = Promise.resolve()

const hasVueFiles = Object.keys(flattenTree(projectTree))
	.some(path => path.endsWith('.vue'))
let vueLanguageServiceModule: Promise<typeof import('./composables/useVueLanguageService')> | null = null
function loadVueLanguageServiceModule() {
	vueLanguageServiceModule ??= import('./composables/useVueLanguageService')
	return vueLanguageServiceModule
}

// Generated authoring state is synchronized from WebContainer filesystem events,
// never terminal text. The live Explorer tree decides whether pika.gen.ts exists;
// reads only update content and can never reinterpret a transient read failure as deletion.
const refreshPikaGenTypes = useDebounceFn(async (generatedPresent: boolean) => {
	if (!instance.value)
		return
	await monacoConfigReady
	const result = generatedPresent
		? await loadPikaGenTypes(instance.value)
		: removePikaGenTypes()
	let languageServiceReady = true
	if (hasVueFiles && (result === 'updated' || result === 'removed')) {
		try {
			const vueLanguageService = await loadVueLanguageServiceModule()
			await vueLanguageService.refreshVueLanguageService()
		}
		catch (e) {
			languageServiceReady = false
			console.error('[VueLS] Failed to refresh after pika.gen.ts change:', e)
		}
	}

	if (new URLSearchParams(window.location.search)
		.has('__bench') && languageServiceReady) {
		if (result === 'updated' || result === 'removed') {
			;(window as any).__pikaTypegenSyncRevision = ((window as any).__pikaTypegenSyncRevision ?? 0) + 1
		}
		// Bench scaffolding: signal only after real generated types are present,
		// and (for Vue) after the language service refresh has completed.
		if (result === 'updated' || result === 'unchanged') {
			;(window as any).__benchReady = true
		}
	}
}, 150)

const initialTemplateKey = getInitialTemplateKey()
// `?__generate` runs a fresh install (ignoring any cache) and exposes the
// resulting snapshot on `window.__pikaSnapshot` — used by the CI generator
// (scripts/gen-snapshots.mjs) to produce the static baseline snapshots. It
// reuses the full app boot flow because WebContainer's `spawn` does not work in
// a stripped-down page.
const generateMode = new URLSearchParams(window.location.search)
	.has('__generate')
// Whether this session mounted a cached snapshot instead of installing. When it
// did not, we export + cache the freshly installed deps once the dev server is
// ready, so the next visit is fast.
const usedCachedSnapshot = ref(false)
watch(isRunning, async (running) => {
	if (!running || usedCachedSnapshot.value)
		return
	const gz = await exportSnapshot()
	if (generateMode)
		(window as any).__pikaSnapshot = gz ? { template: initialTemplateKey, base64: bytesToBase64(gz), done: true } : { done: true, error: 'export failed' }
	else if (gz)
		await putCachedSnapshot(initialTemplateKey, templates[initialTemplateKey]!.files, gz)
}, { once: true })

// -- Dockview Config --
const dockviewApi = shallowRef<DockviewApi | null>(null)

// Update Editor Title when active file changes
watch(activeFilePath, (path) => {
	if (dockviewApi.value) {
		const panel = dockviewApi.value.getPanel('editor')
		if (panel) {
			panel.setTitle(path)
		}
	}
})

// Register components with markRaw
// Using shallowRef to avoid deep reactivity overhead, though regular object + markRaw is also fine.
const panelComponents = {
	ExplorerPanel: markRaw(ExplorerPanel),
	EditorPanel: markRaw(EditorPanel),
	PreviewPanel: markRaw(PreviewPanel),
	TerminalPanel: markRaw(TerminalPanel),
}

function createDefaultLayout(api: DockviewApi) {
	api.clear()

	// Layout: [Explorer] | [Editor / Terminal] | [Preview]
	// Terminal sits under the editor so the preview spans the full height.

	const explorer = api.addPanel({
		id: 'explorer',
		component: 'ExplorerPanel',
		title: 'EXPLORER',
		params: { tabHeight: 0 },
		initialWidth: 240,
	})

	// Editor to the right of Explorer
	const editor = api.addPanel({
		id: 'editor',
		component: 'EditorPanel',
		title: activeFilePath.value || 'EDITOR',
		position: { referencePanel: explorer, direction: 'right' },
	})

	// Preview to the right of Editor (full height)
	api.addPanel({
		id: 'preview',
		component: 'PreviewPanel',
		title: 'PREVIEW',
		position: { referencePanel: editor, direction: 'right' },
	})

	// Terminal below the Editor
	const terminal = api.addPanel({
		id: 'terminal',
		component: 'TerminalPanel',
		title: 'TERMINAL',
		position: { referencePanel: editor, direction: 'below' },
		initialHeight: 220,
	})

	// `initialWidth`/`initialHeight` are relative to the container size, which is
	// still 0 during the initial `onReady`; re-apply once it has been laid out.
	requestAnimationFrame(() => {
		explorer.api.setSize({ width: 240 })
		terminal.api.setSize({ height: 220 })
	})
}

function onReady(event: DockviewReadyEvent) {
	try {
		const api = event.api
		dockviewApi.value = api
		createDefaultLayout(api)
	}
	catch (e) {
		console.error('Dockview onReady failed:', e)
	}
}

function onResetLayout() {
	if (dockviewApi.value) {
		createDefaultLayout(dockviewApi.value)
	}
}

// -- Lifecycle --
onMounted(async () => {
	loadFromHash()

	// Set initial content for the default active file
	onFileSelect(activeFilePath.value)

	// Create models for all template TS/TSX sources so cross-file imports
	// resolve without each file having been opened first.
	preloadTemplateModels(flattenTree(projectTree))

	// Boot
	try {
		const config = templates[initialTemplateKey]!

		if (!isBooting.value) {
			await boot()
		}

		if (instance.value) {
			// Skip the slow in-browser npm install by mounting a dependency
			// snapshot: a per-visitor IndexedDB cache first, then the CI-generated
			// static baseline (fast first visit for everyone). `?__generate` forces
			// a fresh install so the exported snapshot is clean.
			const snapshot = generateMode
				? null
				: await getCachedSnapshot(initialTemplateKey, config.files)
					?? await fetchStaticSnapshot(import.meta.env.BASE_URL, initialTemplateKey)
			usedCachedSnapshot.value = snapshot != null && await mountCachedSnapshot(snapshot)
			if (usedCachedSnapshot.value)
				writeToTerminal('\r\n\x1b[32mMounted cached dependencies; skipping install.\x1b[0m\r\n')

			// Mount the current template source (incl. URL-hash edits) on top,
			// leaving any snapshot node_modules in place.
			await instance.value.mount(projectTree)

			if (!usedCachedSnapshot.value)
				await install(config.installCommand, data => writeToTerminal(data))

			// Load types and config from VFS in background. Declare the `pika`
			// global afterwards (loadTypes calls setExtraLibs, which would otherwise
			// wipe it) so the editor stops reporting "Cannot find name 'pika'".
			monacoConfigReady = loadMonacoConfig(instance.value)
				.catch(e => console.error('[MonacoConfig] Failed:', e))
				.finally(() => loadPikaGlobals())

			// Volar-based `.vue` language features (completion, hover, diagnostics).
			// Keep the heavy worker lazy for templates without SFCs.
			if (hasVueFiles) {
				loadVueLanguageServiceModule()
					.then(m => m.setupVueLanguageService(instance.value!))
					.catch(e => console.error('[VueLS] Failed to start the vue language service:', e))
			}

			// The live filesystem now owns Explorer and generated-state discovery.
			// Start watching only after dependency installation/mounting so node_modules
			// churn never floods the workbench. The initial sync also catches files
			// already present in a mounted snapshot.
			await startWorkspaceFsSync(instance.value, () => refreshPikaGenTypes(workspaceTreeHasPath('.pikacss/pika.gen.ts')))
		}

		await startDevServer(config.devCommand, data => writeToTerminal(data))
	}
	catch (e) {
		console.error('Boot Failed', e)
		writeToTerminal(`\r\n\x1b[31mBoot Failed: ${e}\x1b[0m\r\n`)
	}
})

onUnmounted(() => stopWorkspaceFsSync())

const templateOptions = Object.keys(templates)
</script>

<template>
	<div :class="pika({ height: '100vh', width: '100vw', display: 'flex', flexDirection: 'column', backgroundColor: '#1e1e1e', color: 'white' })">
		<!-- Header -->
		<header :class="pika({ height: '3rem', borderBottomWidth: '1px', borderBottomColor: '#374151', display: 'flex', alignItems: 'center', paddingLeft: '1rem', paddingRight: '1rem', flexShrink: '0', backgroundColor: '#252526' })">
			<h1 :class="pika({ fontSize: '0.875rem', fontWeight: 'bold', color: '#d1d5db', marginRight: '1rem' })">
				PikaCSS Playground
			</h1>
			<TemplateSelector
				:modelValue="selectedTemplate"
				:options="templateOptions"
				@select="handleTemplateSwitch"
			/>
			<div
				v-if="isBooting"
				:class="pika({ marginLeft: 'auto', fontSize: '0.75rem', color: '#6b7280' })"
			>
				Booting...
			</div>
			<div
				v-else-if="isInstalling"
				:class="pika({ marginLeft: 'auto', fontSize: '0.75rem', color: '#60a5fa' })"
			>
				Installing...
			</div>
			<div
				v-else-if="isRunning"
				:class="pika({ marginLeft: 'auto', fontSize: '0.75rem', color: '#4ade80' })"
			>
				Ready
			</div>

			<button
				:class="pika({
					marginLeft: '1rem',
					fontSize: '0.75rem',
					padding: '0.25rem 0.5rem',
					borderRadius: '0.25rem',
					backgroundColor: '#374151',
					color: '#d1d5db',
					border: 'none',
					cursor: 'pointer',
					transition: 'background-color 0.2s',
				})"
				@click="onResetLayout"
			>
				Reset Layout
			</button>
		</header>

		<!-- Main Content -->
		<main :class="pika({ flex: '1 1 0%', display: 'flex', overflow: 'hidden' })">
			<DockviewVue
				:components="panelComponents"
				class="dockview-theme-abyss"
				@ready="onReady"
			/>
		</main>
	</div>
</template>

<style>
/* Dockview styling */
@import 'dockview-core/dist/styles/dockview.css';

.dockview-theme-abyss {
    height: 100%;
    width: 100%;
}
</style>
