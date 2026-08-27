# Engine Config

<!-- Section: Getting Started | Category: getting-started -->

## Project fields

| Property | Description |
|---|---|
| engine | <!-- Per-entry EngineConfig --> |
| fnName | <!-- Compile-time callable root --> |
| cssModule | <!-- Logical runtime CSS module --> |
| transformedFormat | <!-- Base-call replacement shape --> |
| scan | <!-- Entry-owned source include/exclude patterns --> |
| report | <!-- Optional production report behavior --> |
| stateDir | <!-- Whole-project generated-state root --> |

## Multi-entry projects

<!-- Explain isolated entries with shared stateDir and unique fnName/cssModule. -->

## Engine fields

| Property | Description |
|---|---|
| prefix | <!-- Atomic class prefix --> |
| defaultSelector | <!-- Atomic selector template --> |
| plugins | <!-- Engine plugins --> |
| layers | <!-- CSS layer priorities --> |
| defaultPreflightsLayer | <!-- Default preflight layer --> |
| defaultUtilitiesLayer | <!-- Default utility layer --> |
| preflights | <!-- Base/preflight definitions --> |
| cssImports | <!-- CSS imports --> |
| important | <!-- !important policy --> |
| selectors | <!-- Object-only selector definitions + domain Typegen --> |
| shortcuts | <!-- Object-only shortcut definitions + domain Typegen --> |
| variables | <!-- Object-only local/external variable leaves --> |
| keyframes | <!-- Object-only keyframes definitions --> |

## Examples

<!-- Show canonical defineConfig({ engine: ... }) usage. -->

## Next
