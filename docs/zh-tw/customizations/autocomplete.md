---
title: Autocomplete
description: 了解 domain-owned PikaCSS Typegen與 deterministic editor suggestions。
relatedPackages:
  - '@pikacss/core'
  - '@pikacss/unplugin-pikacss'
relatedSources:
  - packages/core/src/typegen/registry.ts
  - packages/core/src/typegen/render.ts
  - packages/core/src/plugins/selectors.ts
  - packages/core/src/plugins/shortcuts.ts
  - packages/core/src/plugins/variables.ts
category: customizations
order: 80
translation:
  sourceFile: docs/customizations/autocomplete.md
  sourceCommit: 33431c15728d378cc7bd9c37fd5c3b3e86e51318
  sourceBlob: dd31ad00133431a129ba66239e06559ea9f5dd16
---

# Autocomplete {#autocomplete}

PikaCSS現在沒有 global `autocomplete` config，也沒有 runtime `appendAutocomplete()` pool。每個 semantic subsystem自行擁有它能正確描述的 Typegen資料。

Generated authoring state固定發布到 `<stateDir>/pika.gen.ts`。獨立 editor/typecheck/ESLint流程前先執行 `pikacss prepare`，並把該 declaration納入 TypeScript project。

## Selector / Shortcut concrete members {#selector-and-shortcut-concrete-members}

Dynamic selector與shortcut使用：

- `inputType`：描述完整 accepted input family的 raw TypeScript。
- `autocomplete`：deterministic concrete values，會得到明確 completion member與 resolved hover docs。

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

Concrete members來自 config/plugin/catalog，不會從 transformed application usage學習。

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
