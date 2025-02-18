import type { Engine, EngineConfig } from '@styocss/core'
import type { SourceMap } from 'magic-string'
import type { createEventHook } from './eventHook'

export interface UsageRecord {
	isPreview: boolean
	params: Parameters<Engine['use']>
}

export interface FnUtils {
	isNormal: (fnName: string) => boolean
	isForceString: (fnName: string) => boolean
	isForceArray: (fnName: string) => boolean
	isForceInline: (fnName: string) => boolean
	isPreview: (fnName: string) => boolean
	RE: RegExp
}

export interface IntegrationContext {
	cwd: string
	currentPackageName: string
	fnName: string
	fnUtils: FnUtils
	previewEnabled: boolean
	transformedFormat: 'string' | 'array' | 'inline'
	devCssFilepath: string
	dtsFilepath: string | null
	hasVue: boolean
	usages: Map<string, UsageRecord[]>
	hooks: {
		styleUpdated: ReturnType<typeof createEventHook<void>>
		dtsUpdated: ReturnType<typeof createEventHook<void>>
	}
	loadConfig: () => Promise<
		| { config: EngineConfig, file: null }
		| { config: null, file: null }
		| { config: EngineConfig, file: string }
	>
	init: () => Promise<any>
	isReady: boolean
	configSources: string[]
	resolvedConfigPath: string | null
	engine: Engine
	transform: (code: string, id: string) => Promise<{ code: string, map: SourceMap } | undefined>
	writeDevCssFile: () => Promise<void>
	writeDtsFile: () => Promise<void>
}

export interface IntegrationContextOptions {
	cwd: string
	currentPackageName: string
	target: string[]
	configOrPath: EngineConfig | string | undefined
	fnName: string
	previewEnabled: boolean
	transformedFormat: 'string' | 'array' | 'inline'
	dts: false | string
	devCss: string | null | undefined
}
