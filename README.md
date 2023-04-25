<br>

<h1 align="center">
  ✨ StyoCSS ✨
</h1>

<h3 align="center">
  The instant on-demand Atomic CSS-in-JS engine
</h4>

<br>
<br>

<p align="center">
  <img src="./assets/logo.svg" alt="StyoCSS Logo" width="180" />
</p>

<br>
<br>

<p align="center">
  <code>Atomic CSS</code> + <code>CSS-in-JS</code> = <code>StyoCSS</code>
</p>

<br>

<blockquote align="center" font-size="10px">
  🚧 This project is still under development. 🚧
  
  The API is not stable yet.
</blockquote>

<br>
<br>

<p align="center">
  Simple vue 3 example
</p>
<p align="center">
  <a href="https://stackblitz.com/github/styocss/simple-vue-example?file=vite.config.ts,src%2Fcomponents%2FVersionA.vue,src%2Fcomponents%2FVersionB.vue">
    <img src="https://developer.stackblitz.com/img/open_in_stackblitz.svg" alt="Open in StackBlitz" />
  </a>
</p>

<br>
<br>

<p align="center">
  <a href="https://www.npmjs.com/package/@styocss/core">
    <img src="https://img.shields.io/npm/v/@styocss/core?style=flat-square" alt="npm version" />
  </a>
  <a href="https://www.npmjs.com/package/@styocss/core">
    <img src="https://img.shields.io/npm/dm/@styocss/core?style=flat-square" alt="npm downloads" />
  </a>
  <a href="https://img.shields.io/bundlephobia/minzip/@styocss/core?style=flat-square">
    <img src="https://img.shields.io/bundlephobia/minzip/@styocss/core?style=flat-square" alt="minzipped size" />
  </a>
  <a href="https://img.shields.io/github/actions/workflow/status/DevilTea/styocss/ci.yml?style=flat-square">
    <img src="https://img.shields.io/github/actions/workflow/status/DevilTea/styocss/ci.yml?style=flat-square" alt="ci status" />
  </a>

---

## Introduction

### What is StyoCSS?
> StyoCSS is an Atomic CSS-in-JS engine that allow you to write style in CSS-in-JS way and output in Atomic CSS way.
>
> Inspired by [UnoCSS](https://github.com/unocss/unocss), [WindiCSS](https://github.com/windicss/windicss), [TailwindCSS](https://github.com/tailwindlabs/tailwindcss), [StylifyCSS](https://github.com/stylify) and [Fela.js](https://github.com/robinweser/fela)!

### Why StyoCSS is been created?
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
> So I created StyoCSS, it is a Atomic CSS-in-JS engine that allow you to write style in CSS-in-JS way and output in Atomic CSS way!
</details>

---

## Features
- 🥰 Framework Agnostic
  > It is decoupled from any framework, so you can use it with any framework!
- ✨ Zero Configuration
  > Basically, you don't need to configure anything!
- 📖 Zero Learning Curve
  > In the simplest case, you just need to know the css property names!
- ⚒️ Fully Customizable
  > Create your preset to fit your needs!
- 🧰 Macro Rules
  > Build your own rules by atomic rules or even other macro rules!
- 🧠 Typescript Intellisense 
  > Without any additional extension, you would get the intellisense support!
- 📦 Tiny Size (~3kb min+brotli)
  > The core is just that tiny and it has no runtime dependencies!

---

## Getting Started
### Using with Vite

#### Install the plugin:
```bash
npm i -D @styocss/vite-plugin-styocss
```

#### Add the plugin to your `vite.config.ts`:
```ts
// vite.config.ts
import { defineConfig } from 'vite'
import StyoCSS from '@styocss/vite-plugin-styocss'

export default defineConfig({
  plugins: [
    StyoCSS({ /* options */ }),
  ],
})
```

<details>
  <summary>Click to see the options</summary>

```ts
interface StyoPluginOptions {
  /**
   * List of file extensions to be processed by the plugin.
   * @default ['.vue', '.ts', '.tsx', '.js', '.jsx']
   */
  extensions?: string[]

  /**
   * Configure the styo engine.
   */
  config?: StyoEngineConfig<string, string, string>

  /**
   * Customize the name of the style function.
   * @default 'style'
   */
  nameOfStyoFn?: string

  /**
   * Enable/disable the auto join of the generated atomic rule names with space.
   * It is useful when you want to use the generated atomic rule names directly in a class attribute.
   * @default false
   */
  autoJoin?: boolean

  /**
   * Enable/disable the generation of d.ts files.
   * If a string is provided, it will be used as the path to the d.ts file.
   * Default path is `<path to vite config>/styo.d.ts`.
   * @default false
   */
  dts?: boolean | string
}
```

</details>

#### Add the `virtual:styo.css` module to your `main.ts`:
```ts
// main.ts
import 'virtual:styo.css'
```

#### Use the `styo` function to write styles:
> The `styo` function is a global function that is provided by the plugin.
> You could customize the name of the function by the `nameOfStyoFn` option.

```html
// App.vue
<template>
  <div 
    :class="styo(
      // Easy to group styles by pseudo-class or media query.
      { 
        color: 'red',
        backgroundColor: 'yellow',
      },
      { 
        $selector: ':hover',
        color: 'blue',
        backgroundColor: 'green',
      },
      {
        $nestedWith: '@media (max-width: 640px)',
        fontSize: '32px',
      }
    )"
  >
    Hello World!
  </div>
</template>
```

```tsx
// App.tsx
export const App = () => {
  return (
    // The `style` function would return an array of atomic rule names.
    // You could use the `join` method to join the array into a string.
    <div className={styo(/* ... */).join(' ')}>
      Hello World!
    </div>
  )
}
```
> Check out the `./tests/core.test.ts` to see more styo usages.
>
> Also, go to the [examples](https://stackblitz.com/github/styocss/simple-vue-example?file=vite.config.ts,src%2Fcomponents%2FVersionA.vue,src%2Fcomponents%2FVersionB.vue) to see more real usages.

---

## License
[MIT](./LICENSE)
