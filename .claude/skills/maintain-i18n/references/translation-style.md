# zh-TW Translation Style Rules

Register: developer documentation, conversational. Sources of record: MDN zh-TW translation guide (https://github.com/mdn/translated-content/blob/main/docs/zh-tw/translation-guide.md), Microsoft zh-TW Localization Style Guide, 中文文案排版指北 (https://github.com/sparanoid/chinese-copywriting-guidelines). Where they disagree, the ruling below is final.

## Tone and grammar

- Use 你, never 您 (MDN developer-docs register; Microsoft's 您 is a product-UI rule and does not apply here).
- Active voice. Avoid 被-passive unless natural. Do not carry English plural markers (APIs → API). Drop pronouns English requires but Chinese does not.
- Accuracy over literalism: translate meaning, not sentence-for-sentence. Never ship raw machine-translation phrasing.
- Forbidden PRC stylistic patterns even with correct characters: 通過…來（→ 透過）、進行了…（→ direct verb）、對…進行（→ direct verb）、…性地/非常地-style adverb padding、filler 了 chains.

## Punctuation

- Chinese prose uses full-width ，。、：；！？ and 「」 quotes (『』 nested); 《》 for work titles.
- Parentheses: full-width （） in Chinese prose. Half-width ( ) only when the entire parenthetical is English/code, e.g. 個別屬性（longhand）→ 個別屬性 (longhand) is WRONG — mixed glosses still use full-width: 個別屬性（longhand）.
- Colon in prose: full-width ：. Enumeration comma: 頓號 、, closing pattern 「…、…、…，以及…」.
- Quoted English keeps its own half-width punctuation: 「Hello, world!」 not 「Hello，world！」.
- Half-width digits always. No repeated punctuation (！！). Ellipsis is …. Prefer rephrasing or （）/： over the —— dash.

## Spacing (盤古之白)

- One half-width space between CJK and Latin letters/digits: 使用 Vite 建置、2026 年 7 月.
- No space adjacent to full-width punctuation. No space between a number and % or °; space between a number and other units (20 TB).
- Inline code spans and links count as Latin runs → space on both sides against CJK.
- Link-boundary spacing ruling (指北 lists it as debated — we pick one): put spaces OUTSIDE the link text: 請 [提交 issue](...) 。 Lint-enforced consistency matters more than the choice.
- Proper-noun casing preserved exactly: GitHub, TypeScript, Vite — never lowercase or abbreviate creatively.

## Markdown / VitePress specifics

- Inline code (`...`): never translate; spacing as a Latin run.
- Fenced code blocks: comments ONLY may be translated. Inside a translated comment, code terms stay English (// 註冊 plugin 並回傳 engine). Twoslash blocks are validated by the build — never touch the code itself.
- Headings: translate text, append the English anchor: `## 快速開始 {#getting-started}`. Mandatory on every heading.
- Containers: per-page Chinese titles (`::: tip 提示` / `::: warning 警告` / `::: danger 危險` / `::: info 資訊` / `::: details 詳細資訊`); if the English page has a custom title, translate that title.
- Links: translate link text (unless code/proper noun); internal links → `/zh-tw/...`; `/api/*` and external URLs unchanged; snippet-include tab labels translated (`[Input]` → `[輸入]`, `[Output]` → `[輸出]`).
- Frontmatter: keys and enum values untouched; `title`/`description`/hero/features translated; `link:` paths localized; `relatedPackages`/`relatedSources` identical to English; `translation:` block managed by the status script only.
- Image alt text: translate. Screenshots with English UI stay as-is.
- Error messages, log lines, CLI output: byte-exact, always (e.g. `Cannot find name 'pika'`).
