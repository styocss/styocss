import type { EngineConfig } from '@pikacss/core'
import { readFile } from 'node:fs/promises'
import { createCtx } from '@pikacss/integration'

type RenderScope = 'full' | 'atomic-only' | 'preflights-and-atomic'

interface RenderExampleOptions {
	config?: EngineConfig
	usageCode: string | string[]
	renderScope?: RenderScope
}

export async function renderExampleCSS(options: RenderExampleOptions): Promise<string> {
	const {
		config,
		usageCode,
		renderScope = 'atomic-only',
	} = options

	const codes = Array.isArray(usageCode) ? usageCode : [usageCode]

	const ctx = createCtx({
		cwd: process.cwd(),
		currentPackageName: '@pikacss/docs-test',
		scan: { include: ['**/*.ts', '**/*.vue'], exclude: [] },
		configOrPath: config ?? {},
		fnName: 'pika',
		transformedFormat: 'string',
		tsCodegen: false,
		autoCreateConfig: false,
	})

	await ctx.setup()

	for (let i = 0; i < codes.length; i++) {
		await ctx.transform(codes[i], `usage-${i}.ts`)
	}

	const engine = ctx.engine

	switch (renderScope) {
		case 'full': {
			const layerDecl = engine.renderLayerOrderDeclaration()
			const preflightsCss = await engine.renderPreflights(true)
			const atomicCss = await engine.renderAtomicStyles(true)
			return [layerDecl, preflightsCss, atomicCss]
				.filter(s => s.trim() !== '')
				.join('\n\n')
				.concat('\n')
		}
		case 'preflights-and-atomic': {
			const preflightsCss = await engine.renderPreflights(true)
			const atomicCss = await engine.renderAtomicStyles(true)
			return [preflightsCss, atomicCss]
				.filter(s => s.trim() !== '')
				.join('\n\n')
				.concat('\n')
		}
		case 'atomic-only': {
			const css = await engine.renderAtomicStyles(true)
			return css ? css.concat('\n') : ''
		}
	}
}

export async function readExampleFile(url: URL): Promise<string> {
	return readFile(url, 'utf-8')
}
