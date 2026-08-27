import { defineEnginePlugin } from '../plugin'

function compareStrings(a: string, b: string): number {
	return a < b ? -1 : 1
}

function renderLayerDeclarations(names: readonly string[]): string {
	const literals = [...new Set(names)]
		.sort(compareStrings)
		.map(name => JSON.stringify(name))
	const layerName = [...literals, '(string & {})'].join(' | ')
	return [
		`type __PikaLayerName = ${layerName}`,
		'interface __PikaLayerProperties {',
		'  __layer?: __PikaLayerName',
		'}',
	].join('\n')
}

/** Internal Core owner for the `__layer` authoring directive Typegen surface. */
export function layers() {
	return defineEnginePlugin({
		name: 'core:layers',
		configureEngine(configurator) {
			configurator.typegen.add({
				id: 'core:layers',
				declarations: renderLayerDeclarations(Object.keys(configurator.runtime.config.layers)),
				properties: '__PikaLayerProperties',
			})
		},
	})
}
