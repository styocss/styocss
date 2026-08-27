---
title: Variables
description: 定義 object-only local/external CSS variables與 domain-owned suggestions。
relatedPackages:
  - '@pikacss/core'
relatedSources:
  - packages/core/src/plugins/variables.ts
category: customizations
order: 40
translation:
  sourceFile: docs/customizations/variables.md
  sourceCommit: 33431c15728d378cc7bd9c37fd5c3b3e86e51318
  sourceBlob: 2d14136d865c6be5513ba6dfafbdb2dbd25506a2
---

# Variables {#variables}

Variables subsystem擁有 CSS custom-property semantics、pruning與 Typegen suggestions。Variable leaf只接受 object form。

## Local variables {#local-variables}

```ts
import { defineConfig } from '@pikacss/unplugin-pikacss'

export default defineConfig({
  engine: {
  variables: {
    definitions: {
      '--color-primary': { value: '#3b82f6' },
      '--brand-color': {
        value: '#2563eb',
        suggest: {
          asProperty: true,
          asValueOf: ['color', 'backgroundColor'],
        },
      },
    },
  },
  },
})
```

`suggest.asProperty` 控制 custom property本身是否成為 explicit Typegen member；`suggest.asValueOf` 控制哪些 CSS property value會建議 `var(--name)`，`'*'` 是明確 wildcard。

## External variables {#external-variables}

外部 stylesheet/runtime提供的變數可用：

```ts
'--host-theme-color': {
  external: true,
  suggest: { asValueOf: 'color' },
}
```

它會參與 authoring suggestions，但 PikaCSS不輸出 value。

## Selector scopes {#selector-scopes}

Non-variable keys可形成 selector scopes。

## Pruning {#pruning}

Local variable預設依目前 live CSS usage做 pruning；必要時可用 leaf `pruneUnused: false`、`safeList` 或 config-level `pruneUnused: false` 保留。

## 範例 {#examples}

<<< @/.examples/customizations/variables.example.ts


## 下一步 {#next}

- [Keyframes](/zh-tw/customizations/keyframes)
- [Autocomplete](/zh-tw/customizations/autocomplete)
