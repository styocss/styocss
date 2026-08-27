---
title: 型別擴增
description: 擴增 EngineConfig/Engine，並透過 Typegen manager貢獻 generated authoring types。
relatedPackages:
  - '@pikacss/core'
relatedSources:
  - packages/core/src/plugin.ts
  - packages/core/src/typegen/registry.ts
  - packages/core/src/pika.ts
  - packages/core/src/types/shared.ts
category: plugin-development
order: 30
translation:
  sourceFile: docs/plugin-development/type-augmentation.md
  sourceCommit: 33431c15728d378cc7bd9c37fd5c3b3e86e51318
  sourceBlob: e3a78053f843e76505d59947a19cf59feacfeb47
---

# 型別擴增 {#type-augmentation}

Plugin可以用一般 TypeScript module augmentation擴增穩定的 runtime/config介面。Generated `pika()` authoring types則應透過 Engine-owned Typegen manager，不再使用 global autocomplete pool。

## EngineConfig {#engineconfig}

`EngineConfig` 是受支援的 plugin config augmentation anchor：

```ts
declare module '@pikacss/core' {
  interface EngineConfig {
    myPlugin?: {
      enabled?: boolean
      theme?: 'light' | 'dark'
    }
  }
}
```

使用者把它放在 project entry的 `engine`：

```ts
import { defineConfig } from '@pikacss/unplugin-pikacss'

export default defineConfig({
  engine: {
    plugins: [myPlugin()],
    myPlugin: {
      enabled: true,
      theme: 'dark',
    },
  },
})
```

若 plugin semantic本質上屬於現有 Core domain，優先在 `configureRawConfig` lower成那個 domain的 definitions，讓 runtime behavior與Typegen由同一 owner處理：

```ts
defineEnginePlugin({
  name: 'my-plugin',
  configureRawConfig(config) {
    if (!config.myPlugin?.enabled)
      return

    config.selectors = {
      definitions: [
        ...(config.selectors?.definitions ?? []),
        { name: '@my-theme', value: 'html[data-theme] $' },
      ],
    }
  },
})
```

## Engine {#engine}

真的需要公開 runtime/tooling capability時，可以擴增 `Engine`：

```ts
declare module '@pikacss/core' {
  interface Engine {
    getTheme: () => string
  }
}
```

`configureEngine` 現在收到的是 `EngineConfigurator`；底層 runtime在 `engine.runtime`：

```ts
defineEnginePlugin({
  name: 'my-plugin',
  configureEngine(engine) {
    engine.runtime.getTheme = () => 'dark'
  },
})
```

Selector/shortcut/variable/keyframe等 semantic producer不應為了方便再建立另一條 mutable runtime ingress。

## Generated authoring types {#generated-authoring-types}

舊 global `Autocomplete` / `DefineAutocomplete` / `appendAutocomplete()` architecture已移除。`PikaAugment` 目前只保留為 transitional generated-file plumbing，**不是** plugin authoring API。

### 優先使用既有 semantic subsystem {#prefer-an-existing-semantic-subsystem}

如果功能本身就是 selector、shortcut、variable、keyframe、token constraint等，請在 `configureRawConfig` lower definitions。Core subsystem會同時擁有runtime semantics與Typegen。

Dynamic selector/shortcut用 `inputType` 描述完整 accepted TypeScript input family，並用 `autocomplete` 提供 deterministic concrete completions：

```ts
config.shortcuts = {
  definitions: [
    ...(config.shortcuts?.definitions ?? []),
    {
      pattern: /^my-gap-(.+)$/,
      inputType: '`my-gap-${string}`',
      resolve: ([, value]) => ({ gap: value }),
      autocomplete: ['my-gap-1rem', 'my-gap-2rem'],
    },
  ],
}
```

### 在 `configureEngine` 註冊 plugin-owned Typegen {#register-plugin-owned-typegen-during-configureengine}

真正新的 authoring surface才使用 owner-bound `engine.typegen`。Capability只在目前 plugin的 `configureEngine` invocation期間開放：

```ts
defineEnginePlugin({
  name: 'my-plugin',
  configureEngine(engine) {
    engine.typegen.add({
      id: 'my-plugin:authoring',
      declarations: 'interface __MyPluginTheme { current: "dark" | "light" }',
      pika: { theme: '__MyPluginTheme' },
    })
  },
})
```

若同一個 first-level Pika root也有 runtime semantics，必須由同一個 plugin擁有並在同一 lifecycle註冊：

```ts
configureEngine(engine) {
  engine.pika.extendStatic('theme', { current: 'dark' })
  engine.typegen.add({
    id: 'my-plugin:theme',
    declarations: 'interface __MyPluginTheme { current: "dark" | "light" }',
    pika: { theme: '__MyPluginTheme' },
  })
}
```

Static extension只允許出現在 base `pika(...)` 的 bounded-static argument tree內，不是一般 runtime macro。

## `createEngine()` 測試 {#direct-createengine-tests}

Engine建立完成時就會擁有 finalized `engine.typegen.snapshot`。Integration/host之後才把一個或多個 snapshot render成 `<stateDir>/pika.gen.ts`。Plugin tests可直接斷言 semantic Typegen contributions，不需要手寫 `PikaAugment`。

## 下一步 {#next}

- [建立 Plugin](/zh-tw/plugin-development/create-a-plugin)
- [可用 Hooks](/zh-tw/plugin-development/available-hooks)
- [Autocomplete](/zh-tw/customizations/autocomplete)
