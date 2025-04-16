/* eslint-disable antfu/no-top-level-await */
script({
	model: 'github_copilot_chat:gpt-4o',
})

const sourceFiles = await workspace.findFiles('packages/core/src/**/*.ts')

def('SOURCE_FILES', sourceFiles)
$`
請閱讀 <SOURCE_FILES>，並生成一份完整詳細的英文 Markdown 文件。這份文件將作為未來參考與 Retrieval Augmented Generation（RAG）的資料來源。請根據以下要求來組織文件內容：

1. **Library 概述**  
   - 簡述這個 library 的主要功能與設計理念。  
   - 說明核心用途及其優勢。

2. **安裝與配置**  
   - 列出安裝步驟、主要依賴庫以及必要的配置參數。

3. **主要功能與 API 參考**  
   - 列舉 library 中的關鍵模組、函數與類別，並對每一項做簡明介紹。  
   - 如有需要，請展示代表性的代碼片段及其使用說明。  
   - 對於較複雜的函數，請簡要描述其輸入、輸出和內部邏輯。

4. **使用範例**  
   - 提供幾個常見使用情境的範例，包括如何調用主要函數或類別。  
   - 每個範例請使用 Markdown 中的程式碼塊展示代碼，並附上註解說明。

5. **注意事項與最佳實踐**  
   - 列出使用此 library 時必須注意的事項（例如錯誤處理、性能考量等）。  
   - 提供一些最佳實踐或用法建議，幫助使用者更高效地使用此 library。

請使用清晰且符合 Markdown 格式的語法（適當使用標題、列表和程式碼塊），並確保輸出內容簡練明瞭，僅保留專案的核心信息，以便日後快速查找與引用。

最後記得儲存輸出檔案
`
defFileOutput('packages/core/llms-doc.md', 'the generated llms doc file')
