import type { TypegenSnapshot } from '@pikacss/core'
import type { IntegrationContext } from './types'
import { log, renderTypegenDocument } from '@pikacss/core'

export interface TypegenCompatibilityBindings {
	readonly snapshot: TypegenSnapshot
	readonly fnName: string
	readonly transformedFormat: 'string' | 'array'
	readonly publicModule: string
	readonly vueTemplateGlobals?: boolean
}

/** @internal */
export function renderTsCodegenContent(bindings: TypegenCompatibilityBindings): string {
	log.debug('Generating TypeScript code generation content')
	const content = renderTypegenDocument([{
		snapshot: bindings.snapshot,
		fnName: bindings.fnName,
		transformedFormat: bindings.transformedFormat,
		publicModule: bindings.publicModule,
		vueTemplateGlobals: bindings.vueTemplateGlobals,
	}])
	log.debug('TypeScript code generation content completed')
	return content
}

/**
 * Renders the current single-entry Integration compatibility declaration from
 * the Engine-finalized Typegen snapshot.
 *
 * @internal
 * @remarks Canonical multi-entry composition/publication is owned by generated-state
 * project runtime. This compatibility renderer deliberately consumes only immutable
 * Engine-finalized Typegen snapshot semantics and never reconstructs Typegen from
 * mutable Engine config/state.
 */
export async function generateTsCodegenContent(ctx: IntegrationContext) {
	return renderTsCodegenContent({
		snapshot: ctx.engine.typegen.snapshot,
		fnName: ctx.fnName,
		transformedFormat: ctx.transformedFormat,
		publicModule: ctx.currentPackageName,
		vueTemplateGlobals: ctx.hasVue,
	})
}
