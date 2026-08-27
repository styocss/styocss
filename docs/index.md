---
layout: home

hero:
  name: PikaCSS
  text: Atomic CSS-in-JS Engine
  tagline: Write styles in JS objects. Ship zero-runtime atomic CSS.
  image:
    light: /logo-black.svg
    dark: /logo-white.svg
    alt: PikaCSS Logo
  actions:
    - theme: brand
      text: Get Started
      link: /getting-started/what-is-pikacss
    - theme: alt
      text: API Reference
      link: /api/

features:
  - title: Zero Runtime
    details: All CSS is generated at build time. No runtime overhead in production.
    icon: ⚡
  - title: CSS-in-JS Syntax
    details: Write styles using familiar CSS property names. No utility class names to memorize.
    icon: ✍️
  - title: Atomic CSS Output
    details: Each CSS declaration becomes an atomic class, maximizing reuse and minimizing bundle size.
    icon: 🧬
  - title: Fully Customizable
    details: Selectors, shortcuts, variables, keyframes, and a powerful plugin system.
    icon: 🔧
  - title: Framework Agnostic
    details: Supports Vite, Rollup, Rolldown, Webpack, Rspack, and Nuxt.
    icon: 🌐
  - title: TypeScript First
    details: Full autocomplete and type checking for every CSS property and custom config.
    icon: 🤖
---

## Show Me the Code

Write styles with plain CSS property names, get atomic CSS at build time:

::: code-group

<<< @/.examples/getting-started/basic.example.pikain.ts [Input]

<<< @/.examples/getting-started/basic.example.pikaout.css [Output]

:::

Ready to try it? [Get started](/getting-started/what-is-pikacss) or open the [playground](https://pikacss.github.io/playground/) — no install needed.

Coming from another tool? See [how PikaCSS compares](/getting-started/comparison) to UnoCSS, Tailwind CSS, Panda CSS, and vanilla-extract.
