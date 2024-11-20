import type { StyoEngine, StyoEngineConfig, createEventHook } from '@styocss/core'
import type { SourceMap } from 'magic-string'

export interface StyoUsage {
	isPreview: boolean
	params: Parameters<StyoEngine['styo']>
}

export interface StyoPluginContext {
	cwd: string
	currentPackageName: string
	styoFnNames: {
		normal: string
		normalPreview: string
		forceString: string
		forceStringPreview: string
		forceArray: string
		forceArrayPreview: string
		forceInline: string
		forceInlinePreview: string
	}
	transformedFormat: 'string' | 'array' | 'inline'
	devCssFilepath: string
	dtsFilepath: string | null
	hasVue: boolean
	usages: Map<string, StyoUsage[]>
	hooks: {
		styleUpdated: ReturnType<typeof createEventHook<void>>
		dtsUpdated: ReturnType<typeof createEventHook<void>>
	}
	loadConfig: () => Promise<
		| { config: StyoEngineConfig, file: null }
		| { config: null, file: null }
		| { config: StyoEngineConfig, file: string }
	>
	init: () => Promise<any>
	isReady: boolean
	configSources: string[]
	resolvedConfigPath: string | null
	engine: StyoEngine
	transform: (code: string, id: string) => Promise<{ code: string, map: SourceMap } | undefined>
	writeDevCssFile: () => Promise<void>
	writeDtsFile: () => Promise<void>
}

export interface CtxOptions {
	cwd: string
	currentPackageName: string
	extensions: string[]
	configOrPath: StyoEngineConfig | string | undefined
	styoFnName: string
	transformedFormat: 'string' | 'array' | 'inline'
	dts: false | string
	transformTsToJs: (tsCode: string) => Promise<string> | string
}
