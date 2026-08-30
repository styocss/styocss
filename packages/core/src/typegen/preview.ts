import type { Engine } from '../engine'
import type { EnginePlugin } from '../plugin'
import type { InternalStyleItem, StyleContent } from '../types'
import { optimizeAtomicStyleContents } from '../atomic-style'
import { resolveStyleItemList } from '../engine'
import { createExtractFn } from '../extractor'
import { createIsolatedPreviewEngineHooks } from '../plugin'

/** Core-private selector pipeline used while materializing deterministic Typegen previews. */
const selectorTransforms = new WeakMap<Engine, (selectors: string[]) => Promise<string[]>>()
const previewHooks = new WeakMap<Engine, Engine['pluginHooks']>()

function getPreviewHooks(engine: Engine): Engine['pluginHooks'] {
	let hooks = previewHooks.get(engine)
	if (hooks == null) {
		hooks = createIsolatedPreviewEngineHooks(engine.pluginHooks)
		previewHooks.set(engine, hooks)
	}
	return hooks
}

/** @internal */
export async function runPreviewSelectorPipeline(
	engine: Engine,
	owner: EnginePlugin,
	selectors: string[],
	override: (selectors: string[]) => Promise<string[]>,
): Promise<string[]> {
	const hooks = getPreviewHooks(engine)
	let current = selectors
	for (const plugin of engine.config.plugins) {
		current = plugin === owner
			? await override(current)
			: await hooks.transformSelectors([plugin], current)
	}
	return current
}

/** @internal */
export async function runPreviewStyleItemPipeline(
	engine: Engine,
	owner: EnginePlugin,
	styleItems: InternalStyleItem[],
	override: (styleItems: InternalStyleItem[]) => Promise<InternalStyleItem[]>,
): Promise<InternalStyleItem[]> {
	const hooks = getPreviewHooks(engine)
	let current = styleItems
	for (const plugin of engine.config.plugins) {
		current = plugin === owner
			? await override(current)
			: await hooks.transformStyleItems([plugin], current)
	}
	return current
}

/** @internal */
export function setPreviewSelectorTransform(engine: Engine, transform: (selectors: string[]) => Promise<string[]>): void {
	selectorTransforms.set(engine, transform)
}

/** @internal */
export function transformPreviewSelectors(engine: Engine, selectors: string[]): Promise<string[]> {
	return selectorTransforms.get(engine)!(selectors)
}

/**
 * Runs the same provisional extraction pipeline as `Engine.prepareUse()`, but with
 * a preview-only shortcut transform and the preview selector transform registered
 * by Core selectors. It never allocates/commits atomic IDs or mutates EngineStore.
 * @internal
 */
export async function preparePreviewUse(
	engine: Engine,
	itemList: InternalStyleItem[],
	transformStyleItems: (styleItems: InternalStyleItem[]) => Promise<InternalStyleItem[]>,
): Promise<StyleContent[]> {
	const hooks = getPreviewHooks(engine)
	const extract = createExtractFn({
		defaultSelector: engine.config.defaultSelector,
		transformSelectors: selectors => transformPreviewSelectors(engine, selectors),
		transformStyleItems,
		transformStyleDefinitions: styleDefinitions => hooks.transformStyleDefinitions(engine.config.plugins, styleDefinitions),
	})
	const { contents } = await resolveStyleItemList({
		itemList,
		transformStyleItems,
		extractStyleDefinition: extract,
	})
	const transformed = await hooks.transformStyleContents(engine.config.plugins, contents)
	return optimizeAtomicStyleContents(transformed)
}
