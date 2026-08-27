# Plugin: Reset

> Read this when the user asks about CSS reset styles, normalized base styles, or the reset plugin configuration.

## Installation

```bash
pnpm add -D @pikacss/plugin-reset
```

## Setup

```ts
// pika.config.ts
import { defineConfig } from '@pikacss/unplugin-pikacss'
import { reset } from '@pikacss/plugin-reset'

export default defineConfig({
  engine: {
  plugins: [reset()],
  },
})
```

## Do Not Miss These Rules

- `reset()` takes no arguments. Always show it as `plugins: [reset()]`.
- Choose the reset stylesheet with the top-level `reset` config key on `EngineConfig`, not with plugin arguments.
- The plugin emits on its own dedicated `reset` layer with order/priority `-1`, so it renders before every other layer.
- When explaining this plugin in prose, explicitly include the literal `-1` value rather than only saying that the reset runs first.

If the `reset` config key is unset, the plugin uses `'modern-normalize'`.

## Choosing a Reset Style

Set the `reset` config key to one of:

| Value | Description |
|---|---|
| `'modern-normalize'` | modern-normalize CSS **(default)** |
| `'normalize'` | normalize.css |
| `'eric-meyer'` | Eric Meyer's classic reset |
| `'andy-bell'` | Andy Bell's modern reset |
| `'the-new-css-reset'` | The New CSS Reset |

```ts
export default defineConfig({
  engine: {
  reset: 'andy-bell',
  plugins: [reset()],
  },
})
```

## Behavior

- `reset()` does not accept inline options; the `reset` config key is the only way to choose a stylesheet.
- If `reset` is unset, the plugin emits the `modern-normalize` stylesheet by default.
- Always call out that the chosen reset is emitted as a preflight on a dedicated `reset` layer with order/priority `-1`, and prefer writing the literal `-1` value explicitly in the answer.
- No runtime cost — CSS is injected statically at build time.
