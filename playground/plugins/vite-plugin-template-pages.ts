import type { Plugin } from 'vite'
import fs from 'node:fs'
import path from 'pathe'

export interface TemplatePagesOptions {
	/** Directory whose sub-folders name the templates, e.g. 'src/templates'. */
	templatesDir: string
	/** Vite base, e.g. '/playground/'. */
	base: string
	/** Template the bare base URL redirects to, e.g. 'solid-ts'. */
	defaultTemplate: string
}

/**
 * Emits a real `index.html` for every template (`dist/<template>/index.html`)
 * and turns the bare `dist/index.html` into a redirect to the default template.
 *
 * The playground selects its template from the path (`/playground/<template>`),
 * but GitHub Pages is a static file server with no SPA fallback, so those paths
 * 404 unless the files physically exist (Vite dev/preview hide this because they
 * do fall back to index.html). The per-template pages share the one app
 * bundle; only the relative public-asset refs (`./vite.svg`,
 * `./coi-serviceworker.min.js`) are rewritten to base-absolute so they still
 * resolve from the sub-path.
 */
export function templatePagesPlugin(options: TemplatePagesOptions): Plugin {
	return {
		name: 'vite-plugin-template-pages',
		apply: 'build',
		closeBundle() {
			const distDir = path.resolve('dist')
			const indexPath = path.join(distDir, 'index.html')
			if (!fs.existsSync(indexPath))
				return

			const appHtml = fs.readFileSync(indexPath, 'utf-8')
				.replaceAll('"./', `"${options.base}`)

			const templatesDir = path.resolve(options.templatesDir)
			const templates = fs.readdirSync(templatesDir)
				.filter(name => fs.statSync(path.join(templatesDir, name))
					.isDirectory())

			for (const template of templates) {
				fs.mkdirSync(path.join(distDir, template), { recursive: true })
				fs.writeFileSync(path.join(distDir, template, 'index.html'), appHtml)
			}

			// Preserve query + hash so shared links, `?__generate`, and the
			// lz-string state hash keep working through the redirect.
			const redirect = `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>PikaCSS Playground</title>
<meta http-equiv="refresh" content="0; url=./${options.defaultTemplate}/" />
<script>location.replace('./${options.defaultTemplate}/' + location.search + location.hash)</script>
</head>
<body>Redirecting to the ${options.defaultTemplate} playground…</body>
</html>
`
			fs.writeFileSync(indexPath, redirect)
		},
	}
}
