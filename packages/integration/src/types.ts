import type { Engine, EngineConfig } from '@pikacss/core'
import type { SourceMap } from 'magic-string'
import type { createEventHook } from './eventHook'

export interface UsageRecord {
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
	transformedFormat: 'string' | 'array' | 'inline'
	devCssFilepath: string
	tsCodegenFilepath: string | null
	hasVue: boolean
	usages: Map<string, UsageRecord[]>
	hooks: {
		styleUpdated: ReturnType<typeof createEventHook<void>>
		tsCodegenUpdated: ReturnType<typeof createEventHook<void>>
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
	writeTsCodegenFile: () => Promise<void>
}

export interface IntegrationContextOptions {
	cwd: string
	currentPackageName: string
	target: string[]
	configOrPath: EngineConfig | string | null | undefined
	fnName: string
	transformedFormat: 'string' | 'array' | 'inline'
	tsCodegen: false | string
	devCss: string
	autoCreateConfig: boolean
}
