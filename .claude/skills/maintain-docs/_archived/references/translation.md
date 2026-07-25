# Translation

## i18n Path Conventions

English docs are the root locale. Translated docs mirror the structure under `docs/zh-TW/`:

```
docs/
├── getting-started/
│   └── installation.md          ← English (root)
├── zh-TW/
│   └── getting-started/
│       └── installation.md      ← zh-TW translation
```

- English pages are always created first. Translations follow.
- zh-TW pages must use identical `relatedPackages`, `relatedSources`, `category`, and `order` frontmatter values. Only `title` and `description` may differ.
- Example files in `docs/zh-TW/.examples/` are copied from `docs/.examples/` with comments translated.

## Home Page Translation

The home page (`docs/zh-TW/index.md`) uses the same `layout: home` structure:

- Translate `hero.text`, `hero.tagline`, `hero.actions[].text`, and `hero.image.alt`.
- Translate each `features[].title` and `features[].details`.
- Keep `hero.name` (product name) in English.
- Keep `hero.actions[].link` pointing to the correct zh-TW routes (e.g. `/zh-TW/getting-started/`).

## Example Translation

- Runtime clears `docs/zh-TW/.examples/` and copies all files from `docs/.examples/`.
- Agent translates code comments, string literals with user-facing text, and descriptive variable names in the copied examples.
- `.pikaout.css` files are identical between languages (CSS output does not change).
- Example tests in zh-TW must still pass after translation.

## Translation Quality Rules

### Keep in English

The following terms must remain in English — do not transliterate or translate them:

- engine, build-time, atomic CSS, plugin, hook, selector, config, runtime, autocomplete, bundler, class names, shortcut, keyframe, unplugin
- API names and identifiers: `pika()`, `createEngine()`, `configureEngine`, `engine.use()`, `engine.renderAtomicStyles()`
- Package names: `@pikacss/core`, `@pikacss/unplugin-pikacss`, `@pikacss/nuxt`
- File paths, URLs, code inside fenced blocks (except comments)
- Established web/JS ecosystem terms when the English form is universally used in Taiwan developer communities (e.g. middleware, callback, proxy, promise, async/await)

### Taiwan Wording Baseline

When translating general technical prose, use Taiwan conventions:

| Prefer | Avoid (CN usage) |
|---|---|
| 設定 | 配置 |
| 檔案 | 文件（when meaning file） |
| 模組 | 模塊 |
| 原始碼 | 源碼 / 源代碼 |
| 變數 | 變量 |
| 陣列 | 數組 |
| 物件 | 對象 |
| 函式 | 函數 |
| 巢狀 | 嵌套 |
| 預設 | 默認 |
| 參數 | 參數（same） |
| 匯入 / 匯出 | 導入 / 導出 |
| 非同步 | 異步 |
| 快取 | 緩存 |
| 縮排 | 縮進 |
| 專案 | 項目（when meaning project） |
| 全域 | 全局 |
| 執行 | 運行 |
| 建立 | 創建 |
| 範例 | 示例 |
| 程式碼 | 代碼 |
| 文件 | 文檔（when meaning documentation） |
| 相依性 | 依賴 |

### Structure Preservation

- Preserve all Markdown structure, frontmatter fields (except `title`/`description`), code blocks, link targets, `<llm-only>`, and `<llm-exclude>` structure.

## Translation Workflow

1. Resolve scope: `status` (check state), `full sync` (all pages), or specific paths/sections.
2. Runtime reset phase: `translate --reset` deletes outdated zh-TW files, copies fresh English sources. `translate --reset-examples` copies examples.
3. Agent translation phase: translate content following quality rules above, translate example comments, preserve frontmatter except `title`/`description`.
4. Runtime updates zh-TW nav/sidebar configuration in `docs/.vitepress/config.ts`.
5. Mark synced: `translate --mark-synced <page-paths...>` records the English content hash.
6. Validate: `pnpm --filter @pikacss/docs test` and `pnpm --filter @pikacss/docs build`.
