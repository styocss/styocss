import type { AtomicStyle, AtomicStyleContent, EngineConfig, ExtractedAtomicStyleContent, PreflightFn, ResolvedEngineConfig, StyleDefinition, StyleItem } from './types'
import { ATOMIC_STYLE_NAME_PLACEHOLDER, ATOMIC_STYLE_NAME_PLACEHOLDER_RE_GLOBAL } from './constants'
import { createExtractFn, type ExtractFn } from './extractor'
import { hooks, resolvePlugins } from './plugin'
import { important } from './plugins/important'
import { keyframes } from './plugins/keyframes'
import { selectors } from './plugins/selectors'
import { shortcuts } from './plugins/shortcuts'
import { variables } from './plugins/variables'
import { appendAutocompleteCssPropertyValues, appendAutocompleteExtraCssProperties, appendAutocompleteExtraProperties,	appendAutocompletePropertyValues,	appendAutocompleteSelectors,	appendAutocompleteStyleItemStrings,	isNotNullish,	numberToChars,	serialize } from './utils'

export async function createEngine(config: EngineConfig = {}): Promise<Engine> {
	const corePlugins = [
		important(),
		variables(),
		keyframes(),
		selectors(),
		shortcuts(),
	]
	const plugins = resolvePlugins([...corePlugins, ...(config.plugins || [])])
	config.plugins = plugins

	config = await hooks.config(
		config.plugins,
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
		atomicRules: new Map<string, AtomicStyle>(),
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

	async use(...itemList: StyleItem[]): Promise<string[]> {
		const {
			unknown,
			contents,
		} = await resolveStyleItemList({
			itemList,
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

	async renderPreviewStyles(...itemList: StyleItem[]) {
		const nameList = await this.use(...itemList)
		const targets = nameList.map(name => this.store.atomicRules.get(name)).filter(isNotNullish)
		return renderAtomicStyles({
			atomicRules: targets,
			isPreview: true,
		})
	}

	renderStyles() {
		return [
			this.renderPreflights(),
			this.renderAtomicStyles(),
		].join('')
	}

	renderPreflights() {
		return this.config.preflights.map<string>(p => p(this)).join('')
	}

	renderAtomicStyles() {
		return renderAtomicStyles({
			atomicRules: [...this.store.atomicRules.values()],
			isPreview: false,
		})
	}
}

export async function resolveEngineConfig(config: EngineConfig): Promise<ResolvedEngineConfig> {
	const {
		prefix = '',
		defaultSelector = `.${ATOMIC_STYLE_NAME_PLACEHOLDER}`,
		plugins = [],
		preflights = [],
		autocomplete = {},
	} = config

	const resolvedConfig: ResolvedEngineConfig = {
		rawConfig: config,
		plugins: resolvePlugins(plugins),
		prefix,
		defaultSelector,
		preflights: [],
		autocomplete: {
			selectors: new Set(),
			styleItemStrings: new Set(),
			extraProperties: new Set(),
			extraCssProperties: new Set(),
			properties: new Map(),
			cssProperties: new Map(),
		},
	}

	// process preflights
	const resolvedPreflights = preflights.map<PreflightFn>(p => (typeof p === 'function' ? p : () => p))
	resolvedConfig.preflights.push(...resolvedPreflights)

	// process autocomplete
	appendAutocompleteSelectors(resolvedConfig, ...(autocomplete.selectors || []))
	appendAutocompleteStyleItemStrings(resolvedConfig, ...(autocomplete.styleItemStrings || []))
	appendAutocompleteExtraProperties(resolvedConfig, ...(autocomplete.extraProperties || []))
	appendAutocompleteExtraCssProperties(resolvedConfig, ...(autocomplete.extraCssProperties || []))
	autocomplete.properties?.forEach(([property, value]) => appendAutocompletePropertyValues(resolvedConfig, property, ...[value].flat()))
	autocomplete.cssProperties?.forEach(([property, value]) => appendAutocompleteCssPropertyValues(resolvedConfig, property, ...[value].flat()))

	return resolvedConfig
}

export function getAtomicStyleName({
	content,
	prefix,
	stored,
}: {
	content: AtomicStyleContent
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

export function optimizeAtomicStyleContents(list: ExtractedAtomicStyleContent[]) {
	const map = new Map<string, AtomicStyleContent>()
	list.forEach((content) => {
		const key = serialize([content.selector, content.property])

		map.delete(key)

		if (content.value == null)
			return

		map.set(key, content as AtomicStyleContent)
	})
	return [...map.values()]
}

export async function resolveStyleItemList({
	itemList,
	transformStyleItems,
	extractStyleDefinition,
}: {
	itemList: StyleItem[]
	transformStyleItems: (styleItems: StyleItem[]) => Promise<StyleItem[]>
	extractStyleDefinition: (styleObj: StyleDefinition) => Promise<ExtractedAtomicStyleContent[]>
}) {
	const unknown = new Set<string>()
	const list: ExtractedAtomicStyleContent[] = []
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

interface AtomicStyleBlock {
	content: string[]
	children?: AtomicStyleBlocks
}

type AtomicStyleBlocks = Map<string, AtomicStyleBlock>

export function prepareAtomicStyleBlocks({
	atomicRules,
	isPreview,
}: {
	atomicRules: AtomicStyle[]
	isPreview: boolean
}) {
	const blocks: AtomicStyleBlocks = new Map()
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

export function renderAtomicStyleBlocks(blocks: AtomicStyleBlocks) {
	let rendered = ''
	blocks.forEach((block, selector) => {
		rendered += `${selector}{${block.content.join(';')}`
		if (block.children != null)
			rendered += renderAtomicStyleBlocks(block.children)
		rendered += '}'
	})
	return rendered
}

export function renderAtomicStyles(payload: { atomicRules: AtomicStyle[], isPreview: boolean }) {
	const blocks = prepareAtomicStyleBlocks(payload)
	return renderAtomicStyleBlocks(blocks)
}
