# @pikacss/plugin-typography

Typography plugin for PikaCSS. Provides `prose` shortcuts for styling long-form content.

## Installation

```bash
pnpm add -D @pikacss/plugin-typography
```

## Usage

The example below assumes the application already uses `@pikacss/unplugin-pikacss`; Nuxt applications can import the same `defineConfig` surface from `@pikacss/nuxt-pikacss`.

```ts
import { typography } from '@pikacss/plugin-typography'
import { defineConfig } from '@pikacss/unplugin-pikacss'

export default defineConfig({
  engine: {
    plugins: [typography()],
  },
})
```

Then use in templates:

```vue
<article :class="pika('prose')">
  <h1>Title</h1>
  <p>Content with beautiful typography.</p>
</article>
```

## Documentation

See the [full documentation](https://pikacss.github.io/official-plugins/typography).

## License

MIT
