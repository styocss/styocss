---
title: ESLint 設定
description: 使用 canonical PikaCSS project config 驗證 static Pika authoring grammar。
relatedPackages:
  - '@pikacss/eslint-config'
relatedSources:
  - packages/eslint-config/src/index.ts
  - packages/eslint-config/src/lint-project.ts
  - packages/eslint-config/src/rules/static-usage.ts
category: getting-started
order: 50
---

# ESLint 設定 {#eslint-config}

PikaCSS 提供 async ESLint flat-config factory，會載入 canonical project config，檢查每個 configured root 的 static usage。

## Setup {#setup}

```sh
pnpm add -D @pikacss/eslint-config
```

```ts
// eslint.config.mjs
import pikacss from '@pikacss/eslint-config'

export default [
  await pikacss(),
]
```

自訂 config path時只需要提供 locator：

```ts
export default [
  await pikacss({ config: './pika.config.mts' }),
]
```

`fnName`、readonly globals、scan ownership等都來自 canonical PikaCSS config；不要另外手動註冊 plugin或 rule semantics。

## Rules {#rules}

### static-usage {#static-usage}

#### 說明 {#description}

此 rule驗證：

- configured root的 base `pika(...)` call只能使用 bounded-static expressions；
- static-extension chain語法必須合法；
- root只能出現在 owning entry的 scan scope；
- 一個 entry不能依賴另一個 entry的 Pika root；
- lexical-shadowed root仍是普通 application binding。

#### 什麼算是靜態 {#what-counts-as-static}

Evaluator有三種結果：known、engine-dependent、invalid。合法 static extension terminal可延後到 compiler Prepare用 initialized Engine求值；普通 runtime variable/function call仍會被拒絕。

#### 範例 {#examples}

```ts
// ✅ valid
pika({ color: 'red' })
pika({ color: pika.theme.colors.primary })

// ❌ runtime-dynamic
const color = getColor()
pika({ color })
```

## Migration {#migration}

舊 `pikacss/no-dynamic-args` 與 `.str/.arr` 特例已移除。現在只有 `pikacss/static-usage`，而 ESLint factory唯一的公開 option是 optional `config` locator。


## 下一步 {#next}

- [Integrations](/zh-tw/integrations/unplugin)
- [使用方式](/zh-tw/getting-started/usage)
