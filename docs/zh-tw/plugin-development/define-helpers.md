---
title: Define 輔助函式
description: 為型別安全的 PikaCSS 設定與外掛開發打造的 define 輔助函式。
relatedPackages:
  - '@pikacss/core'
relatedSources:
  - packages/core/src/index.ts
  - packages/core/src/plugin.ts
  - packages/core/src/types/public.ts
  - packages/core/src/plugins/variables.ts
category: plugin-development
order: 40
translation:
  sourceFile: docs/plugin-development/define-helpers.md
  sourceCommit: 36ab046b5f27060274a79d160c9b43606652d780
  sourceBlob: 6180e2ea3c2a933ecf94b2ce45559f20f9e92950
---

# Define 輔助函式 {#define-helpers}

PikaCSS 只在兩個真正能大幅改善撰寫體驗的地方保留 define 輔助函式：引擎設定與外掛定義。

## defineEnginePlugin {#defineengineplugin}

回傳你提供的外掛定義，並為 hook 簽章提供完整的型別推導。

```ts
import { defineEnginePlugin } from '@pikacss/core'

const plugin = defineEnginePlugin({
  name: 'my-plugin',
  configureEngine: async (engine) => {
    // 完整型別化的 engine 參數
  },
})
```

## defineEngineConfig {#defineengineconfig}

回傳你提供的引擎設定，並為所有設定欄位提供完整的型別推導。

```ts
import { defineEngineConfig } from '@pikacss/core'

export default defineEngineConfig({
  prefix: 'pk-',
  plugins: [],
  layers: { base: 0, utilities: 1 },
})
```

至於其他有型別的結構，例如可重複使用的樣式物件、preflight、關鍵影格、選擇器、shortcut，或變數定義，請使用搭配 `satisfies` 的純物件常值，或明確的型別註記。

```ts
import type { StyleDefinition, VariablesDefinition } from '@pikacss/core'

const card: StyleDefinition = {
  display: 'flex',
  '$:hover': { opacity: '0.8' },
}

const theme = {
  ':root': {
    '--color-primary': { value: '#3b82f6' },
    '--spacing-md': { value: '1rem' },
  },
} satisfies VariablesDefinition
```

## 下一步 {#next}

- [建立外掛](/zh-tw/plugin-development/create-a-plugin)：開始進行外掛開發。
- [API 參考](/api/)：完整的 API 說明文件。
