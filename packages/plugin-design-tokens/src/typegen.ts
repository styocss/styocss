import type { TypegenContribution } from '@pikacss/core'
import type { TokenIR } from './ir'
import type { StrictTypeEntry } from './strict-types'
import { renderTypegenJSDoc } from '@pikacss/core'
import { tokenPathToVariableName } from './naming'
import { resolveToken } from './resolve'

interface TokenLeafMetadata {
	readonly reference: string
	readonly descriptions: Set<string>
	readonly valuesByScope: Map<string, Set<string>>
}

interface TokenTreeNode {
	readonly children: Map<string, TokenTreeNode>
	leaf?: TokenLeafMetadata
}

function compareStrings(a: string, b: string): number {
	return a < b ? -1 : a > b ? 1 : 0
}

function tokenScope(ir: TokenIR): string {
	if (ir.themeScope?.media != null)
		return `@media ${ir.themeScope.media}`
	return ir.themeScope?.selector ?? ':root'
}

function getAuthorPath(ir: TokenIR, globalPrefix: string): string[] {
	const prefix = ir.prefix ?? globalPrefix
	return [...(prefix.length > 0 ? [prefix] : []), ...ir.path]
}

function insertToken(root: TokenTreeNode, path: readonly string[], metadata: TokenLeafMetadata): void {
	let node = root
	for (const segment of path) {
		let child = node.children.get(segment)
		if (child == null) {
			child = { children: new Map() }
			node.children.set(segment, child)
		}
		node = child
	}
	if (node.leaf == null) {
		node.leaf = metadata
		return
	}
	for (const description of metadata.descriptions)
		node.leaf.descriptions.add(description)
	for (const [scope, values] of metadata.valuesByScope) {
		const existing = node.leaf.valuesByScope.get(scope) ?? new Set<string>()
		values.forEach(value => existing.add(value))
		node.leaf.valuesByScope.set(scope, existing)
	}
}

function buildTokenTree(irNodes: readonly TokenIR[], globalPrefix: string): TokenTreeNode {
	const root: TokenTreeNode = { children: new Map() }
	for (const ir of irNodes) {
		const effectivePrefix = ir.prefix ?? globalPrefix
		const name = tokenPathToVariableName(ir.path, effectivePrefix)
		const { value } = resolveToken(ir, globalPrefix)
		insertToken(root, getAuthorPath(ir, globalPrefix), {
			reference: `var(${name})`,
			descriptions: new Set(ir.description == null ? [] : [ir.description]),
			valuesByScope: new Map([[tokenScope(ir), new Set([value])]]),
		})
	}
	return root
}

function renderLeafDocumentation(leaf: TokenLeafMetadata, indent: string): string[] {
	const descriptions = [...leaf.descriptions].sort(compareStrings)
	const valueLines = [...leaf.valuesByScope.entries()]
		.sort(([a], [b]) => compareStrings(a, b))
		.flatMap(([scope, values]) => [...values].sort(compareStrings)
			.map(value => `${scope}: ${value}`))
	return renderTypegenJSDoc({
		description: [
			...descriptions,
			`CSS variable reference: ${leaf.reference}`,
			...(valueLines.length > 0
				? [`Resolved values:\n${valueLines.map(line => `- ${line}`)
						.join('\n')}`]
				: []),
		].join('\n\n'),
	}, {}, indent)
}

function renderTokenTypeNode(node: TokenTreeNode, indent: string): string[] {
	const lines = ['{']
	for (const [segment, child] of [...node.children.entries()].sort(([a], [b]) => compareStrings(a, b))) {
		const memberIndent = `${indent}  `
		if (child.leaf != null && child.children.size === 0) {
			lines.push(...renderLeafDocumentation(child.leaf, memberIndent))
			lines.push(`${memberIndent}${JSON.stringify(segment)}: ${JSON.stringify(child.leaf.reference)}`)
			continue
		}
		lines.push(`${memberIndent}${JSON.stringify(segment)}: ${renderTokenTypeNode(child, memberIndent)
			.join(`\n${memberIndent}`)}`)
	}
	lines.push(`${indent}}`)
	return lines
}

function materializeTokenRuntime(node: TokenTreeNode): object {
	const result = Object.create(null) as Record<string, unknown>
	for (const [segment, child] of node.children) {
		result[segment] = child.leaf != null && child.children.size === 0
			? child.leaf.reference
			: materializeTokenRuntime(child)
	}
	return Object.freeze(result)
}

function kebabToCamel(property: string): string {
	return property.replace(/-([a-z])/g, (_, char: string) => char.toUpperCase())
}

const HOIST_STRICT_UNION_MIN_SIZE = 8

function formatTypeUnion(members: readonly string[]): string {
	return members.length > 0 ? members.join(' | ') : 'never'
}

function commonUnionMembers(unions: readonly (readonly string[])[]): string[] {
	const rest = unions.slice(1)
		.map(union => new Set(union))
	return unions[0]!.filter(member => rest.every(set => set.has(member)))
}

function renderStrictConstraints(entries: readonly StrictTypeEntry[]): string | undefined {
	if (entries.length === 0)
		return undefined

	const hoistedUnions = entries.map(entry => entry.union)
		.filter(union => union.length > HOIST_STRICT_UNION_MIN_SIZE)
	const shared = hoistedUnions.length >= 2 ? commonUnionMembers(hoistedUnions) : []
	const sharedSet = new Set(shared)
	const aliasLines: string[] = []
	if (shared.length > 0)
		aliasLines.push(`type __PikaDesignTokenStrictShared = ${formatTypeUnion(shared)}`)

	const aliasByUnion = new Map<string, string>()
	let aliasCount = 0
	const renderValueType = (union: readonly string[]): string => {
		if (union.length <= HOIST_STRICT_UNION_MIN_SIZE)
			return `import("@pikacss/core").PropertyValue<${formatTypeUnion(union)}>`

		const key = union.join('\u0000')
		let alias = aliasByUnion.get(key)
		if (alias == null) {
			alias = `__PikaDesignTokenStrict${aliasCount++}`
			const specific = shared.length > 0 ? union.filter(member => !sharedSet.has(member)) : [...union]
			const members = shared.length > 0 ? [...specific, '__PikaDesignTokenStrictShared'] : specific
			aliasLines.push(`type ${alias} = ${formatTypeUnion(members)}`)
			aliasByUnion.set(key, alias)
		}
		return `import("@pikacss/core").PropertyValue<${alias}>`
	}

	const memberLines: string[] = []
	for (const { property, union } of entries) {
		const valueType = renderValueType(union)
		memberLines.push(`  ${JSON.stringify(property)}?: ${valueType}`)
		const camel = kebabToCamel(property)
		if (camel !== property)
			memberLines.push(`  ${JSON.stringify(camel)}?: ${valueType}`)
	}

	return [
		...aliasLines,
		...(aliasLines.length > 0 ? [''] : []),
		'interface __PikaDesignTokenConstraints {',
		...memberLines,
		'}',
	].join('\n')
}

/** Builds Design Tokens-owned runtime/Typegen surfaces from normalized token state. */
export function buildDesignTokenTypegen(
	irNodes: readonly TokenIR[],
	globalPrefix: string,
	strictEntries: readonly StrictTypeEntry[],
): { runtime: object, contribution: TypegenContribution } {
	const tree = buildTokenTree(irNodes, globalPrefix)
	const tokenType = `type __PikaDesignTokens = ${renderTokenTypeNode(tree, '')
		.join('\n')}`
	const constraints = renderStrictConstraints(strictEntries)
	return {
		runtime: materializeTokenRuntime(tree),
		contribution: {
			id: 'design-tokens',
			declarations: [tokenType, constraints].filter((value): value is string => value != null)
				.join('\n'),
			pika: { tk: '__PikaDesignTokens' },
			...(constraints == null ? {} : { propertyConstraints: '__PikaDesignTokenConstraints' }),
		},
	}
}
