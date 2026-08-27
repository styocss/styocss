# @pikacss/plugin-reset

CSS reset plugin for PikaCSS. Injects popular CSS reset stylesheets as preflight styles.

## Installation

```bash
pnpm add -D @pikacss/plugin-reset
```

## Usage

The example below assumes the application already uses `@pikacss/unplugin-pikacss`; Nuxt applications can import the same `defineConfig` surface from `@pikacss/nuxt-pikacss`.

```ts
import { reset } from '@pikacss/plugin-reset'
import { defineConfig } from '@pikacss/unplugin-pikacss'

export default defineConfig({
  engine: {
    plugins: [reset()],
    reset: 'modern-normalize', // default
  },
})
```

## Documentation

See the [full documentation](https://pikacss.github.io/official-plugins/reset).

## License

MIT
