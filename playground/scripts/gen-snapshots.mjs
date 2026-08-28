// Generates the static dependency snapshots that make the *first* playground
// visit fast for everyone.
//
// WebContainer only runs in a browser, and its `spawn` only works inside the
// full app (not a stripped-down page), so we drive the built playground in a
// headless Chromium: for each template we open `?__generate&template=<name>`,
// which runs a fresh `npm install` and exposes the gzip of
// `webcontainer.export('.', { format: 'binary' })` on `window.__pikaSnapshot`.
// The result is WebContainer's own filesystem (its WASM-swapped rollup/esbuild),
// which is the only thing that re-mounts correctly — a host `npm install` does
// not (see playground/README.md).
//
// Run after `pnpm build`. Output: dist/snapshots/<template>.bin + manifest.json.

import { Buffer } from 'node:buffer'
import fs from 'node:fs'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import path from 'pathe'
import { chromium } from 'playwright'
import { preview } from 'vite'

const root = path.resolve(fileURLToPath(import.meta.url), '../..')
const templates = ['solid-ts', 'vue-ts', 'react-ts']
const PER_TEMPLATE_TIMEOUT = 5 * 60 * 1000

async function main() {
	const outDir = path.join(root, 'dist', 'snapshots')
	if (!fs.existsSync(path.join(root, 'dist', 'index.html')))
		throw new Error('dist/ not found — run `pnpm build` first.')
	fs.mkdirSync(outDir, { recursive: true })

	// Serve the built app with the COOP/COEP headers WebContainer needs
	// (vite.config.ts → preview.headers).
	const server = await preview({ root, preview: { host: '127.0.0.1' } })
	const base = server.resolvedUrls.local[0].replace(/\/$/, '')
	const browser = await chromium.launch()

	const manifest = {}
	try {
		for (const template of templates) {
			process.stdout.write(`[gen-snapshots] ${template}: installing in WebContainer…\n`)
			// Fresh context per template so each gets its own WebContainer.
			const context = await browser.newContext()
			const page = await context.newPage()
			page.on('console', msg => process.stdout.write(`  [page:${template}] ${msg.text()
				.slice(0, 120)}\n`))
			try {
				// Go straight to the template's own page (the bare base redirects).
				await page.goto(`${base}/${template}/?__generate`, { waitUntil: 'load' })
				await page.waitForFunction(() => (window.__pikaSnapshot)?.done === true, null, { timeout: PER_TEMPLATE_TIMEOUT, polling: 1000 })
				const result = await page.evaluate(() => window.__pikaSnapshot)
				if (result.error || !result.base64)
					throw new Error(`generation failed: ${result.error ?? 'no data'}`)
				const bytes = Buffer.from(result.base64, 'base64')
				fs.writeFileSync(path.join(outDir, `${template}.bin`), bytes)
				manifest[template] = { file: `${template}.bin`, bytes: bytes.length }
				process.stdout.write(`[gen-snapshots] ${template}: wrote ${(bytes.length / 1024 / 1024).toFixed(1)} MB\n`)
			}
			finally {
				await context.close()
			}
		}
		fs.writeFileSync(path.join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
	}
	finally {
		await browser.close()
		await server.close()
	}
}

main()
	.catch((error) => {
		process.stderr.write(`[gen-snapshots] failed: ${error?.stack || error}\n`)
		process.exit(1)
	})
