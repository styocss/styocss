# Reference route inventory

This directory defines the canonical page inventory for lookup-oriented documentation.

## Route order

1. API Reference overview
2. Package API pages

## Page inventory

### API Reference

- `api/index.md` — explains the structure and usage of the generated API reference
- `api/core.md` — `@pikacss/core` exports
- `api/integration.md` — `@pikacss/integration` exports
- `api/unplugin.md` — `@pikacss/unplugin` exports
- `api/nuxt.md` — `@pikacss/nuxt` exports
- `api/plugin-reset.md` — `@pikacss/plugin-reset` exports
- `api/plugin-icons.md` — `@pikacss/plugin-icons` exports
- `api/plugin-fonts.md` — `@pikacss/plugin-fonts` exports
- `api/plugin-typography.md` — `@pikacss/plugin-typography` exports
- `api/eslint-config.md` — `@pikacss/eslint-config` exports and usage surface

## Naming notes

- Package pages use package-oriented slugs because the API route is primarily organized by published package boundaries.
- If the generator later chooses directory-style package pages, the brief paths can be updated without changing the section ownership.