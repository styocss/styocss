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
  <a href="https://img.shields.io/bundlephobia/minzip/@pikacss/core?style=flat-square">
    <img src="https://img.shields.io/bundlephobia/minzip/@pikacss/core?style=flat-square" alt="minzipped size" />
  </a>
  <a href="https://img.shields.io/github/actions/workflow/status/DevilTea/pikacss/ci.yml?style=flat-square">
    <img src="https://img.shields.io/github/actions/workflow/status/DevilTea/pikacss/ci.yml?style=flat-square" alt="ci status" />
  </a>
</p>

---

## Introduction

### What is PikaCSS?
> PikaCSS is an Atomic CSS-in-JS engine that allow you to write style in CSS-in-JS way and output in Atomic CSS way.
>
> Inspired by [UnoCSS](https://github.com/unocss/unocss), [WindiCSS](https://github.com/windicss/windicss), [TailwindCSS](https://github.com/tailwindlabs/tailwindcss), [StylifyCSS](https://github.com/stylify) and [Fela.js](https://github.com/robinweser/fela)!

### Why PikaCSS is been created?
<details>
  <summary>Click to 👀 the reason</summary>

> I love the idea of Atomic CSS, there are many great Atomic CSS solutions out there, such as UnoCSS, WindiCSS, TailwindCSS, Stylify, etc.
>
> Unfortunately, I am poor to memorize the utility class names, so UnoCSS, WindiCSS or TailwindCSS is not for me.
>
> I am surprised by the zero learning curve concept of Stylify, but I don't like the idea of using a custom syntax to workaround the limitations of html class attribute.
>
> To solve the problems above, the CSS-in-JS way is the best way to write styles, but it is not the best way to output styles.
>
> So I created PikaCSS, it is a Atomic CSS-in-JS engine that allow you to write style in CSS-in-JS way and output in Atomic CSS way!
</details>

---

## Features
- 🥰 Framework Agnostic
  > It is decoupled from any framework, so you can use it with any framework!
- 🛠 Zero Runtime
  > It transforms CSS-in-JS to Atomic CSS at build time!
- 📖 Zero Learning Curve
  > In the simplest case, you just need to know the css property names!
- 🤖 TypeScript Auto-Completion
  > It has built-in TypeScript support, so you can get auto-completion!

---

<br>
<br>

<p align="center">
  Vite + Vue3 Example
</p>
<p align="center">
  <a href="https://stackblitz.com/fork/github/pikacss/pikacss/tree/main/examples/vite-vue3?file=src%2FApp.vue,src%2Fmain.ts,vite.config.ts">
    <img src="https://developer.stackblitz.com/img/open_in_stackblitz.svg" alt="Open in StackBlitz" />
  </a>
</p>

<br>
<br>

---

## License
[MIT](./LICENSE)
