# Getting Started Overview

- Canonical docs path: `docs/getting-started/index.md`
- Route group: `learn`
- Section: `Getting Started`
- Category: `getting-started`
- Page kind: `overview`
- Status: `planned`
- Locale policy: `mirror-to-zh-TW`

## Purpose

Orient readers to PikaCSS and route them to the right next page in the Learn path.

## Target reader

- New adopters evaluating whether PikaCSS fits their project.
- Users who need the shortest path into the rest of the Learn route.

## Prerequisites

- Route stage: This is the first page in the Learn path.
- Capability: No prior PikaCSS knowledge is required.

## Must include

- What PikaCSS is and what kind of workflow it enables.
- What readers will accomplish by following the Learn path.
- How readers should choose between installation, framework integrations, and plugin usage next.
- Why generated files and configuration matter later in the route.

## Example requirement

- Include one minimal engine example that shows input-to-output value.

## Must not include

- Full installation instructions.
- Framework-specific setup steps.
- Detailed API or feature explanations that belong in later pages.

## Link contract

- Incoming route-local: None.
- Incoming cross-route: Home page, README-level docs entry points, and Skills or Troubleshooting pages that reroute beginners.
- Outgoing route-local: `installation.md` as the default next step, plus `../integrations/index.md` and `../configuration/index.md` as same-route branching entry points.
- Outgoing cross-route: None.

## Source of truth

- `README.md`
- `packages/core`
- `demo/`

## Notes

- Keep this page as the routing hub for the Learn spine.