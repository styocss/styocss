# Frameworks

<!-- Section: Integrations | Category: integrations -->

<!-- Brief intro: PikaCSS is framework-agnostic — pika() returns a class-name string; snippets mirror the Playground templates -->

<!-- State the two universal rules: pika is a global provided by the build plugin (no import), and 'pika.css' is imported once in the entry file -->

::: tip
<!-- Explain generic generated-state typing: run pikacss prepare and include/reference .pikacss/pika.gen.ts from the TS project; Typegen location is not a bundler option. -->
:::

## Vue

<!-- vite.config.ts with the PikaCSS plugin before the Vue plugin; :class binding; template typing via the ComponentCustomProperties augmentation in pika.gen.ts; entry-file import of pika.css -->

## React

<!-- vite.config.ts setup; className usage; entry-file import of pika.css -->

## Solid

<!-- vite.config.ts setup; class usage; shortcut references composing with inline definitions; entry-file import of pika.css -->

## Nuxt

<!-- Point to the dedicated module. Mention Nuxt prepare:types wiring and single-vs-explicit-multi CSS auto-import policy. -->

## Supported File Types

<!-- State the supported JS-family + Vue SFC set; other markup formats are not processed. Scan belongs to canonical project config, not adapter options. -->

## Next
<!-- Link to Setup, SSR & Production, and Unplugin -->
