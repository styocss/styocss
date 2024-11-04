import { writeFile } from 'node:fs/promises'
import { createStyoEngine } from '@styocss/core'
import { join } from 'pathe'
import { VIRTUAL_STYO_CSS_ID } from '../constants'
import type { PluginOptions, StyoPluginContext } from './types'
import { generateDtsContent } from './dtsGenerator'

const defaultTransformTsToJsFn: NonNullable<PluginOptions['_transformTsToJs']> = tsCode => tsCode

export function resolveId(id: string) {
	if (id === VIRTUAL_STYO_CSS_ID)
		return id

	return null
}

let ctxId = 0

export function createCtx(options?: PluginOptions) {
	const {
		extensions = ['.vue', '.tsx', '.jsx'],
		config,
		styoFnName = 'styo',
		transformedFormat = 'array',
		_transformTsToJs: transformTsToJs = defaultTransformTsToJsFn,
		_currentPackageName: currentPackageName = '@styocss/vite-plugin-styocss',
	} = options || {}

	const ctx: StyoPluginContext = {
		id: ctxId++,
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
		usages: new Map(),
		resolvedDtsPath: null,
		hasVue: false,
		async generateDts() {
			if (this.resolvedDtsPath === null)
				return

			const dtsContent = await generateDtsContent(this)
			await writeFile(this.resolvedDtsPath, dtsContent)
			const indexDtsContent = Array.from({ length: ctx.id }, (_, i) => `\/\/\/ <reference path="./styo-${i}.d.ts" />`)
			indexDtsContent.push(`export {}`)
			await writeFile(join(this.resolvedDtsPath, '../index.d.ts'), indexDtsContent.join('\n'))
		},
		transformTsToJs,
		currentPackageName,
	}

	return ctx
}
