import type { _StyleDefinition, _StyleItem, Arrayable, AtomicRule, AtomicRuleContent, ExtractedAtomicRuleContent } from '../types'
import { ATOMIC_STYLE_NAME_PLACEHOLDER, ATOMIC_STYLE_NAME_PLACEHOLDER_RE_GLOBAL } from '../constants'
import { isNotNullish, numberToChars, serialize } from '../utils'
import { type EngineConfig, type ResolvedEngineConfig, resolveEngineConfig } from './config'
import { createExtractFn, type ExtractFn } from './extractor'
import { hooks, resolvePlugins } from './plugin'

export async function createEngine(config: EngineConfig = {}): Promise<Engine> {
	config = await hooks.config(
		resolvePlugins(config.plugins || []),
		config,
	)

	hooks.beforeConfigResolving(
		resolvePlugins(config.plugins || []),
		config,
	)

	let resolvedConfig = await resolveEngineConfig(config)

	resolvedConfig = await hooks.configResolved(
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

	constructor(config: ResolvedEngineConfig) {
		this.config = config

		this.extract = createExtractFn({
			defaultSelector: this.config.defaultSelector,
			transformSelectors: selectors => hooks.transformSelectors(this.config.plugins, selectors),
			transformStyleItems: styleItems => hooks.transformStyleItems(this.config.plugins, styleItems),
			transformStyleDefinitions: styleDefinitions => hooks.transformStyleDefinitions(this.config.plugins, styleDefinitions),
		})
	}

	async use(...itemList: (_StyleItem | [selector: Arrayable<string>, ..._StyleItem[]])[]): Promise<string[]> {
		const {
			unknown,
			contents,
		} = await resolveStyleItemList({
			itemList: normalizeStyleItems(itemList),
			transformStyleItems: styleItems => hooks.transformStyleItems(this.config.plugins, styleItems),
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
				const added = {
					name,
					content,
				}
				this.store.atomicRules.set(name, added)
				hooks.atomicRuleAdded(this.config.plugins)
			}
		})
		return [...unknown, ...resolvedNames]
	}

	async renderPreviewStyles(...itemList: (_StyleItem | [selector: Arrayable<string>, ..._StyleItem[]])[]) {
		const nameList = await this.use(...normalizeStyleItems(itemList))
		const targets = nameList.map(name => this.store.atomicRules.get(name)).filter(isNotNullish)
		return renderAtomicRules({
			atomicRules: targets,
			isPreview: true,
		})
	}

	renderStyles() {
		return [
			this.renderPreflights(),
			this.renderAtomicRules(),
		].join('')
	}

	renderPreflights() {
		return this.config.preflights.map<string>(p => p(this)).join('')
	}

	renderAtomicRules() {
		return renderAtomicRules({
			atomicRules: [...this.store.atomicRules.values()],
			isPreview: false,
		})
	}
}

function normalizeStyleItems(itemList: (_StyleItem | [selector: Arrayable<string>, ..._StyleItem[]])[]): _StyleItem[] {
	return itemList.map((item) => {
		if (Array.isArray(item) === false)
			return item

		const [selector, ...styleItems] = item
		const styleDefinition: _StyleDefinition = {}
		let current = styleDefinition
		Array.from([selector].flat()).forEach((s, index, { length }) => {
			if (index === length - 1) {
				current[s] = styleItems
			}
			else {
				current[s] = {}
				current = current[s]
			}
		})
		return styleDefinition
	})
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

async function resolveStyleItemList({
	itemList,
	transformStyleItems,
	extractStyleDefinition,
}: {
	itemList: _StyleItem[]
	transformStyleItems: (styleItems: _StyleItem[]) => Promise<_StyleItem[]>
	extractStyleDefinition: (styleObj: _StyleDefinition) => Promise<ExtractedAtomicRuleContent[]>
}) {
	const unknown = new Set<string>()
	const list: ExtractedAtomicRuleContent[] = []
	for (const styleItem of await transformStyleItems(itemList)) {
		if (typeof styleItem === 'string')
			unknown.add(styleItem)
		else
			list.push(...await extractStyleDefinition(styleItem))
	}
	return {
		unknown,
		contents: optimizeAtomicStyleContents(list),
	}
}

interface AtomicRuleBlock {
	content: string[]
	children?: AtomicRuleBlocks
}

type AtomicRuleBlocks = Map<string, AtomicRuleBlock>

function prepareAtomicRuleBlocks({
	atomicRules,
	isPreview,
}: {
	atomicRules: AtomicRule[]
	isPreview: boolean
}) {
	const blocks: AtomicRuleBlocks = new Map()
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

		let currentBlocks = blocks
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
	return blocks
}

function renderAtomicRuleBlocks(blocks: AtomicRuleBlocks) {
	let rendered = ''
	blocks.forEach((block, selector) => {
		rendered += `${selector}{${block.content.join(';')}`
		if (block.children != null)
			rendered += renderAtomicRuleBlocks(block.children)
		rendered += '}'
	})
	return rendered
}

function renderAtomicRules(payload: { atomicRules: AtomicRule[], isPreview: boolean }) {
	const blocks = prepareAtomicRuleBlocks(payload)
	return renderAtomicRuleBlocks(blocks)
}
