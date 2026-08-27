# @pikacss/config

Canonical project-configuration package for PikaCSS.

The package root exports `defineConfig()`, the project config types, and the ordinary `@pikacss/core` authoring surface. Most application consumers should import these APIs from the directly installed outer package (`@pikacss/unplugin-pikacss` or `@pikacss/nuxt-pikacss`) instead of adding `@pikacss/config` separately.

Direct imports from `@pikacss/config` require a direct dependency on this package. The `@pikacss/config/host` subpath contains host-side config loading and normalization primitives; it is intentionally not re-exported through Integration or the outer consumer packages.

See the [engine configuration guide](https://pikacss.github.io/getting-started/engine-config) and the generated [Config API reference](https://pikacss.github.io/api/config).
