import { writeFile } from 'node:fs/promises'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { cancel, intro, isCancel, outro, text } from '@clack/prompts'
import { join } from 'pathe'
import { $ } from 'zx'

intro('Create a new package')

const pkgDirname = await text({
	message: 'Package directory name (/packages/<pkgDirname>)',
	validate: (value) => {
		if (!value)
			return 'Required.'
		if (!/^[a-z0-9-]+$/.test(value))
			return 'Only lowercase letters, numbers, and hyphens are allowed.'
		return void 0
	},
})

if (isCancel(pkgDirname)) {
	cancel('Operation cancelled.')
	process.exit(0)
}

const pkgName = await text({
	message: 'Package name (@pikacss/<pkgName>)',
	initialValue: pkgDirname,
	validate: (value) => {
		if (!value)
			return 'Required.'
		if (!/^[a-z0-9-]+$/.test(value))
			return 'Only lowercase letters, numbers, and hyphens are allowed.'
		return void 0
	},
})

if (isCancel(pkgName)) {
	cancel('Operation cancelled.')
	process.exit(0)
}

const root = fileURLToPath(new URL('..', import.meta.url))
const packageDir = join(root, 'packages', pkgDirname)

await $`(rm -rf ${packageDir} || true) \
		&& mkdir -p ${packageDir} \
		&& mkdir -p ${join(packageDir, 'src')} \
		&& mkdir -p ${join(packageDir, 'tests')} \
`

const pkgJson = JSON.parse((await $`cat ${join(root, 'package.json')}`).stdout)

const templates = {
	'package.json': `
{
	"name": "@pikacss/${pkgName}",
	"type": "module",
	"publishConfig": {
		"access": "public"
	},
	"version": "${pkgJson.version}",
	"author": "DevilTea <ch19980814@gmail.com>",
	"license": "MIT",
	"repository": {
		"type": "git",
		"url": "git+https://github.com/DevilTea/pikacss.git",
		"directory": "packages/${pkgDirname}"
	},
	"bugs": {
		"url": "https://github.com/DevilTea/pikacss/issues"
	},
	"keywords": [],
	"exports": {
		".": {
			"import": {
				"types": "./dist/index.d.mts",
				"default": "./dist/index.mjs"
			},
			"require": {
				"types": "./dist/index.d.cts",
				"default": "./dist/index.cjs"
			}
		}
	},
	"main": "dist/index.cjs",
	"module": "dist/index.mjs",
	"types": "dist/index.d.ts",
	"files": [
		"dist"
	],
	"scripts": {
		"build": "unbuild",
		"build:pack": "pnpm build && pnpm pack",
		"stub": "unbuild --stub",
		"typecheck": "pnpm typecheck:package && pnpm typecheck:test",
		"typecheck:package": "tsc --project ./tsconfig.package.json --noEmit",
		"typecheck:test": "tsc --project ./tsconfig.tests.json --noEmit"
	}
}
	`.trim(),
	'build.config.ts': `
import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig({
	entries: ['src/index.ts'],
	declaration: true,
	rollup: {
		dts: {
			tsconfig: './tsconfig.package.json',
			compilerOptions: {
				composite: false,
			},
		},
		emitCJS: true,
	},
})
	`.trim(),
	'src/index.ts': `
export {}
	`.trim(),
	'tests/some.test.ts': `
import { describe, expect, it } from 'vitest'

describe('test hello', () => {
	it('is ok', () => {
		expect(true).toBe(true)
	})
})
	`.trim(),
	'tsconfig.json': `
{
	"references": [
		{ "path": "./tsconfig.package.json" },
		{ "path": "./tsconfig.tests.json" }
	],
	"files": []
}
	`.trim(),
	'tsconfig.package.json': `
{
	"extends": "@deviltea/tsconfig/base",
	"compilerOptions": {
		"composite": true
	},
	"include": [
		"./src/**/*.ts"
	]
}
	`.trim(),
	'tsconfig.tests.json': `
{
	"extends": "@deviltea/tsconfig/node",
	"compilerOptions": {
		"composite": true
	},
	"include": [
		"./src/**/*.ts",
		"./tests/**/*.ts"
	]
}
	`.trim(),
}

for (const [filename, content] of Object.entries(templates)) {
	await writeFile(join(packageDir, filename), `${content}\n`)
}

const rootTsConfig = JSON.parse((await $`cat ${join(root, 'tsconfig.json')}`).stdout)
const pkgTsConfigPath = `./packages/${pkgDirname}/tsconfig.json`
if (rootTsConfig.extends.includes(pkgTsConfigPath) === false) {
	rootTsConfig.extends.push(pkgTsConfigPath)
	await writeFile(join(root, 'tsconfig.json'), `${JSON.stringify(rootTsConfig, null, '\t')}\n`)
}

outro(`Package "${pkgName}" created.`)
