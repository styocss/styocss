# SSR & Production

<!-- Section: Integrations | Category: integrations -->

<!-- Brief intro: PikaCSS output is a static CSS file produced at build time — that fact answers most SSR and production questions -->

## SSR, SSG, and Streaming Just Work

<!-- Explain why no special handling is needed: calls become string literals, all styles live in one imported CSS file, no runtime injection or style registry to flush; note the Nuxt module's plugin template only imports pika.css -->

## Production Builds

<!-- Explain build-mode behavior: up-front scan of scan.include, complete CSS written before bundling continues; list output contents (@layer order declaration, pruned preflights, deduplicated atomic classes); output passes through the bundler's normal CSS pipeline -->

## What Triggers a Reload in Dev

<!-- Explain engine re-creation triggers: config file changes and config dependencies registered via engine.addConfigDependency(path); note the esbuild exception and that ordinary source edits only update usages -->

## Type-Level Performance

<!-- Explain that pika.gen.ts size grows with the project and that type-system cost is tracked by the in-repo type-bench suite; no absolute numbers are published -->

## Next
<!-- Link to How PikaCSS Generates CSS, Unplugin, and Nuxt -->
