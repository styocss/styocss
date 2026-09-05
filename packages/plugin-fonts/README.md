# @pikacss/plugin-fonts

Web fonts plugin for PikaCSS. Resolves Google, Bunny, and Fontshare through `unifont` into build-time `@font-face` rules, supports legacy/custom stylesheet providers, and creates CSS variables and shortcuts.

## Installation

```bash
pnpm add -D @pikacss/plugin-fonts
```

## Usage

The example below assumes the application already uses `@pikacss/unplugin-pikacss`; Nuxt applications can import the same `defineConfig` surface from `@pikacss/nuxt-pikacss`.

```ts
import { fonts } from '@pikacss/plugin-fonts'
import { defineConfig } from '@pikacss/unplugin-pikacss'

export default defineConfig({
  engine: {
    plugins: [fonts()],
    fonts: {
      provider: 'google',
      fonts: {
        sans: 'Inter:400,500,600,700',
      },
    },
  },
})
```

## Documentation

See the [full documentation](https://pikacss.github.io/official-plugins/fonts).

## License

MIT
