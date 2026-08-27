import type { TypegenJSDocRenderBindings } from './jsdoc'
import type { TypegenSnapshot, TypegenSnapshotContribution } from './snapshot'
import { renderTypegenContributionDeclarations } from './registry'

/** Output shape of the configured base Pika callable. */
export type TransformedFormat = 'string' | 'array'

/** Host/project binding for one isolated Engine Typegen snapshot. */
export interface TypegenRenderUnit {
	readonly snapshot: TypegenSnapshot
	/** Globally visible configured Pika callable identifier. */
	readonly fnName: string
	/** Runtime transform shape of the base callable. */
	readonly transformedFormat: TransformedFormat
	/** Public package specifier from which Core authoring types are consumed. */
	readonly publicModule: string
	/** Host-bound preview href resolution scoped to this isolated snapshot. */
	readonly hostBindings?: TypegenJSDocRenderBindings
}

function joinRefs(contributions: readonly TypegenSnapshotContribution[], key: 'selectors' | 'properties' | 'cssProperties' | 'cssPropertyValues' | 'propertyConstraints'): string {
	const refs = contributions.flatMap(contribution => contribution[key] == null ? [] : [contribution[key]])
	return refs.length === 0 ? 'never' : refs.join(' | ')
}

function joinIntersectionRefs(contributions: readonly TypegenSnapshotContribution[], key: 'selectors' | 'propertyConstraints'): string {
	const refs = contributions.flatMap(contribution => contribution[key] == null ? [] : [contribution[key]])
	return refs.length === 0 ? '{}' : refs.join(' & ')
}

function compareStrings(a: string, b: string): number {
	return a < b ? -1 : a > b ? 1 : 0
}

function renderPikaMembers(contributions: readonly TypegenSnapshotContribution[]): string[] {
	return contributions
		.flatMap(contribution => Object.entries(contribution.pika ?? {}))
		.sort(([a], [b]) => compareStrings(a, b))
		.map(([root, ref]) => `    ${JSON.stringify(root)}: ${ref}`)
}

function renderUnit(unit: TypegenRenderUnit, index: number): { namespace: string, lines: string[] } {
	const namespace = `__PikaTypegenUnit${index}`
	const contributions = [...unit.snapshot.contributions].sort((a, b) => compareStrings(a.id, b.id))
	const declarations = contributions.flatMap((contribution) => {
		const declarations = renderTypegenContributionDeclarations(unit.snapshot, contribution, unit.hostBindings ?? {})
		return declarations == null ? [] : [declarations]
	})
	const resultType = unit.transformedFormat === 'array' ? 'string[]' : 'string'
	const selectors = joinIntersectionRefs(contributions, 'selectors')
	const properties = joinRefs(contributions, 'properties')
	const cssProperties = joinRefs(contributions, 'cssProperties')
	const cssPropertyValues = joinRefs(contributions, 'cssPropertyValues')
	const propertyConstraints = joinIntersectionRefs(contributions, 'propertyConstraints')
	const pikaMembers = renderPikaMembers(contributions)
	const moduleName = JSON.stringify(unit.publicModule)

	return {
		namespace,
		lines: [
			`declare namespace ${namespace} {`,
			...declarations,
			...(declarations.length === 0 ? [] : ['']),
			'  type __UnionToIntersection<T> = (T extends unknown ? (value: T) => void : never) extends ((value: infer I) => void) ? I : never',
			'  type __Additive<T> = [T] extends [never] ? {} : __UnionToIntersection<T>',
			`  type __SelectorContributions = ${selectors}`,
			`  type __PropertyContributions = ${properties}`,
			`  type __CssPropertyContributions = ${cssProperties}`,
			`  type __CssPropertyValueContributions = ${cssPropertyValues}`,
			`  type __PropertyConstraints = ${propertyConstraints}`,
			`  type __CustomProperties = { [K in \`--\${string}\`]?: import(${moduleName}).TypegenCSSPropertyInputValue<__CssPropertyValueContributions, import(${moduleName}).UnionString, K> }`,
			`  type __Properties = import(${moduleName}).TypegenCSSPropertiesInput<__CssPropertyValueContributions>`,
			`    & import(${moduleName}).TypegenCSSPropertiesHyphenInput<__CssPropertyValueContributions>`,
			'    & __CustomProperties',
			'    & __Additive<__PropertyContributions>',
			'    & __Additive<__CssPropertyContributions>',
			'  interface __StyleDefinitionMapBase {',
			'    [selector: string]:',
			`      | import(${moduleName}).PropertyValue<import(${moduleName}).UnionString>`,
			'      | __StyleDefinition',
			'      | __StyleItem[]',
			'      | undefined',
			'  }',
			'  type __ConstrainedProperties = Omit<__Properties, keyof __PropertyConstraints> & __PropertyConstraints',
			'  type __StyleDefinitionMap = __StyleDefinitionMapBase & __SelectorContributions & __PropertyConstraints',
			'  type __StyleDefinition = __ConstrainedProperties | __StyleDefinitionMap',
			`  type __StyleItem = import(${moduleName}).UnionString | __StyleDefinition`,
			`  type __StyleFn = (...params: __StyleItem[]) => ${resultType}`,
			...(pikaMembers.length === 0
				? ['  export type Pika = __StyleFn']
				: [
						'  type __StaticExtensions = {',
						...pikaMembers,
						'  }',
						'  export type Pika = __StyleFn & __StaticExtensions',
					]),
			'}',
		],
	}
}

/**
 * Renders one collision-safe TypeScript declaration document from isolated
 * finalized Engine Typegen snapshots and explicit project/host bindings.
 */
export function renderTypegenDocument(units: readonly TypegenRenderUnit[]): string {
	const fnNames = new Set<string>()
	const rendered = units.map((unit, index) => {
		if (fnNames.has(unit.fnName))
			throw new Error(`Typegen render unit fnName "${unit.fnName}" is duplicated`)
		fnNames.add(unit.fnName)
		return { unit, ...renderUnit(unit, index) }
	})

	const lines = [
		'// Auto-generated by PikaCSS',
		...rendered.flatMap(({ lines }) => ['', ...lines]),
		'',
		'declare global {',
		...rendered.map(({ namespace, unit }) => `  const ${unit.fnName}: ${namespace}.Pika`),
		'}',
		'',
		'export {}',
		'',
	]
	return lines.join('\n')
}
