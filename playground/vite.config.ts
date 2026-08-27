import pikacss from '@pikacss/unplugin-pikacss/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import { templatePagesPlugin } from './plugins/vite-plugin-template-pages'
import { vfsPlugin } from './plugins/vite-plugin-vfs'

const BASE = '/playground/'
const DEFAULT_TEMPLATE = 'solid-ts'

// WebContainer needs cross-origin isolation; serve COOP/COEP locally (dev +
// preview). GitHub Pages can't send these, so coi-serviceworker injects them.
const CROSS_ORIGIN_ISOLATION_HEADERS = {
	'Cross-Origin-Embedder-Policy': 'require-corp',
	'Cross-Origin-Opener-Policy': 'same-origin',
}

/**
 * Resolves the latest published version of a package from the npm registry.
 * Returns null on any failure so callers can fall back to the versions
 * pinned in the template package.json files.
 */
async function fetchLatestVersion(packageName: string): Promise<string | null> {
	try {
		const response = await fetch(
			`https://registry.npmjs.org/${packageName}/latest`,
			{ signal: AbortSignal.timeout(10_000) },
		)
		if (!response.ok)
			return null
		const data = await response.json() as { version?: unknown }
		return typeof data.version === 'string' ? data.version : null
	}
	catch {
		return null
	}
}

// https://vite.dev/config/
export default defineConfig(async () => {
	// Templates run inside the WebContainer against the npm registry, so
	// their PikaCSS dependency is rewritten to the latest published release
	// at build time (falling back to the pinned version when offline).
	const latestPikaVersion = await fetchLatestVersion('@pikacss/unplugin-pikacss')
	if (latestPikaVersion == null)
		console.warn('[playground] Could not resolve the latest @pikacss/unplugin-pikacss version; templates keep their pinned versions.')

	return {
		// Deployed under https://pikacss.github.io/playground/ next to the docs.
		base: BASE,
		plugins: [
			pikacss(),
			vue(),
			vfsPlugin({
				dir: './src/templates',
				dependencyVersions: latestPikaVersion == null
					? undefined
					: { '@pikacss/unplugin-pikacss': `^${latestPikaVersion}` },
			}),
			// GitHub Pages has no SPA fallback, so emit a real index.html per
			// template and redirect the bare base to the default one.
			templatePagesPlugin({ templatesDir: './src/templates', base: BASE, defaultTemplate: DEFAULT_TEMPLATE }),
		],
		resolve: {
			dedupe: ['vue'],
		},
		optimizeDeps: {
			// monaco-editor is pure ESM and must NOT be pre-bundled: esbuild
			// optimization turns each deep worker import (editor.worker.js,
			// tsWorker.js) into a separate bundle with its own copy of monaco's
			// worker bootstrap, and the duplicated `webWorkerServer` module state
			// kills every custom worker at the init handshake ("Cannot access
			// 'webWorkerServer' before initialization" / "already initialized").
			exclude: ['monaco-editor'],
		},
		worker: {
			// Vite 8 defaults to iife; the Volar vue worker's dependency graph
			// (typescript + @vue/language-service) needs ESM. Monaco's own
			// workers build fine as ES modules too (dev always serves them as
			// module workers already).
			format: 'es' as const,
		},
		server: {
			headers: CROSS_ORIGIN_ISOLATION_HEADERS,
		},
		preview: {
			headers: CROSS_ORIGIN_ISOLATION_HEADERS,
		},
	}
})
