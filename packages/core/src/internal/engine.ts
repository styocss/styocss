import { createEventHook, isNotNullish, numberToChars, serialize } from './utils'
import type { AtomicRule, AtomicRuleContent, ExtractedAtomicRuleContent, StyleDefinition, StyleItem } from './types'
import { ATOMIC_STYLE_NAME_PLACEHOLDER, ATOMIC_STYLE_NAME_PLACEHOLDER_RE_GLOBAL } from './constants'
import { type ExtractFn, createExtractFn } from './extractor'
import { type EngineConfig, type PreflightFn, type ResolvedEngineConfig, resolveEngineConfig } from './config'
import { pluginHooks, resolvePlugins } from './plugin'

export async function createEngine(config: EngineConfig = {}): Promise<Engine> {
	await pluginHooks.config(
		await resolvePlugins(config.plugins ?? []),
		config,
	)

	const resolvedConfig = await resolveEngineConfig(config)

	await pluginHooks.configResolved(
		resolvedConfig.plugins,
		resolvedConfig,
	)

	return new Engine(resolvedConfig)
}

export class Engine {
	config: ResolvedEngineConfig

	extract: ExtractFn

	store = {
		atomicNames: new Map<string, string>(),
		atomicRules: new Map<string, AtomicRule>(),
	}

	hooks = {
		atomicStyleAdded: createEventHook<AtomicRule>(),
	}

	constructor(config: ResolvedEngineConfig) {
		this.config = config

		this.extract = createExtractFn({
			defaultSelector: this.config.defaultSelector,
			transformSelectors: selectors => pluginHooks.transformSelectors(this.config.plugins, selectors),
			transformStyleDefinitions: styleDefinitions => pluginHooks.transformStyleDefinitions(this.config.plugins, styleDefinitions),
		})
	}

	use(...itemList: StyleItem[]): string[] {
		const {
			unknown,
			contents,
		} = resolveStyleItemList({
			itemList,
			transformStyleItems: styleItems => pluginHooks.transformStyleItems(this.config.plugins, styleItems),
			extractStyleDefinition: styleDefinition => this.extract(styleDefinition),
		})
		const resolvedNames: string[] = []
		contents.forEach((content) => {
			const name = getAtomicStyleName({
				content,
				prefix: this.config.prefix,
				stored: this.store.atomicNames,
			})
			resolvedNames.push(name)
			if (!this.store.atomicRules.has(name)) {
				const registered = {
					name,
					content,
				}
				this.store.atomicRules.set(
					name,
					registered,
				)
				this.hooks.atomicStyleAdded.trigger(registered)
			}
		})
		return [...unknown, ...resolvedNames]
	}

	previewStyles(...itemList: StyleItem[]) {
		const nameList = this.use(...itemList)
		const targets = nameList.map(name => this.store.atomicRules.get(name)).filter(isNotNullish)
		return renderAtomicRules({
			atomicRules: targets,
			isPreview: true,
		})
	}

	renderStyles() {
		const renderedPreflights = renderPreflights({
			preflights: this.config.preflights,
			engine: this,
		})
		const renderedAtomicRules = renderAtomicRules({
			atomicRules: [...this.store.atomicRules.values()],
			isPreview: false,
		})
		const result = (
			renderedAtomicRules === ''
				? []
				: [
						'\n/* StyoCSS Start */\n',
						renderedPreflights,
						renderedAtomicRules,
						'\n/* StyoCSS End */\n',
					]
		).join('').trim()
		return result
	}
}

function getAtomicStyleName({
	content,
	prefix,
	stored,
}: {
	content: AtomicRuleContent
	prefix: string
	stored: Map<string, string>
}) {
	const key = serialize([content.selector, content.property, content.value])
	const cached = stored.get(key)
	if (cached != null)
		return cached

	const num = stored.size
	const name = `${prefix}${numberToChars(num)}`
	stored.set(key, name)
	return name
}

function optimizeAtomicStyleContents(list: ExtractedAtomicRuleContent[]) {
	const map = new Map<string, AtomicRuleContent>()
	list.forEach((content) => {
		const key = serialize([content.selector, content.property])

		map.delete(key)

		if (content.value == null)
			return

		map.set(key, content as AtomicRuleContent)
	})
	return [...map.values()]
}

function resolveStyleItemList({
	itemList,
	transformStyleItems,
	extractStyleDefinition,
}: {
	itemList: StyleItem[]
	transformStyleItems: (styleItems: StyleItem[]) => StyleItem[]
	extractStyleDefinition: (styleObj: StyleDefinition) => ExtractedAtomicRuleContent[]
}) {
	const unknown = new Set<string>()
	const list: ExtractedAtomicRuleContent[] = []
	transformStyleItems(itemList)
		.forEach((styleItem) => {
			if (typeof styleItem === 'string')
				unknown.add(styleItem)
			else
				list.push(...extractStyleDefinition(styleItem))
		})
	return {
		unknown,
		contents: optimizeAtomicStyleContents(list),
	}
}

interface RenderBlock {
	content: string[]
	children?: RenderBlocks
}

type RenderBlocks = Map<string, RenderBlock>

function prepareRenderBlocks({
	atomicRules,
	isPreview,
}: {
	atomicRules: AtomicRule[]
	isPreview: boolean
}) {
	const renderBlocks: RenderBlocks = new Map()
	atomicRules.forEach(({ name, content: { selector, property, value } }) => {
		const isValidSelector = selector.some(s => s.includes(ATOMIC_STYLE_NAME_PLACEHOLDER))
		if (isValidSelector === false || value == null)
			return

		const renderObject = {
			selector: isPreview
			// keep the placeholder
				? selector
			// replace the placeholder with the real name
				: selector.map(s => s.replace(ATOMIC_STYLE_NAME_PLACEHOLDER_RE_GLOBAL, name)),
			content: Array.isArray(value)
			// fallback values
				? value.map(v => `${property}:${v}`).join(';')
			// single value
				: `${property}:${value}`,
		}

		let currentBlocks = renderBlocks
		for (let i = 0; i < renderObject.selector.length; i++) {
			const s = renderObject.selector[i]!
			const block = currentBlocks.get(s) || { content: [] }

			const isLast = i === renderObject.selector.length - 1
			if (isLast) {
				block.content.push(renderObject.content)
			}
			else {
				block.children ||= new Map()
			}

			currentBlocks.set(s, block)

			if (isLast === false)
				currentBlocks = block.children!
		}
	})
	return renderBlocks
}

function renderBlocks(blocks: RenderBlocks) {
	let rendered = ''
	blocks.forEach((block, selector) => {
		rendered += `${selector}{${block.content.join(';')}`
		if (block.children != null)
			rendered += renderBlocks(block.children)
		rendered += '}'
	})
	return rendered
}

function renderAtomicRules(payload: { atomicRules: AtomicRule[], isPreview: boolean }) {
	const blocks = prepareRenderBlocks(payload)
	return renderBlocks(blocks)
}

function renderPreflights({
	preflights,
	engine,
}: {
	preflights: PreflightFn[]
	engine: Engine
}) {
	return preflights.map<string>(p => p(engine)).join('')
}
