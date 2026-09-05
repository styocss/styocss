<script setup lang="ts">
import * as monaco from 'monaco-editor'
import EditorWorker from 'monaco-editor/editor/editor.worker?worker'
import CssWorker from 'monaco-editor/language/css/css.worker?worker'
import HtmlWorker from 'monaco-editor/language/html/html.worker?worker'
import JsonWorker from 'monaco-editor/language/json/json.worker?worker'
import { onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'
import { getEditorTheme, setupShikiMonaco } from '../composables/useShikiMonaco'
// Custom TS worker (root-file trim): rollback = swap back to
// `monaco-editor/language/typescript/ts.worker?worker`.
import PikaTsWorker from '../workers/pika-ts.worker?worker'

const props = defineProps<{
	modelValue: string
	language?: string
	readOnly?: boolean
	path?: string
}>()

const emit = defineEmits<{
	(e: 'update:modelValue', value: string): void
}>()

// `?__bench` exposes editor handles for scripts/bench-suggest.mjs (the
// quick-suggest latency/visibility regression harness).
const BENCH_MODE = new URLSearchParams(globalThis.location?.search ?? '')
	.has('__bench')

globalThis.MonacoEnvironment = {
	getWorker(_, label) {
		if (label === 'vue') {
			// Lazy import keeps the heavy Volar chunk (bundled typescript +
			// @vue/language-service) out of sessions that never open a vue-ts
			// template. Instantiated via createWebWorker in useVueLanguageService.
			return import('../workers/vue.worker?worker').then(({ default: VueWorker }) => new VueWorker())
		}
		if (label === 'json') {
			return new JsonWorker()
		}
		if (label === 'css' || label === 'scss' || label === 'less') {
			return new CssWorker()
		}
		if (label === 'html' || label === 'handlebars' || label === 'razor') {
			return new HtmlWorker()
		}
		if (label === 'typescript' || label === 'javascript') {
			return new PikaTsWorker()
		}
		return new EditorWorker()
	},
}

// Registers the `vue` language and kicks off the async shiki highlighter.
setupShikiMonaco()

const container = ref<HTMLElement | null>(null)
const editor = shallowRef<monaco.editor.IStandaloneCodeEditor | null>(null)

// Configure TypeScript compiler options
const ts = monaco.typescript

ts.typescriptDefaults.setCompilerOptions({
	target: ts.ScriptTarget.ESNext,
	allowNonTsExtensions: true,
	// ts.ModuleResolutionKind only exposes Classic/NodeJs, but the worker embeds
	// TS 5.9, which accepts the real enum value for `bundler` (100). Bundler
	// resolution reads package.json `exports`, which the templates rely on.
	moduleResolution: 100 as monaco.typescript.ModuleResolutionKind,
	module: ts.ModuleKind.ESNext,
	noEmit: true,
	esModuleInterop: true,
	allowSyntheticDefaultImports: true,
	allowJs: true,
	baseUrl: 'file:///',
	paths: {
		'*': ['node_modules/*'],
	},
	resolveJsonModule: true,
})

// Sync models to the TS worker even when they are not bound to an editor —
// required for the preloaded template models (see preloadTemplateModels).
ts.typescriptDefaults.setEagerModelSync(true)

onMounted(() => {
	if (!container.value)
		return

	// Create or get model with specific URI to ensure it shares the same "FS" as our type libs
	const uri = monaco.Uri.parse(props.path || 'file:///temp.ts')
	let model = monaco.editor.getModel(uri)

	if (!model) {
		model = monaco.editor.createModel(props.modelValue, props.language, uri)
	}
	else {
		model.setValue(props.modelValue)
		monaco.editor.setModelLanguage(model, props.language || 'typescript')
	}

	editor.value = monaco.editor.create(container.value, {
		model,
		// value: props.modelValue, // remove value prop when using model
		theme: getEditorTheme(),
		readOnly: props.readOnly || false,
		automaticLayout: true,
		minimap: { enabled: false },
		fontSize: 14,
		scrollBeyondLastLine: false,
		fixedOverflowWidgets: true,
	})

	if (BENCH_MODE) {
		;(globalThis as any).__ed = editor.value
		;(globalThis as any).__monaco = monaco
	}

	// No local ATA here anymore. We will load types globally via useTypeLoader in App.vue

	// Normal change handler
	editor.value.onDidChangeModelContent(() => {
		const value = editor.value?.getValue() || ''
		if (value !== props.modelValue) {
			emit('update:modelValue', value)
		}
	})
})

// Watch for changes to path OR modelValue from parent
// We use a single watcher to avoid race conditions where path changes but modelValue is old
watch(() => [props.path, props.modelValue, props.language], (newValues, oldValues) => {
	// oldValues is undefined on first run with immediate: true
	const [newPath, newValue, newLang] = newValues
	const [oldPath] = oldValues || []

	if (!editor.value || !newPath)
		return

	const uri = monaco.Uri.parse(newPath)

	// 1. Check if we need to switch models (Path changed)
	let model = monaco.editor.getModel(uri)

	// If path changed (or it's the first run meaning oldPath is undefined)
	if (newPath !== oldPath) {
		if (!model) {
			model = monaco.editor.createModel(newValue || '', newLang || 'typescript', uri)
		}
		editor.value.setModel(model)
	}

	// 2. Update content if external value changed (and it's not our own emit)
	if (model && model.getValue() !== newValue) {
		model.setValue(newValue || '')
	}

	// 3. Update language if changed
	// Note: we don't have oldLang available easily if we removed it from destructuring,
	// but we can check usage. Actually checking if language matches model mode is better?
	// Or just set it if newLang is defined.
	if (model && newLang) {
		const currentLang = model.getLanguageId()
		if (currentLang !== newLang) {
			monaco.editor.setModelLanguage(model, newLang)
		}
	}
}, { immediate: true })

watch(
	() => props.readOnly,
	(val) => {
		editor.value?.updateOptions({ readOnly: val })
	},
)

watch(
	() => props.readOnly,
	(val) => {
		editor.value?.updateOptions({ readOnly: val })
	},
)

onUnmounted(() => {
	editor.value?.dispose()
})
</script>

<template>
	<div
		ref="container"
		:class="pika({ width: '100%', height: '100%', overflow: 'hidden' })"
	/>
</template>
