# Frameworks

<!-- Section: Integrations | Category: integrations -->

<!-- Brief intro: PikaCSS is framework-agnostic — pika() returns a class-name string; snippets mirror the Playground templates -->

<!-- State the two universal rules: pika is a global provided by the build plugin (no import), and 'pika.css' is imported once in the entry file -->

::: tip
<!-- Note that templates point tsCodegen/cssCodegen into src/ so a stock tsconfig picks up the generated declarations -->
:::

## Vue

<!-- vite.config.ts with the PikaCSS plugin before the Vue plugin; :class binding; template typing via the ComponentCustomProperties augmentation in pika.gen.ts; entry-file import of pika.css -->

## React

<!-- vite.config.ts setup; className usage; entry-file import of pika.css -->

## Solid

<!-- vite.config.ts setup; class usage; shortcut references composing with inline definitions; entry-file import of pika.css -->

## Nuxt

<!-- Point to the dedicated module instead of manual wiring; link to the Nuxt page -->

## Supported File Types

<!-- State the supported set: JS family (.js/.ts/.jsx/.tsx) plus Vue SFCs (.vue); other markup formats are not processed; link to Unplugin for scan options -->

## Next
<!-- Link to Setup, SSR & Production, and Unplugin -->
