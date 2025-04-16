/* eslint-disable antfu/no-top-level-await */

import { z } from 'genaiscript/runtime'

script({
	model: 'github_copilot_chat:gpt-4o',
})

const targetFiles = await workspace.findFiles('./packages/core/src/**/*.ts')

const { json } = await runPrompt((ctx) => {
	ctx.def('SOURCE_FILES', targetFiles)
	ctx.defSchema('SORT_RESULT_SCHEMA', z.array(z.string()).length(targetFiles.length))
	ctx.$`根據撰寫 unit test 的需求，將檔案進行排序，並且將排序後的 filename 輸出並符合 SORT_RESULT_SCHEMA 此 zod schema 驗證格式`
})
const sortResult = json as string[]
const sortedFiles = targetFiles.sort((a, b) => {
	const aIndex = sortResult.indexOf(a.filename)
	const bIndex = sortResult.indexOf(b.filename)
	return aIndex - bIndex
})

const queue = host.promiseQueue(3)
await queue.mapAll(
	sortedFiles,
	async (file) => {
		const outputFilename = file.filename.replace('/src/', '/tests/unit/').replace('.ts', '.test.ts')
		const outputFile = await workspace.findFiles(outputFilename)[0]
		if (outputFile != null) {
			return
		}

		await runPrompt((ctx) => {
			ctx.def('FILE_INPUT', file)
			ctx.$`
			1. Generate a unit test file for FILE_INPUT (ensure test coverage is 100% or close to 100%)
				- If the source file is type-only, include only a single line comment "This file contains type-only definitions, so no runtime tests are necessary." in the test file
				- Write all test descriptions, explanations, and comments in English
				- Use vitest as the testing framework
			2. Save to a file
			`
			ctx.defFileOutput(file.filename.replace('/src/', '/tests/unit/').replace('.ts', '.test.ts'), 'the generated file')
		}, {
			system: ['system.files'],
		})
	},
)
