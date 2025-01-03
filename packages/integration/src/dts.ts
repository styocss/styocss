import * as prettier from 'prettier'
import type { IntegrationContext } from './types'

function formatUnionStringType(list: (string | number)[]) {
	return list.length > 0 ? list.map(i => typeof i === 'number' ? i : `'${i}'`).join(' | ') : 'never'
}

async function generateOverloadContent(ctx: IntegrationContext) {
	const paramsLines: string[] = []
	const fnsLines: string[] = []
	const usages = [...ctx.usages.values()].flat().filter(u => u.isPreview)

	for (let i = 0; i < usages.length; i++) {
		const usage = usages[i]!
		paramsLines.push(
			...usage.params.map((param, index) => `type P${i}_${index} = ${JSON.stringify(param)}`),
		)
		fnsLines.push(
			'  /**',
			'   * ### StyoCSS Preview',
			'   * ```css',
			// CSS Lines
			...(await prettier.format(await ctx.engine.previewStyles(...usage.params), { parser: 'css' }))
				.split('\n')
				.map(line => `   * ‎${line.replace(/^(\s*)/, '$1‎')}`),
			'   * ```',
			'   */',
			`  fn(...params: [${usage.params.map((_, index) => `p${index}: P${i}_${index}`).join(', ')}]): ReturnType<StyleFn>`,
		)
	}

	return [
		'interface PreviewOverloads<StyleFn extends (StyleFn_Array | StyleFn_String | StyleFn_Inline)> {',
		...fnsLines,
		'  /**',
		'   * StyoCSS Preview',
		'   * Save the current file to see the preview.',
		'   */',
		`  fn(...params: Parameters<StyleFn>): ReturnType<StyleFn>`,
		'}',
		...paramsLines,
	]
}

export async function generateDtsContent(ctx: IntegrationContext) {
	const {
		engine,
		transformedFormat,
		fnName: styoFnName,
		previewEnabled,
		hasVue,
	} = ctx

	const lines = []
	const autocomplete = engine.config.autocomplete
	lines.push(
		`// Auto-generated by ${ctx.currentPackageName}`,
		`import type { StyleFn } from \'${ctx.currentPackageName}\'`,
		'',
		'interface _Autocomplete {',
		`  Selector: ${formatUnionStringType([...autocomplete.selectors])}`,
		`  StyleItemString: ${formatUnionStringType([...autocomplete.styleItemStrings])}`,
		`  ExtraProperty: ${formatUnionStringType([...autocomplete.extraProperties])}`,
		`  ExtraCssProperty: ${formatUnionStringType([...autocomplete.extraCssProperties])}`,
		`  PropertiesValue: { ${Array.from(autocomplete.properties.entries(), ([k, v]) => `'${k}': ${v.join(' | ')}`).join(',')} }`,
		`  CssPropertiesValue: { ${Array.from(autocomplete.cssProperties.entries(), ([k, v]) => `'${k}': ${formatUnionStringType(v)}`).join(',')} }`,
		'}',
		'',
		'type _StyleFn = StyleFn<_Autocomplete>',
		'',
	)

	if (transformedFormat === 'array') {
		lines.push(
			'type StyleFn_Normal = StyleFn_Array',
		)
	}
	else if (transformedFormat === 'string') {
		lines.push(
			'type StyleFn_Normal = StyleFn_String',
		)
	}
	else if (transformedFormat === 'inline') {
		lines.push(
			'type StyleFn_Normal = StyleFn_Inline',
		)
	}
	lines.push(
		'type StyleFn_Array = (...params: Parameters<_StyleFn>) => string[]',
		'type StyleFn_String = (...params: Parameters<_StyleFn>) => string',
		'type StyleFn_Inline = (...params: Parameters<_StyleFn>) => void',
		'',
		'type Styo = StyleFn_Normal & {',
		'  str: StyleFn_String',
		'  arr: StyleFn_Array',
		'  inl: StyleFn_Inline',
		'}',
		...previewEnabled
			? [
					`type StyoWithPreview = PreviewOverloads<StyleFn_Normal>[\'fn\'] & {`,
					`  str: PreviewOverloads<StyleFn_String>[\'fn\']`,
					`  arr: PreviewOverloads<StyleFn_Array>[\'fn\']`,
					`  inl: PreviewOverloads<StyleFn_Inline>[\'fn\']`,
					'}',
				]
			: [],
		'',
	)

	lines.push(
		'declare global {',
		'  /**',
		'   * StyoCSS',
		'   */',
		`  const ${styoFnName}: Styo`,
		...previewEnabled
			? [
					'',
					'  /**',
					'   * StyoCSS Preview',
					'   */',
					`  const ${styoFnName}p: StyoWithPreview`,
				]
			: [],
		'}',
		'',
	)

	if (hasVue) {
		lines.push(
			'declare module \'vue\' {',
			'  interface ComponentCustomProperties {',
			'    /**',
			'     * StyoCSS',
			'     */',
			`    ${styoFnName}: Styo`,
			...previewEnabled
				? [
						'',
						'    /**',
						'     * StyoCSS Preview',
						'     */',
						`    ${styoFnName}p: StyoWithPreview`,
					]
				: [],
			'  }',
			'}',
			'',
		)
	}

	if (previewEnabled)
		lines.push(...await generateOverloadContent(ctx))

	return lines.join('\n')
}
