import { afterEach, describe, expect, it, vi } from 'vitest'

const PIKACSS_HOST_PUBLIC_ENTRY_MODULE = Symbol.for('@pikacss/unplugin-pikacss:public-entry-module')

const addPluginTemplate = vi.fn()
const addVitePlugin = vi.fn()
const defineNuxtModule = vi.fn(definition => definition)
const vitePluginFactory = vi.fn(options => ({
	name: 'pikacss-vite-plugin',
	options,
}))
const preparePikaCSS = vi.fn(async (): Promise<any> => ({
	declarationPath: '/project-root/.pikacss/pika.gen.ts',
}))
const inspectPikaCSSProject = vi.fn(async (): Promise<any> => ({
	projectRoot: '/project-root',
	selectedConfigPath: null,
	authoringForm: 'single' as const,
	entries: [{ fnName: 'pika', cssModule: 'pika.css' }],
}))

vi.mock('@nuxt/kit', () => ({
	addPluginTemplate,
	addVitePlugin,
	defineNuxtModule,
}))

vi.mock('@pikacss/unplugin-pikacss', () => ({
	inspectPikaCSSProject,
	preparePikaCSS,
}))

vi.mock('@pikacss/unplugin-pikacss/vite', () => ({
	default: vitePluginFactory,
}))

function createNuxt() {
	const hooks = new Map<string, (...args: any[]) => unknown>()
	return {
		options: { rootDir: '/project-root' },
		hook: vi.fn((name: string, handler: (...args: any[]) => unknown) => {
			hooks.set(name, handler)
		}),
		hooks,
	}
}

function createPrepareTypesPayload() {
	return {
		references: [] as Array<{ path: string }>,
		nodeReferences: [] as Array<{ path: string }>,
		sharedReferences: [] as Array<{ path: string }>,
		declarations: [] as string[],
		tsConfig: {},
		nodeTsConfig: {},
		sharedTsConfig: {},
	}
}

afterEach(() => {
	addPluginTemplate.mockClear()
	addVitePlugin.mockClear()
	vitePluginFactory.mockClear()
	inspectPikaCSSProject.mockClear()
	preparePikaCSS.mockClear()
})

describe('nuxt module', () => {
	it('registers the runtime plugin template and default Vite integration options', async () => {
		const mod = await import('./index')
		const nuxt = createNuxt()

		await (mod.default as any).setup({}, nuxt as any)

		expect(defineNuxtModule)
			.toHaveBeenCalled()
		expect(addPluginTemplate)
			.toHaveBeenCalledWith(expect.objectContaining({
				filename: 'pikacss.mjs',
			}))
		expect(addPluginTemplate.mock.calls[0]![0].getContents())
			.toContain('import "pika.css";')
		expect(vitePluginFactory)
			.toHaveBeenCalledWith({
				// The Nuxt Vite root is `srcDir`; the module must anchor config
				// discovery and codegen at the project root instead.
				cwd: '/project-root',
				[PIKACSS_HOST_PUBLIC_ENTRY_MODULE]: '@pikacss/nuxt-pikacss',
			})
		expect(addVitePlugin)
			.toHaveBeenCalledWith(expect.objectContaining({
				enforce: 'pre',
				name: 'pikacss-vite-plugin',
			}))
	})

	it('forwards the config path while keeping Nuxt root ownership', async () => {
		const mod = await import('./index')
		const nuxt = createNuxt()

		// `@nuxt/kit` passes inline/layer/config-key merged options as the
		// first setup argument; `nuxt.options.pikacss` alone would miss inline
		// module options.
		await (mod.default as any).setup({
			config: './custom/pika.config.ts',
			cwd: '/custom-root',
		}, nuxt as any)

		expect(inspectPikaCSSProject)
			.toHaveBeenLastCalledWith({
				cwd: '/project-root',
				config: './custom/pika.config.ts',
			})
		expect(vitePluginFactory)
			.toHaveBeenLastCalledWith({
				cwd: '/project-root',
				config: './custom/pika.config.ts',
				[PIKACSS_HOST_PUBLIC_ENTRY_MODULE]: '@pikacss/nuxt-pikacss',
			})
	})
	it('does not auto-import CSS for explicit multi authoring, including one-entry multi', async () => {
		inspectPikaCSSProject.mockResolvedValueOnce({
			projectRoot: '/project-root',
			selectedConfigPath: '/project-root/pika.config.ts',
			authoringForm: 'multi',
			entries: [{ fnName: 'adminPika', cssModule: 'admin.css' }],
		})
		const mod = await import('./index')
		const nuxt = createNuxt()

		await (mod.default as any).setup({}, nuxt as any)

		expect(addPluginTemplate).not.toHaveBeenCalled()
		expect(vitePluginFactory)
			.toHaveBeenCalledWith({
				cwd: '/project-root',
				[PIKACSS_HOST_PUBLIC_ENTRY_MODULE]: '@pikacss/nuxt-pikacss',
			})
	})
	it('prepares and references canonical generated state from the Nuxt prepare:types lifecycle', async () => {
		const mod = await import('./index')
		const nuxt = createNuxt()

		await (mod.default as any).setup({ config: './custom/pika.config.ts' }, nuxt as any)

		expect(preparePikaCSS).not.toHaveBeenCalled()
		expect(nuxt.hook)
			.toHaveBeenCalledWith('prepare:types', expect.any(Function))
		const payload = createPrepareTypesPayload()
		await expect(nuxt.hooks.get('prepare:types')!(payload)).resolves.toBeUndefined()

		expect(preparePikaCSS)
			.toHaveBeenCalledTimes(1)
		expect(preparePikaCSS)
			.toHaveBeenCalledWith({
				cwd: '/project-root',
				config: './custom/pika.config.ts',
				host: { publicEntryModule: '@pikacss/nuxt-pikacss' },
			})
		const reference = { path: '/project-root/.pikacss/pika.gen.ts' }
		expect(payload.references)
			.toEqual([reference])
		expect(payload.nodeReferences)
			.toEqual([reference])
		expect(payload.sharedReferences)
			.toEqual([reference])
	})

	it('propagates prepare failure through prepare:types without publishing a reference', async () => {
		preparePikaCSS.mockRejectedValueOnce(new Error('prepare failed'))
		const mod = await import('./index')
		const nuxt = createNuxt()

		await (mod.default as any).setup({}, nuxt as any)
		const payload = createPrepareTypesPayload()
		await expect(nuxt.hooks.get('prepare:types')!(payload)).rejects.toThrow('prepare failed')
		expect(payload.references)
			.toEqual([])
		expect(payload.nodeReferences)
			.toEqual([])
		expect(payload.sharedReferences)
			.toEqual([])
	})
})
