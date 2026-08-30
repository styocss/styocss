import type { DirEnt, FileSystemAPI } from '@webcontainer/api'
import { describe, expect, it } from 'vitest'
import {
	isGeneratedWorkspacePath,
	isVisibleWorkspacePath,
	readVisibleWorkspaceTree,
	workspaceTreeHasPath,
} from './useWorkspaceFs'

function entry(name: string, type: 'file' | 'directory'): DirEnt<string> {
	return {
		name,
		isDirectory: () => type === 'directory',
		isFile: () => type === 'file',
	}
}

function createFs(): FileSystemAPI {
	const directories = new Map<string, DirEnt<string>[]>([
		['/', [
			entry('node_modules', 'directory'),
			entry('.git', 'directory'),
			entry('.pikacss', 'directory'),
			entry('src', 'directory'),
			entry('package.json', 'file'),
		]],
		['/.pikacss', [entry('pika.gen.ts', 'file')]],
		['/src', [entry('App.vue', 'file')]],
	])

	return {
		readdir: (async (path: string) => directories.get(path) ?? []) as unknown as FileSystemAPI['readdir'],
	} as FileSystemAPI
}

describe('workspace filesystem projection', () => {
	it('keeps generated state visible while hiding dependency and git roots', async () => {
		const tree = await readVisibleWorkspaceTree(createFs())

		expect(Object.keys(tree))
			.toEqual(['.pikacss', 'src', 'package.json'])
		expect(tree['.pikacss'])
			.toEqual({
				directory: {
					'pika.gen.ts': { file: { contents: '' } },
				},
			})
		expect(tree.src)
			.toEqual({
				directory: {
					'App.vue': { file: { contents: '' } },
				},
			})
		expect(workspaceTreeHasPath('.pikacss/pika.gen.ts', tree))
			.toBe(true)
		expect(workspaceTreeHasPath('.pikacss/missing.ts', tree))
			.toBe(false)
	})

	it('classifies visible and generated paths independently', () => {
		expect(isVisibleWorkspacePath('node_modules/vue/index.d.ts'))
			.toBe(false)
		expect(isVisibleWorkspacePath('/.git/config'))
			.toBe(false)
		expect(isVisibleWorkspacePath('/.pikacss/pika.gen.ts'))
			.toBe(true)
		expect(isVisibleWorkspacePath('src/App.vue'))
			.toBe(true)

		expect(isGeneratedWorkspacePath('.pikacss'))
			.toBe(true)
		expect(isGeneratedWorkspacePath('/.pikacss/pika.gen.ts'))
			.toBe(true)
		expect(isGeneratedWorkspacePath('src/App.vue'))
			.toBe(false)
	})
})
