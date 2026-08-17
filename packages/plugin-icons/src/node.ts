import type { WatchableIconCollection } from './watchable'
import { readFile } from 'node:fs/promises'
import process from 'node:process'
import { loadNodeIcon } from '@iconify/utils/lib/loader/node-loader'
import { join } from 'pathe'
import { createIconsPlugin } from './index'
import { defineWatchableIconCollection } from './watchable'

export * from './index'

/**
 * Creates a watchable icon collection backed by one directory of SVG files.
 *
 * @param options - The backing directory and optional file extension.
 * @param options.dir - Directory holding one file per icon; relative paths resolve from the engine host's project root (#118).
 * @param options.extension - File extension appended to the icon name.
 * @returns A watchable collection descriptor for `icons.collections`.
 *
 * @remarks
 * `i-app:home` resolves `<dir>/home.svg`. Contents are read fresh on every
 * resolution — no SVG cache survives an engine re-derivation — and every
 * file is registered as a config dependency before it is read, so editing,
 * deleting, or recreating an icon refreshes the generated CSS through the
 * normal dependency lifecycle.
 *
 * @example
 * ```ts
 * import { fileSystemIconCollection, icons } from '@pikacss/plugin-icons/node'
 *
 * export default defineEngineConfig({
 *   plugins: [icons()],
 *   icons: { collections: { app: fileSystemIconCollection({ dir: './icons' }) } },
 * })
 * ```
 */
export function fileSystemIconCollection(options: { dir: string, extension?: string }): WatchableIconCollection {
	const { dir, extension = '.svg' } = options
	return defineWatchableIconCollection({
		dependencies: ({ name }) => join(dir, `${name}${extension}`),
		source: async (_name, context) => {
			const [filepath] = context.dependencies
			if (filepath == null)
				return undefined
			// Fresh read every time: stale SVG content must not survive an
			// engine re-derivation.
			return await readFile(filepath, 'utf-8')
				.catch(() => undefined)
		},
	})
}

/**
 * Creates the Node.js icons plugin with locally installed Iconify collection loading.
 *
 * @returns An icons plugin configured with the Iconify Node.js loader.
 */
export function icons() {
	return createIconsPlugin({
		loadLocalIcon: (collection, name, options) => loadNodeIcon(collection, name, options),
		shouldLoadLocalIcon: () => !process.env.ESLINT,
	})
}
