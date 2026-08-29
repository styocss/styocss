# Icons

<!-- Section: Official Plugins | Category: official-plugins -->

<!-- Explain icon shortcuts via Iconify integration -->
<!-- Explain package-root icons() vs /node built-in local loading vs createIconsPlugin(runtime). -->

## Config

| Property | Description |
|---|---|
| prefix | <!-- Icon class prefix --> |
| mode | <!-- Rendering mode: mask, background, auto --> |
| scale | <!-- Iconify source-dimension scale; qualify the 1em fallback to Iconify JSON collections --> |
| collections | <!-- Custom collections; distinguish collection-wide/enumerable watch dependencies from opaque request-only loaders --> |
| customizations | <!-- Custom icon transformations; state iconCustomizer -> additionalProps -> extraProperties precedence --> |
| autoInstall | <!-- Built-in /node local-loader auto-install behavior; ordered roots use autoInstall only on the final root; note the ESLint guard --> |
| cwd | <!-- string|string[] local-loader roots searched in order; built-in node auto-install only reaches the final root; relative/default values resolve from Engine host projectRoot --> |
| cdn | <!-- CDN URL for icon loading --> |
| unit | <!-- After iconCustomizer, fills missing/falsy dimensions; Iconify additionalProps then applies, extraProperties win duplicates, and one remaining dimension may be derived from aspect ratio --> |
| extraProperties | <!-- Iconify properties forwarded to generated styles; duplicate additionalProps keys, including width/height, are overridden --> |
| processor | <!-- Post-process the generated StyleItem; meta.name is the parsed/requested name, not guaranteed canonical/alias target --> |
| autocomplete | <!-- Explicit additions; /node uses each root's nearest governing manifest and only dependencies/devDependencies/optionalDependencies --> |

> See [API Reference — Plugin Icons](/api/plugin-icons) for full type signatures and defaults.

<!-- For watchable collections, warn that request-only dependency callbacks do not expand the finalized watcher and branded descriptors must not be object-spread. -->

## Next
<!-- Link to other Official Plugins -->
