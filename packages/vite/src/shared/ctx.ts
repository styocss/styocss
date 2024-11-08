import type { StyoEngine } from '@styocss/core'
import { createEventHook, createStyoEngine } from '@styocss/core'
import { VIRTUAL_STYO_CSS_ID } from '../constants'
import type { PluginOptions, StyoPluginContext, StyoUsage } from './types'

const defaultTransformTsToJsFn: NonNullable<PluginOptions['transformTsToJs']> = tsCode => tsCode

export function resolveId(id: string) {
	if (id === VIRTUAL_STYO_CSS_ID)
		return id

	return null
}

class _StyoPluginContext implements StyoPluginContext {
	currentPackageName: string
	transformTsToJs: (jsCode: string) => Promise<string> | string
	engine: StyoEngine<string, string, string>
	needToTransform: (id: string) => boolean
	styoFnNames: { normal: string, normalpreview: string, forceString: string, forceStringPreview: string, forceArray: string, forceArrayPreview: string, forceInline: string, forceInlinePreview: string }
	transformedFormat: 'string' | 'array' | 'inline'
	dts: string | false
	resolvedDtsPath: string | null
	hasVue: boolean
	usages: Map<string, StyoUsage[]>
	hooks: { updateDts: ReturnType<typeof createEventHook<void>> }
	isReady: Promise<void>
	ready!: () => void

	constructor(pluginOptions: PluginOptions) {
		const {
			extensions = ['.vue', '.tsx', '.jsx'],
			config,
			styoFnName = 'styo',
			transformedFormat = 'array',
			dts = false,
			transformTsToJs = defaultTransformTsToJsFn,
			currentPackageName = '@styocss/vite-plugin-styocss',
		} = pluginOptions

		this.currentPackageName = currentPackageName
		this.transformTsToJs = transformTsToJs
		this.engine = createStyoEngine(config)
		this.needToTransform = id => extensions.some(ext => id.endsWith(ext))
		this.styoFnNames = {
			normal: styoFnName,
			normalpreview: `${styoFnName}p`,
			forceString: `${styoFnName}Str`,
			forceStringPreview: `${styoFnName}pStr`,
			forceArray: `${styoFnName}Arr`,
			forceArrayPreview: `${styoFnName}pArr`,
			forceInline: `${styoFnName}Inl`,
			forceInlinePreview: `${styoFnName}pInl`,
		}
		this.transformedFormat = transformedFormat
		this.dts = dts === true ? 'styo.d.ts' : dts
		this.resolvedDtsPath = null
		this.hasVue = false
		this.usages = new Map()
		this.hooks = {
			updateDts: createEventHook(),
		}

		this.isReady = new Promise((resolve) => {
			this.ready = resolve
		})
	}
}

export function createCtx(options: PluginOptions) {
	return new _StyoPluginContext(options)
	// const {
	// 	extensions = ['.vue', '.tsx', '.jsx'],
	// 	config,
	// 	styoFnName = 'styo',
	// 	transformedFormat = 'array',
	// 	dts = false,
	// 	transformTsToJs = defaultTransformTsToJsFn,
	// 	currentPackageName = '@styocss/vite-plugin-styocss',
	// } = options || {}

	// const ctx: StyoPluginContext = {
	// 	viteConfig,
	// 	engine: createStyoEngine(config),
	// 	needToTransform(id) {
	// 		return extensions.some(ext => id.endsWith(ext))
	// 	},
	// 	styoFnNames: {
	// 		normal: styoFnName,
	// 		normalpreview: `${styoFnName}p`,
	// 		forceString: `${styoFnName}Str`,
	// 		forceStringPreview: `${styoFnName}pStr`,
	// 		forceArray: `${styoFnName}Arr`,
	// 		forceArrayPreview: `${styoFnName}pArr`,
	// 		forceInline: `${styoFnName}Inl`,
	// 		forceInlinePreview: `${styoFnName}pInl`,
	// 	},
	// 	transformedFormat,
	// 	usages: new Map(),
	// 	dts: dts === true ? 'styo.d.ts' : dts,
	// 	resolvedDtsPath: null,
	// 	hasVue: isPackageExists('vue', { paths: [viteConfig.root] }),
	// 	transformTsToJs,
	// 	currentPackageName,
	// 	hooks: {
	// 		updateDts: createEventHook(),
	// 	},
	// }

	// if (ctx.dts !== false) {
	// 	const normalizedDts = normalizePath(ctx.dts)
	// 	ctx.resolvedDtsPath = isAbsolute(normalizedDts)
	// 		? normalizedDts
	// 		: join(viteConfig.root, normalizedDts)
	// }

	// return ctx
}
