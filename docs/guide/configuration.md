---
title: Configuration
description: Learn how to configure PikaCSS
outline: deep
---

# Configuration

## TypeScript Support
::: tip Important!
Please remember to add `/// <reference path="./src/pika.gen.ts" />` to the top of your pika config file.
:::

## Engine Options
- ### `plugins`
    Register plugins to extend PikaCSS functionality.

- ### `prefix`
    Set the prefix for generated atomic style id.
    - For example, `pika-` will generate `pika-a`, `pika-b`, etc.

- ### `defaultSelector`
    Set the default selector format (`%` will be replaced with the atomic style id).
    - `.%` -> Use with class attribute `<div class="a b c">`
    - `[data-pika~="%"]` -> Use with attribute selector `<div data-pika="a b c">`

- ### [`preflights`](/guide/preflights)
    Define global CSS styles that will be injected before atomic styles. Can be used for CSS variables, global animations, base styles, etc. Two ways to define:
    1. static CSS string
    2. function that returns a CSS string, which will get params
        - `engine`: Engine
        - `isFormatted`: boolean

::: info Type

<details>
<summary>View <code>EngineConfig</code>'s interface</summary>

<<< @/../packages/core/src/internal/types/engine.ts#EngineConfig

</details>
:::

## Core plugins' options:
- ### [`variables`](/guide/variables)

- ### [`keyframes`](/guide/keyframes)

- ### [`selectors`](/guide/selectors)

- ### [`shortcuts`](/guide/shortcuts)

- ### [`important`](/guide/important)
