# @pikacss/nuxt-pikacss

Nuxt module for PikaCSS. Registers the supported Vite adapter, prepares generated authoring types through Nuxt's type lifecycle, and auto-imports the sole CSS module for single-entry authoring.

## Installation

```bash
pnpm add -D @pikacss/nuxt-pikacss
```

## Usage

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@pikacss/nuxt-pikacss'],
})
```

## CLI

Installing this package also provides the Nuxt-owned `pikacss` binary:

```bash
pikacss init --cwd .
pikacss prepare --cwd .
pikacss prepare --cwd . --config ./config/pika.config.ts
```

The package-local `pikacss prepare` directly prepares PikaCSS generated state with the Nuxt public-entry identity. It does not redirect to `nuxt prepare`. Normal Nuxt workflows do not need to run it separately: the module invokes the same preparation operation from Nuxt's `prepare:types` lifecycle, so `nuxt prepare`, `nuxt dev`, and `nuxt build` can materialize and reference the canonical generated declaration automatically.

## Documentation

See the [full documentation](https://pikacss.github.io/integrations/nuxt).

## License

MIT
