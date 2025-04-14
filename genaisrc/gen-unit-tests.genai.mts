/* eslint-disable antfu/no-top-level-await */
import { z } from 'genaiscript/runtime'

script({
	// model: 'github_copilot_chat:Gemini 2.0 Flash',
	model: 'github_copilot_chat:gpt-4o',
	tools: ['agent_fs'],
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

for (const file of sortedFiles.slice(0, 3)) {
	const outputFilename = file.filename.replace('src', 'tests/unit').replace('.ts', '.test.ts')
	def('SOURCE', file)
	$`
    1. 設計規劃產生 SOURCE 的單元測試檔案內容（測試覆蓋率達 95% 以上）
        - 直接輸出可以直接寫入 typescript code
        - 測試檔案內的測試說明、敘述、註解等等，都使用英文撰寫
        - 使用 vitest 作為測試框架
        - 如果源碼檔案是 type only 的，跳過不產生測試程式碼
    2. 儲存檔案寫入到 ${outputFilename}
    `
	defFileOutput(outputFilename, 'the generated typescript code')
}
