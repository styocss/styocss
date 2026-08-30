---
title: Autocomplete
description: 了解 domain-owned PikaCSS Typegen與 deterministic editor suggestions。
relatedPackages:
  - '@pikacss/core'
  - '@pikacss/unplugin-pikacss'
relatedSources:
  - packages/core/src/typegen/registry.ts
  - packages/core/src/typegen/render.ts
  - packages/core/src/typegen/preview.ts
  - packages/core/src/typegen/jsdoc.ts
  - packages/core/src/plugins/selectors.ts
  - packages/core/src/plugins/shortcuts.ts
  - packages/core/src/plugins/variables.ts
  - packages/integration/src/operations.ts
  - packages/integration/src/generatedState.ts
  - packages/unplugin/src/cli.ts
category: customizations
order: 80
translation:
  sourceFile: docs/customizations/autocomplete.md
  sourceCommit: f54e8ced70d2febf6f32014b93f6076d0e319fc8
  sourceBlob: d070b62f3577650bf26201938bffd995ca5dfda1
---

# Autocomplete {#autocomplete}

PikaCSS現在沒有 global `autocomplete` config，也沒有 runtime `appendAutocomplete()` pool。每個 semantic subsystem自行擁有它能正確描述的 Typegen資料。

Generated authoring state固定發布到 `<stateDir>/pika.gen.ts`。獨立 editor/typecheck/ESLint流程前先執行 `pikacss prepare`，並把該 declaration納入 TypeScript project。

## Selector / Shortcut concrete members {#selector-and-shortcut-concrete-members}

Static selector 與 shortcut name 本身就是 deterministic concrete members。Dynamic selector 與 shortcut 使用兩個互補欄位：

- `inputType`：描述完整 accepted dynamic input family 的 raw TypeScript。
- `autocomplete`：deterministic concrete values，會得到明確 completion member。

對 static member 與接受的 dynamic `autocomplete` member，Core 都會嘗試產生 resolved **PikaCSS Preview**，顯示於 Typegen / IDE hover 文件。手動撰寫的 `description` 會額外保留，並顯示在 preview 前。若僅 preview 的 resolution 失敗，PikaCSS 會回報診斷，但不會移除 concrete Typegen member。

```ts
selectors: {
  definitions: [
    {
      pattern: /^state-(.+)$/,
      inputType: '`state-${string}`',
      resolve: match => `&[data-state="${match[1]}"]`,
      autocomplete: ['state-open', 'state-closed'],
    },
  ],
}
```

Concrete members 來自專案／plugin 設定或 deterministic catalog。它們的 preview 會遵循 runtime selector / style-item transform 順序，同時保持 provisional：preview hook 使用隔離的 plugin state，不會 commit atomic style ID，也不會寫入 runtime resolver 快取。若 plugin state 無法安全隔離，該 member 的 preview generation 會降級並回報診斷，但不會移除 member 或手動撰寫的 `description`。PikaCSS 不會從 transformed application usage 學習 Typegen members。

## Variable suggestions {#variable-suggestions}

```ts
variables: {
  definitions: {
    '--brand-color': {
      value: '#3b82f6',
      suggest: {
        asProperty: true,
        asValueOf: ['color', 'backgroundColor'],
      },
    },
  },
}
```

## Plugin Typegen {#plugin-typegen}

Plugin可在 `configureEngine` 透過 owner-bound `engine.typegen` capability貢獻 authoring declarations；更常見的做法是在 `configureRawConfig` 把語義 lower到現有 Core subsystem，讓同一 subsystem同時擁有 runtime behavior與 Typegen。

不再有受支援的 `PikaAugment.Autocomplete`、`DefineAutocomplete` 或 runtime `.add()` compatibility path。

## Suggestions 不是任意 runtime validation {#suggestions-are-not-arbitrary-runtime-validation}

Generated types只描述已設定的 semantic members與受支援的 static authoring；它們不是 runtime validator，也不會允許 runtime-dynamic `pika()` arguments。Compiler / ESLint 的 static-usage rules仍是 source legality的權威。

## 範例 {#examples}

<<< @/.examples/customizations/autocomplete.example.ts


## 下一步 {#next}

- [Selectors](/zh-tw/customizations/selectors)
- [Shortcuts](/zh-tw/customizations/shortcuts)
- [Plugin 型別擴增](/zh-tw/plugin-development/type-augmentation)
