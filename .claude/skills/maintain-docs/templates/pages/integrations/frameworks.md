# Frameworks

<!-- Section: Integrations | Category: integrations -->

<!-- Brief intro: PikaCSS is framework-agnostic; the configured base pika() becomes class-name data at build time. State that examples use the default string output and mention transformedFormat: 'array' as the entry-level alternative. Snippets mirror the Playground templates. -->

<!-- State the two universal rules: the configured pika root is a compile-time global provided by the build plugin (no import), and applications import the owning entry's logical cssModule where its styles are needed (`pika.css` is the single-entry default). -->

::: tip
<!-- Explain generic generated-state typing: run pikacss prepare and include/reference .pikacss/pika.gen.ts from the TS project; Typegen location is not a bundler option. -->
:::

## Vue

<!-- vite.config.ts with the PikaCSS plugin before the Vue plugin; :class binding; template typing via the ComponentCustomProperties augmentation in pika.gen.ts; entry-file import of the default logical pika.css module -->

## React

<!-- vite.config.ts setup; className usage; entry-file import of the default logical pika.css module -->

## Solid

<!-- vite.config.ts setup; class usage; shortcut references composing with inline definitions; entry-file import of the default logical pika.css module -->

## Nuxt

<!-- Point to the dedicated module. Mention Nuxt prepare:types wiring and single-vs-explicit-multi CSS auto-import policy. -->

## Supported File Types

<!-- State the supported JS-family + Vue SFC set; other markup formats are not processed. Scan belongs to canonical project config, not adapter options. -->

## Next
<!-- Link to Setup, SSR & Production, and Unplugin -->
