<script setup lang="ts">
import { ref, watch } from 'vue'
import { useWebContainer } from '../../composables/useWebContainer'
import { isResizing, terminalOutput } from '../../composables/useWorkbench'

defineOptions({ name: 'PreviewPanel' })

const { iframeUrl, isRunning, isBooting, isInstalling } = useWebContainer()

// The dev server signals `server-ready` before PikaCSS has generated
// `pika.css`, so the first paint of the preview is unstyled and Vite's CSS
// HMR update does not retroactively style the already-rendered page. Reload the
// iframe once the atomic CSS is ready, with a timed fallback in case the log
// never shows.
//
// The demo emits its atomic rules across SEVERAL successive
// `hmr update … pika.css` lines during boot, so reloading on the FIRST one
// can land before the rest of the CSS is written (preview stays unstyled).
// Instead, treat the burst as settled only once no new `pika.css` HMR line
// has arrived for a quiet window, then reload once.
const reloadKey = ref(0)
let reloadedOnce = false
// Quiet window for the boot HMR burst to settle. Successive `pika.css` HMR
// lines during boot arrive within a few hundred ms of each other; 1200ms clears
// that inter-line gap with margin while keeping the single reload prompt.
const BOOT_SETTLE_MS = 1200
let bootScanOffset = 0
let bootSettleTimer: ReturnType<typeof setTimeout> | undefined
function reloadOnce() {
	if (reloadedOnce)
		return
	reloadedOnce = true
	reloadKey.value++
}
watch([iframeUrl, terminalOutput], ([url, output]) => {
	if (!url || reloadedOnce)
		return
	const chunk = output.slice(bootScanOffset)
	bootScanOffset = output.length
	// Each new `hmr update … pika.css` line means more atomic CSS just
	// landed; (re)start the settle timer and only reload once the stream stops.
	if (chunk.includes('hmr update') && chunk.includes('pika.css')) {
		if (bootSettleTimer)
			clearTimeout(bootSettleTimer)
		bootSettleTimer = setTimeout(() => {
			bootSettleTimer = undefined
			reloadOnce()
		}, BOOT_SETTLE_MS)
	}
})
watch(iframeUrl, (url) => {
	if (url) {
		// Fallback for the no-HMR-line case (warm cache: a config load can emit
		// zero `pika.css` updates). Only fire if no settle is in flight, so a
		// still-running boot burst is left to the settle timer above.
		setTimeout(() => {
			if (!bootSettleTimer)
				reloadOnce()
		}, 4000)
	}
})

// Error recovery: after a transform error the preview can stay blank (e.g. a
// solid render aborted mid-error is not revived by the next HMR update), so
// reload the iframe once per error, on the next successful `hmr update` line.
// Scan only newly appended terminal output; the match strings are the ones
// actually observed in the dev-server log.
// limit: recovery keys off `hmr update` lines, which need a live vite client
// in the iframe. If the iframe ends up with no connected client (e.g. it was
// loaded while the entry module 500'd), no hmr lines arrive and recovery
// cannot fire; a manual preview-reload control would be the upgrade path.
let errorScanOffset = 0
let awaitingErrorRecovery = false
watch(terminalOutput, (output) => {
	const chunk = output.slice(errorScanOffset)
	errorScanOffset = output.length
	// Overlay format, error-class stack head, and vite's server-side log format.
	if (chunk.includes('[plugin:unplugin-pikacss]') || chunk.includes('PikaTransformError') || chunk.includes('Plugin: unplugin-pikacss')) {
		awaitingErrorRecovery = true
		// A chunk carrying the error may also carry an `hmr update` line from the
		// same failed edit; only a later chunk counts as recovery.
		return
	}
	if (awaitingErrorRecovery && chunk.includes('hmr update') && iframeUrl.value) {
		awaitingErrorRecovery = false
		// Same grace period as the first load: let the update settle first.
		setTimeout(() => {
			reloadKey.value++
		}, 300)
	}
})
</script>

<template>
	<div class="preview-panel">
		<div
			v-if="!isRunning"
			class="preview-placeholder"
		>
			<span v-if="isBooting">Starting WebContainer…</span>
			<span v-else-if="isInstalling">Installing dependencies… (first load only — cached for next time). You can already edit the code.</span>
			<span v-else>Starting dev server…</span>
		</div>
		<iframe
			v-if="iframeUrl"
			:key="reloadKey"
			:src="iframeUrl"
			class="preview-iframe"
			:style="{ pointerEvents: isResizing ? 'none' : 'auto' }"
		/>
	</div>
</template>

<style scoped>
.preview-panel {
    height: 100%;
    background-color: white;
    position: relative;
}

.preview-placeholder {
    position: absolute;
    top: 0; right: 0; bottom: 0; left: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #6b7280;
    background-color: #1e1e1e;
}

.preview-iframe {
    width: 100%;
    height: 100%;
    border-style: none;
}
</style>
