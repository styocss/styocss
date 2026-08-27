const CONFIG_INDEX_SPECIFIER = new URL('../../config/src/index.ts', import.meta.url).pathname

export function projectConfigSource(projectBody = '{}'): string {
	return [
		`import { defineConfig } from ${JSON.stringify(CONFIG_INDEX_SPECIFIER)}`,
		`export default defineConfig(${projectBody})`,
		'',
	].join('\n')
}

export function engineProjectConfigSource(engineBody = '{}'): string {
	return projectConfigSource(`{ engine: ${engineBody} }`)
}
