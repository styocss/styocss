---
title: Autocomplete
description: Understand domain-owned PikaCSS Typegen and deterministic editor suggestions.
relatedPackages:
  - '@pikacss/core'
  - '@pikacss/unplugin-pikacss'
relatedSources:
  - 'packages/core/src/typegen/registry.ts'
  - 'packages/core/src/typegen/render.ts'
  - 'packages/core/src/plugins/selectors.ts'
  - 'packages/core/src/plugins/shortcuts.ts'
  - 'packages/core/src/plugins/variables.ts'
category: customizations
order: 80
---

# Autocomplete

PikaCSS no longer has a global `autocomplete` configuration or runtime `appendAutocomplete()` pool. Each semantic subsystem owns the Typegen information it can describe correctly.

Generated authoring state is always published as `<stateDir>/pika.gen.ts`. Run `pikacss prepare` before standalone editor/typecheck/ESLint workflows and include that declaration in your TypeScript project.

## Selector and shortcut concrete members

Dynamic selector and shortcut definitions use two complementary fields:

- `inputType`: raw TypeScript describing the full accepted dynamic input family.
- `autocomplete`: deterministic concrete values that receive named completion members and resolved hover documentation.

```ts
selectors: {
  definitions: [
    {
      pattern: /^state-(.+)$/,
      inputType: '`state-${string}`',
      resolve: match => `&[data-state="${match[1]}"]`,
      autocomplete: ['state-open', 'state-closed'],
    },
  ],
}
```

Concrete members come from project/plugin configuration or deterministic catalogs. PikaCSS does not learn Typegen members from transformed application usages.

## Variable suggestions

Variables use leaf-local `suggest` metadata:

```ts
variables: {
  definitions: {
    '--brand-color': {
      value: '#3b82f6',
      suggest: {
        asProperty: true,
        asValueOf: ['color', 'backgroundColor'],
      },
    },
  },
}
```

## Plugin Typegen

Plugins contribute authoring declarations through the owner-bound `engine.typegen` capability during `configureEngine`, or preferably lower semantic definitions into an existing Core subsystem in `configureRawConfig` so that subsystem owns Typegen and runtime behavior together.

There is no supported manual `PikaAugment.Autocomplete`, `DefineAutocomplete`, or runtime `.add()` compatibility path.

## Suggestions are not arbitrary runtime validation

Generated types describe configured semantic members and supported static authoring. They do not make PikaCSS a runtime validator and they do not authorize runtime-dynamic `pika()` arguments. Compiler/ESLint static-usage rules remain authoritative for source legality.

## Examples

<<< @/.examples/customizations/autocomplete.example.ts

## Next

- [Selectors](/customizations/selectors)
- [Shortcuts](/customizations/shortcuts)
- [Plugin type augmentation](/plugin-development/type-augmentation)
