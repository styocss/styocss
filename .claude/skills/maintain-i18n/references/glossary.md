# PikaCSS zh-TW Glossary

Apply AFTER the mechanical rules in `translation-style.md` and the general table in `terminology.md`. When in doubt: keep English, preserve code tokens exactly, and verify the current public API instead of copying historical migration vocabulary.

## Mechanical rules

1. Backticked text and code blocks: byte-identical (comments excepted, per style rules).
2. Never translate: the `$` nested-selector placeholder, the `%` atomic-ID placeholder, current `__`-prefixed meta-properties such as `__important` / `__layer`, CSS property names/values, and configured name strings such as `'flex-center'`, `'i-mdi:home'`, `'@dark'`, `'font-sans'`.
3. Error messages remain verbatim, for example `Cannot find name 'pika'` and `ReferenceError: pika is not defined`.
4. Removed API names may appear in migration/removal prose only; never promote them back into current API tables or examples.

## Table 1 — NEVER translate (stay English verbatim)

- Brand/current callable: PikaCSS, Pika, `pika()`, configured Pika roots, static Pika extensions.
- Canonical files/specifiers: `pika.config.ts`, `pika.config.mts`, `pika.config.js`, `pika.config.mjs`, `.pikacss/`, `.pikacss/pika.gen.ts`, `'pika.css'`, `vite.config.ts`, `tsconfig.json`.
- Packages: `@pikacss/core`, `@pikacss/config`, `@pikacss/config/host`, `@pikacss/integration`, `@pikacss/unplugin-pikacss`, `@pikacss/nuxt-pikacss`, `@pikacss/eslint-config`, `@pikacss/plugin-{reset,icons,fonts,typography,design-tokens}`, `@iconify-json/*`.
- Current authoring/runtime identifiers: `createEngine`, `Engine`, `EngineConfig`, `EnginePlugin`, `EngineConfigurator`, `defineEngineConfig`, `defineEnginePlugin`, `defineConfig`, `createPikaCSSContext`, `preparePikaCSS`, `initPikaCSS`, `TypegenSnapshot`, `TypegenContribution`, `renderTypegenDocument`, `StyleDefinition`, `StyleItem`, `AtomicStyle`, `Preflight`.
- Current Engine/configurator members: `engine.use()`, `addPreflight`, `addConfigDependency`, `addConfigDirectoryMembershipDependency`, `appendCssImport`, `renderAtomicStyles`, `renderPreflights`, `engine.runtime`, `engine.pika.extendStatic()`, `engine.typegen.add()`.
- Hook names: `configureRawConfig`, `rawConfigConfigured`, `configureResolvedConfig`, `configureEngine`, `transformSelectors`, `transformStyleItems`, `transformStyleDefinitions`, `transformStyleContents`, `preflightUpdated`, `atomicStyleAdded`.
- Project config keys: `engine`, `fnName`, `cssModule`, `transformedFormat`, `scan`, `include`, `exclude`, `report`, `stateDir`.
- Engine/domain keys: `prefix`, `defaultSelector`, `plugins`, `layers`, `defaultPreflightsLayer`, `defaultUtilitiesLayer`, `preflights`, `cssImports`, `important`, `selectors`, `shortcuts`, `variables`, `keyframes`, `definitions`, `safeList`, `pruneUnused`, `inputType`, `autocomplete`, `suggest`, `description`.
- Adapter bootstrap keys: `config`, `cwd` (Nuxt public module options expose only `config`).
- Plugin keys: `reset`, `typography`, `icons`, `fonts`, `designTokens`, `sources`, `themes`, `root`, `provider`, `families`, `imports`, `faces`, `display`, `providers`, `providerOptions`, `mode`, `scale`, `collections`, `customizations`, `autoInstall`, `cdn`, `unit`, `processor`.
- Literal values/syntax: `'pre'`/`'post'`, `'string'`/`'array'`, `'mask'`/`'bg'`/`'auto'`, `?mask`/`?bg`, `$value`/`$type`, `{path.to.token}`, ESLint rule `pikacss/static-usage`.
- CSS constructs: `@layer`, `@media`, `@keyframes`, `@import`, `@font-face`, `@supports`, `@container`, `!important`, `:root`, `:hover`, `::before`, `var()`, `currentColor`.
- Supported host proper nouns: Vite, Rollup, Rolldown, webpack, Rspack, Nuxt. Other ecosystem names such as esbuild, Farm, Bun, unplugin remain proper nouns when discussing unsupported hosts or infrastructure.
- Ecosystem proper nouns: Vue, React, TypeScript, JavaScript, JSDoc, ESLint, Iconify, VitePress, UnoCSS, Tailwind CSS, Panda CSS, vanilla-extract, W3C Design Tokens, Google Fonts, Bunny Fonts, Fontshare, Coollabs, npm, pnpm, yarn, GitHub.
- Abbreviations: CSS, HTML, API, IDE, HMR, SSR, SSG, CDN, CI, AST, JSON, SFC.
- Prose terms commonly kept English in TW dev usage: atomic CSS, CSS-in-JS, utility class, preflight, shortcut, hook, layer, preset, token / design token, class, placeholder, Typegen, generated state.

## Table 2 — Fixed zh-TW terms

| English | Fixed zh-TW |
|---|---|
| engine / engine config | 引擎／引擎設定 |
| plugin (prose) | 外掛 |
| build time | 建置時期 |
| build tool / bundler | 建置工具／打包工具（bundler） |
| runtime / zero runtime | 執行階段／零執行階段成本 |
| selector / custom / nested | 選擇器／自訂選擇器／巢狀選擇器 |
| CSS custom property / CSS variable | CSS 自訂屬性／CSS 變數 |
| cascade (ordering) | 層疊（順序） |
| declaration (CSS) | 宣告 |
| keyframe animation | 關鍵影格動畫 |
| pseudo-class / pseudo-element | 偽類／偽元素（首次附英文） |
| media query | 媒體查詢 |
| atomic style / atomic class | 原子樣式／原子 class |
| style definition / style item | 樣式定義／樣式項目 |
| class name | class 名稱 |
| generated (file/output) | 產生的（檔案／輸出） |
| deduplication | 去除重複 |
| prune / pruned | 剔除 |
| autocomplete (prose) | 自動完成 |
| suggestion(s) | 建議 |
| static analysis | 靜態分析 |
| extract / static extraction | 擷取／靜態擷取 |
| scan (prose) | 掃描 |
| transform (source) | 轉換 |
| type / checking / inference | 型別／型別檢查／型別推導 |
| type/module augmentation | 型別擴增／模組擴增 |
| declaration file | 宣告檔 |
| lifecycle | 生命週期 |
| dev server | 開發伺服器 |
| project root | 專案根目錄 |
| dependency / config dependency | 相依性／設定相依（config dependency） |
| default | 預設 |
| theme | 主題 |
| icon / font / web font | 圖示／字型／網頁字型 |
| breakpoint | 斷點 |
| stylesheet | 樣式表 |
| fallback (value) | 備用值（fallback） |

## Table 3 — Dual-use terms

The word as a config key/code token remains English in backticks; prose follows these conventions.

| Term | As code | As prose |
|---|---|---|
| variables | `variables`, `--color-primary`, `var()` | 變數／CSS 變數 |
| shortcuts | `shortcuts`, `'flex-center'` | keep English: shortcut；「shortcut 定義」「組合 shortcut」 |
| keyframes | `keyframes`, `@keyframes` | 關鍵影格（動畫） |
| selectors | `selectors`, `defaultSelector`, `'@dark'` | 選擇器 |
| important | `important`, `__important`, `!important` | 以 `!important` 描述 |
| layers | `layers`, `__layer`, `@layer` | keep English: layer |
| preflights | `preflights`, `defaultPreflightsLayer` | keep English: preflight |
| autocomplete | dynamic definition `autocomplete` | 自動完成／concrete member 建議 |
| suggest | variable leaf `suggest` | 建議 metadata |
| config | `config`, `pika.config.ts` | 設定／設定檔 |
| generated state | `stateDir`, `.pikacss/` | generated state／產生狀態 |
| scan | `scan.include` / `scan.exclude` | 掃描 |
