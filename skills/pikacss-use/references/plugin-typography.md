# Plugin: Typography

> Read this when the user asks about prose styles, typographic defaults for content-rich pages, or the typography plugin.

## Installation

```bash
pnpm add -D @pikacss/plugin-typography
```

## Setup

```ts
// pika.config.ts
import { defineConfig } from '@pikacss/unplugin-pikacss'
import { typography } from '@pikacss/plugin-typography'

export default defineConfig({
  engine: {
  plugins: [typography()],
  },
})
```

## Usage in pika()

Apply the `prose` shortcut to a content container:

```vue
<article :class="pika('prose')">
  <h1>My Article</h1>
  <p>This content gets typographic styling automatically.</p>
</article>
```

### Available Shortcuts

| Shortcut | Purpose |
|---|---|
| `prose` | All prose styles (combines all modules below) |
| `prose-base` | Base typography (body text) |
| `prose-paragraphs` | Paragraph spacing |
| `prose-links` | Link styling |
| `prose-emphasis` | Bold/italic styling |
| `prose-kbd` | Keyboard input styling |
| `prose-lists` | List styling (ul, ol) |
| `prose-hr` | Horizontal rule styling |
| `prose-headings` | Heading hierarchy (h1–h6) |
| `prose-quotes` | Blockquote styling |
| `prose-media` | Image/video/figure styling |
| `prose-code` | Inline and block code styling |
| `prose-tables` | Table styling |

### Size Variants

| Shortcut | Effect |
|---|---|
| `prose-sm` | Smaller font-size and line-height |
| `prose-lg` | Larger font-size and line-height |
| `prose-xl` | Extra large |
| `prose-2xl` | Double extra large |

Combine with base: `pika('prose', 'prose-lg')`

## Customization

Override default CSS custom properties via the `typography` config key:

```ts
export default defineConfig({
  engine: {
  typography: {
    variables: {
      '--pk-prose-color-body': '#1a1a1a',
      '--pk-prose-color-headings': '#111',
      '--pk-prose-color-links': '#2563eb',
      '--pk-prose-color-code': '#e11d48',
    },
  },
  plugins: [typography()],
  },
})
```

Typography color variables use the full `--pk-prose-color-*` naming scheme from the source API, so overrides should use those exact custom property names rather than shortened aliases.
