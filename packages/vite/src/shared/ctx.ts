import { writeFile } from 'node:fs/promises'
import { createStyoEngine } from '@styocss/core'
import { VIRTUAL_STYO_CSS_ID } from '../constants'
import type { PluginOptions, StyoPluginContext } from './types'
import { generateDtsContent } from './dtsGenerator'

const defaultTransformTsToJsFn: NonNullable<PluginOptions['_transformTsToJs']> = tsCode => tsCode

export function resolveId(id: string) {
	if (id === VIRTUAL_STYO_CSS_ID)
		return id

	return null
}

export function createCtx(options?: PluginOptions) {
	const {
		extensions = ['.vue', '.tsx', '.jsx'],
		config,
		styoFnName = 'styo',
		transformedFormat = 'array',
		dts = false,
		_transformTsToJs: transformTsToJs = defaultTransformTsToJsFn,
		_currentPackageName: currentPackageName = '@styocss/vite-plugin-styocss',
	} = options || {}

	const ctx: StyoPluginContext = {
		engine: createStyoEngine(config),
		needToTransform(id) {
			return extensions.some(ext => id.endsWith(ext))
		},
		styoFnNames: {
			normal: styoFnName,
			normalpreview: `${styoFnName}p`,
			forceString: `${styoFnName}Str`,
			forceStringPreview: `${styoFnName}pStr`,
			forceArray: `${styoFnName}Arr`,
			forceArrayPreview: `${styoFnName}pArr`,
			forceInline: `${styoFnName}Inl`,
			forceInlinePreview: `${styoFnName}pInl`,
		},
		transformedFormat,
		dts: dts === true ? 'styo.d.ts' : dts,
		usages: new Map(),
		resolvedDtsPath: null,
		hasVue: false,
		async generateDts() {
			if (
				this.dts === false
				|| this.resolvedDtsPath === null
			) {
				return
			}

			const dtsContent = await generateDtsContent(this)
			await writeFile(this.resolvedDtsPath, dtsContent)
		},
		transformTsToJs,
		currentPackageName,
	}

	return ctx
}
