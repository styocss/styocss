# PikaCSS zh-TW Glossary

Apply AFTER the mechanical rules in translation-style.md and the general table in terminology.md. When in doubt: keep English, be consistent, flag for glossary addition.

## Mechanical rules

1. Backticked text and code blocks: byte-identical (comments excepted, per style rules).
2. Never translate: the `$` nested-selector placeholder, the `%` atomic-ID placeholder, `__`-prefixed meta-properties (`__shortcut`, `__important`, `__layer`), CSS property names/values, and name strings used as values (`'flex-center'`, `'btn'`, `'i-mdi:home'`, `'@dark'`, `'prose'`, `'font-sans'`, `'modern-normalize'`).
3. Error messages verbatim: `Cannot find name 'pika'`, `ReferenceError: pika is not defined`, `Plugin "<name>" failed to execute hook "<hook>"`.

## Table 1 — NEVER translate (stay English verbatim)

- Brand/API: PikaCSS, Pika, `pika()`, `pika.str()`, `pika.arr()`, `pikap()` and variants, the `pika` compile-time global.
- Files/specifiers: `pika.config.{ts,mts,cts,js,mjs,cjs}`, `pikacss.config.*`, `pika.gen.ts`, `pika.gen.css`, `'pika.css'`, `vite.config.ts`, `tsconfig.json`.
- Packages: `@pikacss/core`, `@pikacss/unplugin-pikacss`, `@pikacss/integration`, `@pikacss/nuxt-pikacss`, `@pikacss/eslint-config`, `@pikacss/plugin-{reset,icons,fonts,typography,design-tokens}`, `@iconify-json/*`.
- Exported identifiers (all of `packages/core/src/index.ts` + `packages/unplugin/src/types.ts`): `createEngine`, `Engine`, `EngineConfig`, `ResolvedEngineConfig`, `EnginePlugin`, `defineEngineConfig`, `defineEnginePlugin`, `defineFontsProvider`, `StyleDefinition`, `StyleItem`, `StyleDefinitionMap`, `AtomicStyle`, `Preflight`, `PreflightDefinition`, `PreflightFn`, `ResolvedPreflight`, `AutocompleteConfig`, `AutocompleteContribution`, `DefineAutocomplete`, `PikaAugment`, `PluginOptions`, `ResolvedPluginOptions`, `sortLayerNames`, `appendAutocomplete`, `renderCSSStyleBlocks`, `CSSProperty`, `CSSSelector`, `Properties`, `PropertyValue`.
- Engine members: `engine.use()`, `addPreflight`, `addConfigDependency`, `appendAutocomplete`, `appendCssImport`, `invokePreflight`, `renderAtomicStyles`, `renderPreflights`, `engine.selectors`/`.shortcuts`/`.keyframes`/`.variables`, `.add()`.
- Hook names: `configureRawConfig`, `rawConfigConfigured`, `configureResolvedConfig`, `configureEngine`, `transformSelectors`, `transformStyleItems`, `transformStyleDefinitions`, `preflightUpdated`, `atomicStyleAdded`, `autocompleteConfigUpdated`.
- Config keys (engine): `prefix`, `defaultSelector`, `plugins`, `layers`, `defaultPreflightsLayer`, `defaultUtilitiesLayer`, `preflights`, `cssImports`, `important`, `autocomplete`, `selectors`, `shortcuts`, `variables`, `keyframes`, `definitions`, `safeList`, `pruneUnused`, `cssProperties`, `extraProperties`, `extraCssProperties`, `properties`, `patterns`; (plugins): `reset`, `typography`, `icons`, `fonts`, `designTokens`, `sources`, `themes`, `root`, `provider`, `families`, `imports`, `faces`, `display`, `providers`, `providerOptions`, `mode`, `scale`, `collections`, `customizations`, `autoInstall`, `cwd`, `cdn`, `unit`, `processor`; (unplugin): `scan`, `include`, `exclude`, `config`, `autoCreateConfig`, `fnName`, `transformedFormat`, `tsCodegen`, `cssCodegen`, `currentPackageName`.
- Literal values/syntax: `'pre'`/`'post'`, `'string'`/`'array'`, `'mask'`/`'bg'`/`'auto'`, `?mask`/`?bg`, `$value`/`$type`, `{path.to.token}` alias syntax; ESLint rule `pikacss/no-dynamic-args`.
- CSS constructs: `@layer`, `@media`, `@keyframes`, `@import`, `@font-face`, `@supports`, `@container`, `!important`, `:root`, `:hover`, `::before`, `var()`, `currentColor`.
- Ecosystem proper nouns: Vite, webpack, Rspack, Rollup, Rolldown, esbuild, unplugin, Nuxt, Vue, React, TypeScript, JavaScript, JSDoc, ESLint, Iconify, VitePress, UnoCSS, Tailwind CSS, Panda CSS, vanilla-extract, W3C Design Tokens, Google Fonts, Bunny Fonts, Fontshare, Coollabs, npm, pnpm, yarn, GitHub.
- Abbreviations: CSS, HTML, API, IDE, HMR, SSR, SSG, CDN, CI, AST, JSON, SFC.
- Prose terms kept English (TW dev convention): atomic CSS, CSS-in-JS, utility class / utility-first, preflight, shortcut, hook, layer, preset, token / design token, class（as in「class 名稱」）, placeholder. First occurrence may carry a gloss: atomic CSS（原子化 CSS）.
- Generic JS/web ecosystem terms kept English when the English form is universal in TW dev communities: middleware, proxy, promise. (`async`/`await`/`callback` as code stay English; their prose concepts follow terminology.md.)

## Table 2 — Fixed zh-TW terms (use consistently; first occurrence may gloss the English)

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
| shorthand / longhand | 簡寫屬性／個別屬性（longhand） |
| declaration (CSS) | 宣告 |
| keyframe animation (prose) | 關鍵影格動畫 |
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
| package (npm) | 套件 |
| dependency / config dependency | 相依性／設定相依（config dependency） |
| default | 預設 |
| theme | 主題 |
| icon / font / web font | 圖示／字型／網頁字型 |
| typography (prose) / prose content | 排版／長文內容 |
| breakpoint | 斷點 |
| stylesheet | 樣式表 |
| inline style | 行內樣式 |
| preview (pikap) | 預覽 |
| fallback (value) | 備用值（fallback） |
| string literal | 字串常值 |
| comment (code) | 註解 |

## Table 3 — Dual-use terms (API key vs prose concept)

Rule: the word as config key / code token is English in backticks (a backtick in the English source is a hard signal); the prose concept follows below.

| Term | As code (English, backticked) | As prose |
|---|---|---|
| variables | `variables`, `--color-primary`, `var()` | 變數／CSS 變數 |
| shortcuts | `shortcuts`, `__shortcut`, `'flex-center'` | keep English: shortcut（never 捷徑 — OS connotation）；「shortcut 定義」「展開 shortcut」 |
| keyframes | `keyframes`, `@keyframes` | 關鍵影格（動畫）; feature/config sense keeps English |
| selectors | `selectors`, `defaultSelector`, `'@dark'` | 選擇器; selector names (`@dark`, `@sm`) are values — never translate |
| important | `important`, `__important`, `!important` | rephrase around `!important`（「為所有宣告加上 `!important`」）; ordinary "important" translates normally |
| layers | `layers`, `__layer`, `@layer`, names `preflights`/`utilities`/`reset`/`base` | keep English: layer（首次可註「（CSS `@layer`）」）; layer names never translated |
| preflights | `preflights`, `defaultPreflightsLayer` | keep English: preflight／preflight 樣式 |
| autocomplete | `autocomplete`, `appendAutocomplete` | 自動完成 |
| config | `config`, `pika.config.ts` | 設定／設定檔 |
| plugins | `plugins` array | 外掛 |
| properties | `properties`, `cssProperties`, `extraProperties` | 屬性（CSS 屬性）; keep the key-vs-concept contrast visible (autocomplete.md warning) |
| prefix | `prefix` | 前綴 |
| scan | `scan`, `scan.include`/`scan.exclude` | 掃描; glob values never translated |
| reset | `reset` key, `reset()` factory | keep English: CSS reset |
| icons / fonts / typography / designTokens | config keys, factory calls | 圖示／字型／排版／design token（design token stays English） |
| utilities | `utilities` layer name, `defaultUtilitiesLayer` | keep English: utility class |
| theme | `themes` key, `theme=dark` fence attribute | 主題; fence attributes are code |
