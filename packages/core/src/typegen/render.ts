import type { TypegenSnapshot, TypegenSnapshotContribution } from './snapshot'

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
}

function joinRefs(contributions: readonly TypegenSnapshotContribution[], key: 'selectors' | 'properties' | 'cssProperties' | 'cssPropertyValues' | 'propertyConstraints'): string {
	const refs = contributions.flatMap(contribution => contribution[key] == null ? [] : [contribution[key]])
	return refs.length === 0 ? 'never' : refs.join(' | ')
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
	const declarations = contributions.flatMap(contribution => contribution.declarations == null ? [] : [contribution.declarations])
	const resultType = unit.transformedFormat === 'array' ? 'string[]' : 'string'
	const selectors = joinRefs(contributions, 'selectors')
	const properties = joinRefs(contributions, 'properties')
	const cssProperties = joinRefs(contributions, 'cssProperties')
	const cssPropertyValues = joinRefs(contributions, 'cssPropertyValues')
	const propertyConstraints = joinRefs(contributions, 'propertyConstraints')
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
			'  type __KeysOfUnion<T> = T extends unknown ? keyof T : never',
			'  type __ValueByKey<T, K extends PropertyKey> = T extends unknown ? K extends keyof T ? T[K] : never : never',
			`  type __SelectorContributions = ${selectors}`,
			`  type __PropertyContributions = ${properties}`,
			`  type __CssPropertyContributions = ${cssProperties}`,
			`  type __CssPropertyValueContributions = ${cssPropertyValues}`,
			`  type __PropertyConstraints = ${propertyConstraints}`,
			'  type __CssPropertyValueOverlay = {',
			'    [K in Extract<__KeysOfUnion<__CssPropertyValueContributions>, string>]?:',
			`      import(${moduleName}).PropertyValue<import(${moduleName}).UnionString | __ValueByKey<__CssPropertyValueContributions, K>>`,
			'  }',
			`  type __Properties = import(${moduleName}).Properties`,
			'    & __Additive<__PropertyContributions>',
			'    & __Additive<__CssPropertyContributions>',
			'    & __CssPropertyValueOverlay',
			'    & __Additive<__PropertyConstraints>',
			`  type __OpenSelector = import(${moduleName}).CSSSelector | (string & {})`,
			'  type __StyleDefinitionMapBase = {',
			'    [K in __OpenSelector]?:',
			`      | import(${moduleName}).PropertyValue<import(${moduleName}).UnionString>`,
			'      | __Properties',
			'      | __StyleDefinition',
			'      | __StyleItem[]',
			'      | undefined',
			'  }',
			'  type __StyleDefinitionMap = __StyleDefinitionMapBase & __Additive<__SelectorContributions>',
			'  type __StyleDefinition = __Properties | __StyleDefinitionMap',
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
