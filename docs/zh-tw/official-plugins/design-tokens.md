---
title: Design Tokens
description: 將 W3C design token 與 design.md 文件轉換成 CSS 變數，並支援外部別名、多主題來源、自動完成，以及嚴格模式治理。
relatedPackages:
  - '@pikacss/plugin-design-tokens'
relatedSources:
  - packages/plugin-design-tokens/src/types.ts
  - packages/plugin-design-tokens/src/node.ts
  - packages/plugin-design-tokens/src/load.ts
  - packages/plugin-design-tokens/src/dtcg.ts
  - packages/plugin-design-tokens/src/external.ts
  - packages/plugin-design-tokens/src/strict.ts
  - packages/plugin-design-tokens/src/autocomplete.ts
  - packages/plugin-design-tokens/src/report.ts
  - packages/plugin-design-tokens/src/index.ts
category: official-plugins
order: 50
translation:
  sourceFile: docs/official-plugins/design-tokens.md
  sourceCommit: dbf5bd0a270b512f5d0bdb31e02cd0494dd59ec2
  sourceBlob: e0b7c94054049628ac6a3775c59b031264b7e6a7
---

# Design Tokens {#design-tokens}

透過引擎的 `variables` 系統，將 design token 轉換成 CSS 變數。

design tokens 外掛會讀取 token 來源（行內物件、W3C Design Tokens (DTCG) JSON 檔案，或 markdown 設計文件），把它們攤平成 CSS 變數，再合併進引擎的 `variables` 設定。由於 token 會流經核心的 `variables` 系統，它們也會繼承未使用時的剔除、IDE 自動完成，以及選擇器範圍限定。token 來源的檔案路徑會註冊為引擎的設定相依（config dependency），即使檔案不存在也一樣，因此當 token 檔案變更或稍後才建立時，建置工具整合都會重新載入。

::: code-group

```sh [pnpm]
pnpm add -D @pikacss/plugin-design-tokens
```

```sh [npm]
npm install -D @pikacss/plugin-design-tokens
```

```sh [yarn]
yarn add -D @pikacss/plugin-design-tokens
```

:::

## 選擇進入點 {#choosing-an-entry}

這個外掛提供兩個進入點。你 import 哪一個，決定了是否能讀取**檔案形式**的 token 來源：

- `@pikacss/plugin-design-tokens/node`：Node.js 轉接器。它會注入 `node:fs` 與 `process.cwd()`，因此檔案來源（`.json`、`.md` 與自訂 loader）會從磁碟讀取。在任何打包工具或 Node 建置（Vite、webpack、Nuxt 等）中請使用這個。
- `@pikacss/plugin-design-tokens`：平台中立的進入點。它**只接受行內 token 物件**。在這裡傳入檔案來源會發出警告並被略過，因為沒有安裝任何檔案系統能力。請在非 Node 環境使用，或傳入自訂的 runtime 能力（`designTokens({ readFile, cwd })`）。

大多數專案都從 `/node` import：

<<< @/zh-tw/.examples/official-plugins/design-tokens.setup.example.ts

請透過引擎設定中最上層的 `designTokens` key 來設定這個外掛。

使用方式：從一般的 `pika()` 呼叫中參考產生出來的變數。預設情況下會剔除未使用的 token，因此只有實際參考到的變數才會輸出：

::: code-group

<<< @/zh-tw/.examples/official-plugins/design-tokens.usage.example.pikain.ts [輸入]

<<< @/zh-tw/.examples/official-plugins/design-tokens.usage.example.pikaout.css [輸出]

:::

## Token 來源 {#token-sources}

`sources` 接受單一來源或一個來源陣列。每個來源可以是行內的 token group 物件，或是一個檔案路徑。相對路徑會相對於有效的 token 根目錄解析：絕對的 `root` 直接使用；相對的 `root` 會從引擎宿主的專案根目錄解析（例如 bundler 整合提供的 Vite root 或 Nuxt `rootDir`）；省略 `root` 時則直接使用專案根目錄。沒有宿主 context 的獨立 `createEngine()` 用法，使用 `/node` 進入點時會退回 `process.cwd()`（未提供任何 runtime 能力時則為 `'.'`）。當變數名稱衝突時，較晚的來源會覆寫較早的來源。無法讀取或無效的來源會被略過並發出警告，而不會導致引擎建立失敗；透過中立進入點（沒有 `readFile` 能力）讀取的檔案來源同樣會發出警告並被略過。

### JSON Token 檔案 {#json-token-files}

任何不是以 `.md` 結尾的檔案路徑，都會被當成 W3C Design Tokens JSON 檔案來解析。帶有 `$value` 屬性的節點是一個 token；其他物件則是巢狀的 group。以 `$` 為前綴的 group metadata key（例如 `$description`）會被略過：

```json
{
	"color": {
		"primary": { "$value": "#3b82f6", "$type": "color" },
		"accent": { "$value": "{color.primary}" }
	}
}
```

### Markdown 設計文件 {#markdown-design-documents}

以 `.md` 結尾的檔案路徑會被當成設計文件來解析。只有 info string 以 `tokens` 開頭的柵欄程式碼區塊會被讀取；其他所有 markdown 內容都會被忽略，因此 token 可以放在你的設計文件裡。區塊內容必須是符合 W3C Design Tokens 格式的有效 JSON：

````md
# Buttons

Primary buttons use the brand color.

```tokens
{ "color": { "primary": { "$value": "#3b82f6" } } }
```

The dark theme swaps in a lighter shade.

```tokens theme=dark selector=".dark"
{ "color": { "primary": { "$value": "#60a5fa" } } }
```
````

info string 可以帶有兩個屬性：

- `theme=<name>`：將該區塊的 token 指派給某個主題，而不是基礎的 `:root` 範圍。
- `selector=<css-selector>`：覆寫該區塊的主題選擇器。值可以用 `"` 或 `'` 括起來。柵欄上的 `selector` 會優先於 `themes` 底下設定的選擇器。

### 各來源的 Prefix 與 Layer {#per-source-prefix-and-layer}

一個來源可以是單純的來源，或是帶有自己 `prefix` 與 `layer` 的 `DesignTokensSourceEntry` 物件。當物件本身具有 `source` 屬性時，會被視為一個 source entry；否則會被當成行內的 token group 來讀取。使用 entry 形式可以為某個第三方檔案加上命名空間，或標記某個來源的架構層級（layer）：

```ts
designTokens: {
	sources: [
		'./app.tokens.json',
		{ source: './vendor.tokens.json', prefix: 'syno', layer: 'semantic' },
	],
}
```

- `prefix` 會覆寫最上層的 [`prefix`](#config)，用於該來源輸出的變數名稱，以及它自己的 `{a.b.c}` 別名解析。從其他來源指向這個來源的跨來源 `$ref`，也會使用這個 prefix 來產生輸出名稱。
- `layer` 可以是 `'primitive'`（原始值，例如調色盤、間距刻度）或 `'semantic'`（對應到語意的值，例如 `surface`、`text`）。這個 layer 會記錄在所產生變數的內部註冊表中；它不會影響輸出的 CSS，但[嚴格模式](#strict-mode)可以強制要求撰寫的樣式只能參考 semantic token。

::: info
若要使用一個最上層真的包含名為 `source` 的 token 或 group 的行內 token group，請把它包在一個 entry 裡：`{ source: <group> }`。
:::

## DTCG 匯入 {#dtcg-ingestion}

每個載入的來源在被攤平之前，都會先由內建的 DTCG normalizer 正規化。這在單純的 `$value` 解析之上，額外加入三個 W3C Design Tokens 功能：

- **`$ref` JSON pointer**：帶有 `$ref`（且沒有 `$value`）的節點，是一個純粹以參考形式表達的 token，寫成像 `"file#/color/primary"` 這樣的 JSON pointer，或在同檔案參考時寫成 `"#/color/primary"`。它會被改寫成指向目標所輸出變數的別名，因此跨檔案的參考會解析到目標來源的 prefix。格式錯誤的 pointer（語法錯誤、非字串的 `$ref`、未知的來源、找不到目標、環狀參考鏈）會發出警告並被略過，絕不會拋出例外或陷入迴圈。
- **group 層級的 `$type`**：設定在 group 上的 `$type` 會向下套用到每個後代 token，除非某個 token 設定了自己的 `$type`（以 token 為準）。這讓[自動完成](#autocomplete)與[嚴格模式](#strict-mode)治理得以運作，而不必在每個葉節點重複寫 `$type`。
- **group 層級的 `$deprecated`**：已棄用的 token 仍會輸出它們的 CSS 變數，但它們的變數名稱會被記錄下來，讓工具能在使用時發出警告。group 層級的 `$deprecated` 會套用到每個後代，除非某個 token 覆寫它。使用中的已棄用 token 會被計入[使用報告](#usage-report)。

::: code-group

<<< @/zh-tw/.examples/official-plugins/design-tokens.dtcg.example.pikain.ts [輸入]

<<< @/zh-tw/.examples/official-plugins/design-tokens.dtcg.example.pikaout.css [輸出]

:::

任意的 `$extensions` metadata 都會被一併帶到正規化後的 token 上。`com.pikacss.design-tokens` 這個命名空間保留給 PikaCSS 自己的 metadata 使用，請見[外部別名](#external-aliases)。

## 外部別名 {#external-aliases}

外部別名是一種其值由另一個執行環境擁有的 token，舉例來說，某個設計系統可能已經在執行階段隨附自己的 CSS 自訂屬性（`--guideline-*`）。請在 `$extensions["com.pikacss.design-tokens"]` 底下用外部別名標記（marker）來標記這樣的 token：

```json
{
	"surface": {
		"z0": {
			"$type": "color",
			"$value": "var(--guideline-semantic-surface-z0)",
			"$extensions": {
				"com.pikacss.design-tokens": {
					"external": true,
					"var": "--guideline-semantic-surface-z0"
				}
			}
		}
	}
}
```

這個標記具有決定性：當標記與 `$value` 同時存在時，以標記為準，而且 `var` 必須是以 `--` 為前綴的字串（無效的標記會發出警告並被略過）。外部別名**只會輸出在 `:root` 底下**，而且永遠不會套用主題，因為主題化是由外部執行環境掌管，所以放在主題範圍裡的外部別名會發出警告並被略過。這讓你的 token 可以參考設計系統的即時變數，同時仍然流經自動完成、剔除，以及嚴格模式：

::: code-group

<<< @/zh-tw/.examples/official-plugins/design-tokens.external.example.pikain.ts [輸入]

<<< @/zh-tw/.examples/official-plugins/design-tokens.external.example.pikaout.css [輸出]

:::

## 主題 {#themes}

基礎 token 會輸出在 `:root` 底下。主題 token 則會輸出在該主題的選擇器底下，選擇器預設為 `.<themeName>`，並可透過 `themes.<name>.selector` 覆寫（或在個別區塊透過柵欄的 `selector` 屬性覆寫）。主題來源使用與基礎來源相同的格式：

```ts
import { defineEngineConfig } from '@pikacss/core'
import { designTokens } from '@pikacss/plugin-design-tokens/node'

export default defineEngineConfig({
	plugins: [designTokens()],
	designTokens: {
		sources: ['./design.tokens.json'],
		themes: {
			dark: {
				selector: '[data-theme="dark"]',
				sources: ['./design.dark.tokens.json'],
			},
		},
	},
})
```

### 從單一檔案定義多主題 {#multi-theme-from-a-single-file}

當單一共用來源在其最上層存放多個主題分區（例如 `light-mode`、`dark-mode`）時，每個主題都會用 `from` 選取自己的分區。分區的 key 會從 token 路徑中去除，因此輸出的變數名稱會與主題無關（是 `--surface-z0`，而不是 `--light-mode-surface-z0`）。傳入一個 key 陣列會合併選取的子樹（衝突時以較後面的 key 為準）。

設定 `media` 可以在該主題的選擇器區塊之外，額外把主題的變數輸出在一個包住 `:root` 的 `@media` 區塊裡，讓某個主題既能透過明確的 class／屬性啟用，也能自動依使用者偏好啟用：

::: code-group

<<< @/zh-tw/.examples/official-plugins/design-tokens.multi-theme.example.pikain.ts [輸入]

<<< @/zh-tw/.examples/official-plugins/design-tokens.multi-theme.example.pikaout.css [輸出]

:::

## Token 名稱與別名 {#token-names-and-aliases}

每個 token 路徑區段都會轉成 kebab-case（`fontSize` → `font-size`），然後區段之間用 `-` 連接來組成變數名稱，例如 `color.primary` → `--color-primary`。當設定了 `prefix` 時，它會被當成第一個區段加在最前面：`--app-color-primary`。

字串值可以用別名語法 `{path.to.token}` 參考其他 token，它會用相同的正規化與前綴解析成 `var(--path-to-token)`。別名永遠指向輸出的變數名稱。別名也可以嵌在較長的值裡使用，例如 `'1px solid {color.border}'` → `1px solid var(--color-border)`。

## 複合值 {#composite-values}

物件與陣列的 `$value` 會根據 `$type` 序列化：

| `$type` | 序列化方式 |
|---|---|
| `shadow` | `[inset] <offsetX> <offsetY> <blur> <spread> <color>`，缺少的偏移量預設為 `0` |
| `border` | `<width> <style> <color>` |
| `transition` | `<duration> <timingFunction> <delay>` |
| *（陣列，任何型別）* | 每個項目個別序列化後用 `, ` 連接（分層陰影、`fontFamily` stack） |

帶有其他 `$type`（例如 `typography`）的物件值沒有單一值的序列化器。它們會展開成每個欄位一個子變數：`typography.heading` 搭配 `{ fontSize: '2rem' }` 會變成 `--typography-heading-font-size`。

## 自動完成 {#autocomplete}

當一個 token 的 `$type` 有對應到某些 CSS 屬性時，它會針對這些屬性輸出 `asValueOf` 自動完成，讓這個變數只在適合的地方被建議為 `var()` 值。內建的對應表涵蓋常見的 DTCG 型別：

| `$type` | 建議用於 |
|---|---|
| `color` | `color`、`background-color`、`border-color`、`outline-color`、`fill`、`stroke` |
| `dimension` | `width`、`height`、`min/max-width`、`min/max-height`、`margin`、`padding`、`gap`、`inset`、`font-size`、`border-radius` |
| `duration` | `transition-duration`、`animation-duration` |
| `fontFamily` | `font-family` |
| `fontWeight` | `font-weight` |
| `number` | `z-index`、`opacity`、`line-height`、`flex-grow`、`flex-shrink`、`order` |
| `shadow` | `box-shadow` |
| `cubicBezier` | `transition-timing-function`、`animation-timing-function` |

`typeAutocomplete` 會以 `$type` 為單位合併覆蓋這張對應表。每個項目都會取代該 `$type` 的預設清單；設為 `false` 則會完全停用作為值的建議。沒有 `$type`，或 `$type` 不在合併後對應表中的 token，會退回核心 `variables` 的預設行為（在所有地方都會被建議）：

```ts
designTokens: {
	// 只為 gap/padding/margin 建議 `spacing` token；絕不把 `z` token 當成值來建議。
	typeAutocomplete: {
		spacing: ['gap', 'padding', 'margin'],
		z: false,
	},
}
```

## 嚴格模式 {#strict-mode}

嚴格模式會治理在受 design token 治理的 CSS 屬性上允許哪些常值，並把違規以診斷的形式呈現出來。當一個屬性出現在合併後的 `typeAutocomplete` 對應表中，且對應的 `$type` 至少註冊了一個 token 時，這個屬性就是*受治理的*；受治理屬性上的值會依該 `$type` 進行驗證。嚴格模式為選擇性啟用，預設為關閉（近乎零成本的提早回傳），因此一個有效、且參考 token 的樣式不會受到任何更動：

::: code-group

<<< @/zh-tw/.examples/official-plugins/design-tokens.strict.example.pikain.ts [輸入]

<<< @/zh-tw/.examples/official-plugins/design-tokens.strict.example.pikaout.css [輸出]

:::

```ts
designTokens: {
	strict: {
		level: 'error',
		overrides: { 'background-color': 'warn', dimension: 'off' },
		allowedValues: ['0', /^var\(--legacy-/],
		semanticOnly: true,
		types: true,
	},
}
```

| 選項 | 行為 |
|---|---|
| `level` | 每個受治理屬性的基準嚴重性：`'off'`（預設）、`'warn'` 或 `'error'`。 |
| `overrides` | 以 key 為單位的嚴重性，key 可以是 CSS 屬性名稱（例如 `'background-color'`）或 `$type`（例如 `'color'`）。屬性 key 的覆寫優先於 `$type` key 的覆寫，後者又優先於 `level`。 |
| `allowedValues` | 在任何受治理屬性上額外接受的常值，會疊加在內建的各 `$type` 允許清單（`color`：`transparent`、`currentcolor`；`dimension`：`0`、`auto`）與 CSS 全域關鍵字之上。字串會與去除前後空白後的值做完全比對；`RegExp` 則會用來測試該值。 |
| `semanticOnly` | 設為 `true` 時（且 `level` 不是 `'off'`），在撰寫的樣式中參考 `primitive` layer 的 token 就是一種違規，只允許 `semantic` layer 的 token，而且 primitive token 會從自動完成中隱藏。 |
| `types` | 設為 `true` 時，會收窄所產生的 `pika.gen.ts` 中的值型別（見下文）。 |

一次嚴格模式違規會變成一個 `Diagnostic`（`{ level, code, message, plugin: 'design-tokens' }`），在樣式轉換期間透過引擎的 `onDiagnostic` 處理器回報；引擎絕不會拋出它。打包工具整合會安裝一個處理器，即時記錄每一個診斷（`'warning'` 會立即出現，開發時也一樣），收集 `'error'` 等級的診斷，並在 `buildEnd` 時拋出單一彙整後的 `Error` 來**使建置失敗**，因此 error 嚴重性的違規會中止正式版建置。請見下方的[診斷與報告](#diagnostics-and-reports)。

### 編譯期型別收窄 {#compile-time-type-narrowing}

`strict.types` 與 `level` 各自獨立：它會收窄所產生的 `pika.gen.ts`，讓無效的常值在任何建置執行之前，就在 IDE 中以紅色波浪底線標示出來。對每個受治理的屬性，TypeScript 所接受的值型別會變成一個互斥聯集，包含：針對每個屬於該 `$type` 的 token 的 `var(--token)` 參考（以及選用的 `var(--token, fallback)` 形式）、CSS 全域關鍵字、內建允許清單與任何字串形式的 `allowedValues`，以及針對 `calc()`、`color-mix()`、`min()`、`max()`、`clamp()` 與 `light-dark()` 這些函式形式的樣板字面值例外通道。

::: warning
只要出現任何 `RegExp` 形式的 `allowedValues` 項目，型別收窄就會完全停用（所有屬性都維持寬鬆），因為任意的 `RegExp` 無法忠實地表示成一個字面值聯集，否則可能會誤拒執行階段其實會接受的值。執行階段的診斷仍然適用。
:::

## 自訂 Loader 與 Normalizer {#custom-loaders-and-normalizers}

`loaders` 與 `normalizers` 可以在不改變內建行為的前提下擴充匯入流程：

- **`loaders`** 會把檔案路徑轉換成原始值。對每個字串來源，`match(id)` 回傳 `true` 的第一個 loader 勝出；若都沒有符合，就套用內建的 `.md`／JSON 處理方式。行內物件來源會略過 loader。請用 `ctx.addDependency(id)` 註冊來源路徑（在讀取它之前），這樣整合才會在檔案變更時重新載入。loader 的 `ctx.readFile` 就是外掛被建立時所帶的宿主能力，因此 loader 只有在 `/node` 進入點（或自訂 runtime）下才能讀取檔案。
- **`normalizers`** 會以有順序的鏈對每個載入的原始值執行，時機在內建的 DTCG normalizer 之後、攤平階段之前，每個 normalizer 都會接收前一個的輸出，並回傳一個 `DesignTokenGroup`。若沒有設定任何 normalizer，原始值會原封不動地保留下來。

```ts
import { parse as parseYaml } from 'yaml'

designTokens: {
	loaders: [
		{
			name: 'yaml',
			match: id => id.endsWith('.yaml') || id.endsWith('.yml'),
			load: async (id, ctx) => {
				ctx.addDependency(id)
				return parseYaml(await ctx.readFile(id))
			},
		},
	],
}
```

### 用 normalizer 轉接廠商格式 {#adapting-a-vendor-format-with-a-normalizer}

loader 只決定「怎麼讀取來源」；當某個設計工具輸出的形狀不是 W3C Design Tokens 時，比方說是一份扁平清單而不是巢狀樹狀結構，就由 normalizer 把它轉換成標準的 `DesignTokenGroup`。這就是不必手動預先轉檔、直接轉接廠商方言的做法。內建的 DTCG normalizer 會先執行，但它會把自己不認得的形狀原封不動地傳遞下去，所以你的 normalizer 仍會收到原始的廠商資料；轉換發生在攤平階段之前，因此不會產生「invalid token node」警告。

```ts
import type { DesignTokenGroup } from '@pikacss/plugin-design-tokens'

// 廠商輸出的是扁平清單，而不是巢狀的 DTCG 樹狀結構：
//   { "tokens": [{ "path": "color.brand", "value": "#3b82f6", "type": "color" }, …] }
interface VendorToken { path: string, value: string, type: string }

designTokens: {
	normalizers: [
		{
			name: 'vendor-flat-list',
			normalize: (raw) => {
				const group: DesignTokenGroup = {}
				const { tokens = [] } = raw as { tokens?: VendorToken[] }
				for (const { path, value, type } of tokens) {
					const segments = path.split('.')
					// 為最後一段以外的每個路徑片段走訪／建立巢狀 group。
					let node = group as Record<string, any>
					for (const segment of segments.slice(0, -1))
						node = (node[segment] ??= {})
					node[segments[segments.length - 1]!] = { $value: value, $type: type }
				}
				return group
			},
		},
	],
}
```

把像這樣的一組 loader／normalizer 打包成獨立模組，就能在多個專案間重用同一個廠商轉接器；這個接縫的設計就是為了讓轉接器能存在於核心外掛之外。

## 使用報告 {#usage-report}

當外掛被註冊時，引擎會在 `engine.designTokens` 上公開一個 design token 介面。`engine.designTokens.report()` 會回傳一個 `DesignTokensReport`，內容包含：已註冊的 token 總數、使用中／未使用的變數名稱、使用中的已棄用 token，以及依目前原子樣式儲存內容計算出的累計嚴格模式違規次數。嚴格模式診斷會透過引擎的 `onDiagnostic` 處理器即時傳遞，因此沒有任何佇列需要取出（drain）。

### 診斷與報告 {#diagnostics-and-reports}

打包工具外掛會透過它的診斷接線與一個 [unplugin](/zh-tw/integrations/unplugin) 選項來呈現這些工作：

- **診斷**：嚴格模式違規會透過引擎的診斷通道傳到打包工具。unplugin 會即時記錄每一個診斷，並在 `buildEnd` 時針對任何 `'error'` 等級的診斷拋出一個彙整後的建置錯誤，因此 error 嚴重性的違規會使建置失敗。沒有任何外掛層級的 `onDiagnostic` 選項可以設定：這個行為是內建的。
- **`report`**：設為 `true` 會在每次正式版建置時記錄一次使用摘要；傳入 `{ output }` 則會額外把完整報告以 JSON 寫到該路徑。報告只會在建置模式下輸出，因此開發伺服器不會在每次 HMR 更新時被洗版。

```ts
// vite.config.ts
import PikaCSS from '@pikacss/unplugin-pikacss/vite'

export default {
	plugins: [
		PikaCSS({
			report: { output: './design-tokens.report.json' },
		}),
	],
}
```

完整的選項參考請見 [Unplugin](/zh-tw/integrations/unplugin#diagnostics-and-reporting)。

## 設定 {#config}

| 屬性 | 說明 |
|---|---|
| sources | 輸出在 `:root` 底下的基礎 token 來源，可以是行內的 token group 物件、檔案路徑，或 `{ source, prefix?, layer? }` entry。當名稱衝突時，較晚的來源會覆寫較早的來源。 |
| themes | 以主題名稱作為 key 的主題覆寫。每個主題都有一個 `selector`（預設 `.<themeName>`）、選用的 `media` 查詢、選用的 `from` 分區選擇器，以及它自己的 `sources`。 |
| loaders | 自訂的來源 loader，會在內建的 `.md`／JSON 處理之前先嘗試。第一個符合的 loader 勝出。 |
| normalizers | 有順序的 normalizer 鏈，會在內建的 DTCG normalizer 之後、攤平之前套用。 |
| typeAutocomplete | 以 `$type` 為單位的自動完成覆寫對應表，會合併覆蓋在內建對應表之上。值為 `false` 會停用該 `$type` 作為值的建議。 |
| strict | 嚴格模式治理：`level`、以 key 為單位的 `overrides`、`allowedValues`、`semanticOnly`，以及編譯期的 `types`。預設：關閉。 |
| prefix | 加在每個產生的 CSS 變數名稱前面的前綴（不含開頭的 `--`）。預設值：`''`。 |
| root | 用來解析相對來源檔案路徑的基礎目錄。絕對路徑具有最高權威；相對值會從引擎宿主的專案根目錄解析。預設為宿主專案根目錄，使用 `/node` 進入點時退回 `process.cwd()`（未提供任何 runtime 能力時則為 `'.'`）。 |
| pruneUnused | 套用到每個產生的變數的剔除覆寫設定。未設定時，會套用 `variables` 設定的預設值（未使用的 token 會被剔除）。 |

> 完整的型別簽章與預設值請見 [API 參考 — Plugin Design Tokens](/api/plugin-design-tokens)。

## 下一步 {#next}

- [字型](/zh-tw/official-plugins/fonts)：網頁字型的載入與管理。
- [變數](/zh-tw/customizations/variables)：design token 會流入的核心變數系統。
- [Unplugin](/zh-tw/integrations/unplugin)：呈現嚴格模式違規的 `report` 選項與診斷通道。
