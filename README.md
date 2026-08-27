<h1 align="center">
  ✨ PikaCSS ✨
</h1>

<h3 align="center">
  The instant on-demand Atomic CSS-in-JS engine
</h3>

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./docs/public/logo-white.svg">
    <img alt="PikaCSS Logo" width="280" src="./docs/public/logo-black.svg">
  </picture>
</p>

<p align="center">
  <code>PikaCSS</code> = <code>Atomic CSS</code> + <code>CSS-in-JS</code>
</p>

<br>
<blockquote align="center" font-size="10px">
  🚧 This project is still under development. 🚧

  The API is not stable yet.
</blockquote>
<br>

<p align="center">
  <a href="https://www.npmjs.com/package/@pikacss/core">
    <img src="https://img.shields.io/npm/v/@pikacss/core?style=flat-square" alt="npm version" />
  </a>
  <a href="https://www.npmjs.com/package/@pikacss/core">
    <img src="https://img.shields.io/npm/dm/@pikacss/core?style=flat-square" alt="npm downloads" />
  </a>
  <a href="https://bundlephobia.com/package/@pikacss/core">
    <img src="https://img.shields.io/bundlephobia/minzip/@pikacss/core?style=flat-square" alt="minzipped size" />
  </a>
  <a href="https://github.com/pikacss/pikacss/actions/workflows/ci.yml">
    <img src="https://img.shields.io/github/actions/workflow/status/pikacss/pikacss/ci.yml?style=flat-square" alt="ci status" />
  </a>
</p>

<p align="center">
  <a href="https://deepwiki.com/pikacss/pikacss">
    <img src="https://deepwiki.com/badge.svg" alt="Ask DeepWiki">
  </a>
</p>

---

## Introduction

### What is PikaCSS?
> PikaCSS is an Atomic CSS-in-JS engine that lets you write styles in a CSS-in-JS way and outputs them as atomic CSS.
>
> Inspired by [UnoCSS](https://github.com/unocss/unocss), [WindiCSS](https://github.com/windicss/windicss), [TailwindCSS](https://github.com/tailwindlabs/tailwindcss), [StylifyCSS](https://github.com/stylify) and [Fela.js](https://github.com/robinweser/fela)!

### Why was PikaCSS created?
<details>
  <summary>Click to 👀 the reason</summary>

> I love the idea of Atomic CSS, and there are many great Atomic CSS solutions out there, such as UnoCSS, WindiCSS, TailwindCSS, Stylify, etc.
>
> Unfortunately, I am terrible at memorizing utility class names, so UnoCSS, WindiCSS and TailwindCSS are not for me.
>
> I was impressed by Stylify's zero-learning-curve concept, but I don't like the idea of using a custom syntax to work around the limitations of the HTML class attribute.
>
> Given the problems above, CSS-in-JS is the best way to *write* styles, but it is not the best way to *output* them.
>
> So I created PikaCSS: an Atomic CSS-in-JS engine that lets you write styles in a CSS-in-JS way and outputs them as atomic CSS!
</details>

---

## Quick Look

Write plain CSS-in-JS:

<!-- eslint-skip -->
```ts
const className = pika({
  color: 'red',
  fontSize: '16px',
})
```

Get atomic CSS at build time:

```css
@layer utilities {
  .pk-a {
    color: red;
  }
  .pk-b {
    font-size: 16px;
  }
}
```

---

## Quick Links

- 📚 Documentation: <https://pikacss.github.io/>
- 🛝 Playground (in-browser, no install): <https://pikacss.github.io/playground/>
- ⚖️ Comparison with UnoCSS / Tailwind CSS / Panda CSS / vanilla-extract: <https://pikacss.github.io/getting-started/comparison>

---

## Features
- 🥰 Framework Agnostic
  > It is decoupled from any framework, so you can use it with any framework!
- 🛠 Zero Runtime
  > It transforms CSS-in-JS to Atomic CSS at build time!
  >
  > ⚠️ **Important**: All arguments passed to `pika()` must be statically analyzable at build time. Runtime variables, function calls, or dynamic expressions are not supported.
- 📖 Zero Learning Curve
  > In the simplest case, you just need to know the css property names!
- 🤖 TypeScript Auto-Completion
  > It has built-in TypeScript support, so you can get auto-completion!

---

## Project Status

PikaCSS is pre-1.0 (`0.0.x`) and under active development. The public API may still change between releases, so pin exact versions if you depend on it. Bug reports and feedback are welcome on the [issue tracker](https://github.com/pikacss/pikacss/issues). See the [documentation](https://pikacss.github.io/) for the current feature set.

---

## License
[MIT](./LICENSE)
