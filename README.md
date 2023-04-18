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
  Here is a simple vue 3 example
</p>
<p align="center">
  <a href="https://stackblitz.com/github/styocss/simple-vue-example?file=vite.config.ts,src%2Fcomponents%2FVersionA.vue,src%2Fcomponents%2FVersionB.vue">
    <img src="https://developer.stackblitz.com/img/open_in_stackblitz_small.svg" alt="Open in StackBlitz" />
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
   * Function to create a Styo instance. If not provided, a default instance will be created.
   * The function would provide a builder instance to customize the Styo instance.
   */
  createStyo?: (builder: StyoInstanceBuilder) => StyoInstance

  /**
   * Customize the name of the style function.
   * @default 'style'
   */
  nameOfStyleFn?: string

  /**
   * Enable/disable the generation of d.ts file, feel free to add it to your .gitignore.
   * If a string is provided, it will be used as the path to the d.ts file.
   * Default path is `<root of vite config>/styocss.d.ts`.
   * @default false
   */
  dts?: boolean | string
}
```

Creating a StyoInstance by the `createStyo` option:
```ts
StyoCSS({
  createStyo: (builder) => {
    // Customize the Styo instance here
    return builder
      // Set the prefix of the generated atomic rule names
      .setPrefix('styo-')
      // Set the default value of the `$nestedWith` property
      .setDefaultNestedWith('@media (min-width: 1000px)')
      // Set the default value of the `$selector` property
      .setDefaultSelector('.default .{a}')
      // Set the default value of the `$important` property
      .setDefaultImportant(true)
      // Use a preset
      .usePreset(aPreset)
      // Register `$nestedWith` value templates with aliases
      .registerNestedWithTemplates({
        '@xsOnly': '@media (max-width: 767px)',
        '@smOnly': '@media (min-width: 768px) and (max-width: 1023px)',
        '@mdOnly': '@media (min-width: 1024px) and (max-width: 1279px)',
        '@lgOnly': '@media (min-width: 1280px) and (max-width: 1535px)',
        '@xlOnly': '@media (min-width: 1536px)',
      })
      // Unregister `$nestedWith` value templates. It's useful when you want to drop some templates extended from other presets.
      .unregisterNestedWithTemplates([
        '@xsOnly',
      ])
      // Register `$selector` value templates with aliases
      .registerSelectorTemplates({
        'hover:': '{s}:hover',
        'focus:': '{s}:focus',
        'active:': '{s}:active',
        'disabled:': '{s}:disabled',
      })
      // Unregister `$selector` value templates. It's useful when you want to drop some templates extended from other presets.
      .unregisterSelectorTemplates([
        'disabled'
      ])
      //
      // There are two types of macro styo rules:
      //   - Static macro styo rules
      //   - Dynamic macro styo rules
      //
      // Register a static macro styo rule
      .registerStaticMacroStyoRule({
        name: 'center',
        partials: [
          {
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
          },
        ]
      })
      // The following macro styo rule is mixed with the "center" macro styo rule.
      // There will be two atomic rules containing the "display" property, the last one will override the first one as the CSS cascade rule.
      .registerStaticMacroStyoRule({
        name: 'btn',
        partials: [
          'center',
          {
            display: 'inline-flex',
            padding: '0.5rem 1rem',
            borderRadius: '0.25rem',
            cursor: 'pointer',
          },
        ]
      })
      .registerStaticMacroStyoRule({
        name: 'btn-primary',
        partials: [
          'btn',
          {
            backgroundColor: 'blue',
          },
        ]
      })
      // Register a simple dynamic macro styo rule
      // To register a dynamic macro styo rule, you need to provide a function with options:
      //   - `name`: The name of the macro styo rule.
      //   - `pattern`: A RegExp to match the macro styo rule and extract the dynamic value.
      //   - `template`: The template of the macro styo rule for typescript intellisense and code completion.
      //   - `createPartials`: A function to create the partials of the macro styo rule.
      .registerDynamicMacroStyoRule({
        name: 'padding-x',
        pattern: /px-\[(.*)\]/,
        template: 'px-[value]',
        createPartials: ([, value]) => [{ paddingLeft: value, paddingRight: value }]
      })
      // Unregister macro styo rules by names. It's useful when you want to drop some macro styo rules extended from other presets.
      .unregisterMacroStyoRules([
        'center',
        'btn',
        'btn-primary',
        'padding-x',
      ])
      .done()
  },
})
```

</details>

#### Add the `virtual:styo.css` module to your `main.ts`:
```ts
// main.ts
import 'virtual:styo.css'
```

#### Use the `style` function to write styles:
> The `style` function is a global function that is provided by the plugin.
> You could customize the name of the function by the `nameOfStyleFn` option.

<details>
  <summary>Click to see more about the `style` function</summary>

- The arguments of the `style` function could be any number of `AtomicStyoRulesDefinition` objects or macro styo rules.
- The `style` function would return an array of atomic rule names.
- An `AtomicStyoRulesDefinition` object is an object that contains the atomic rules. For example:
  ```ts
  /* eslint 'quote-props': ['error', 'as-needed'] */
  const definition: AtomicStyoRulesDefinition = {
    // The following special properties are optional and they would be effect the current group of rules.
    //
    // The nest selector of the rules. It's useful when you want to use media query or @supports .etc.
    $nestedWith: '@media (max-width: 640px)',
    // The selector of the rules. It's useful when you want to use pseudo-class or pseudo-element.
    // There are two special placeholders that you could use in the selector:
    //   - `{a}`: The name of the atomic styo rule.
    //            It's useful when you want to combine with pseudo-class or pseudo-element.
    //            Even more, you could use it to construct an attribute selector!
    //   - `{s}`: The placeholder for the default selector.
    //            It's useful when you want to combine with pseudo-class or pseudo-element,
    //            but you have already defined the default selector.
    // If there is no `{a}` or `{s}` in the selector, it would be treated as "`{s}${$selector}`".
    $selector: ':hover',
    // The important flag of the rules. It's useful when you want to set the `!important` flag for all the rules in the current group.
    $important: true,
    // Rest of the properties would be treated as the css properties.
    // The property name in camelCase or kebab-case would both be accepted.
    backgroundColor: 'yellow',
    'background-color': 'yellow',
  }
  ```

</details>

```html
// App.vue
<template>
  <div 
    :class="style(
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
    <div className={style(/* ... */).join(' ')}>
      Hello World!
    </div>
  )
}
```

### Defining a preset
> Presets are useful when you want to share the customizations of your templates, macros, etc.

#### Install the `@styocss/core` package:
```bash
npm i @styocss/core
```

#### Define a preset:
```ts
// my-preset.ts
import { createStyoPreset } from '@styocss/core'
import aPreset from './a-preset'

export const myPreset = createStyoPreset('my-preset')
  // Use a preset
  .usePreset(aPreset)
  // Register `$nestedWith` value templates with aliases
  .registerNestedWithTemplates({
    '@xsOnly': '@media (max-width: 767px)',
    '@smOnly': '@media (min-width: 768px) and (max-width: 1023px)',
    '@mdOnly': '@media (min-width: 1024px) and (max-width: 1279px)',
    '@lgOnly': '@media (min-width: 1280px) and (max-width: 1535px)',
    '@xlOnly': '@media (min-width: 1536px)',
  })
  // Unregister `$nestedWith` value templates. It's useful when you want to drop some templates extended from other presets.
  .unregisterNestedWithTemplates([
    '@xsOnly',
  ])
  // Register `$selector` value templates with aliases
  .registerSelectorTemplates({
    'hover:': '{s}:hover',
    'focus:': '{s}:focus',
    'active:': '{s}:active',
    'disabled:': '{s}:disabled',
  })
  // Unregister `$selector` value templates. It's useful when you want to drop some templates extended from other presets.
  .unregisterSelectorTemplates([
    'disabled'
  ])
  //
  // There are two types of macro styo rules:
  //   - Static macro styo rules
  //   - Dynamic macro styo rules
  //
  // Register a static macro styo rule
  .registerStaticMacroStyoRule({
    name: 'center',
    partials: [
      {
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
      },
    ]
  })
  // The following macro styo rule is mixed with the "center" macro styo rule.
  // There will be two atomic rules containing the "display" property, the last one will override the first one as the CSS cascade rule.
  .registerStaticMacroStyoRule({
    name: 'btn',
    partials: [
      'center',
      {
        display: 'inline-flex',
        padding: '0.5rem 1rem',
        borderRadius: '0.25rem',
        cursor: 'pointer',
      },
    ]
  })
  .registerStaticMacroStyoRule({
    name: 'btn-primary',
    partials: [
      'btn',
      {
        backgroundColor: 'blue',
      },
    ]
  })
  // Register a simple dynamic macro styo rule
  // To register a dynamic macro styo rule, you need to provide a function with options:
  //   - `name`: The name of the macro styo rule.
  //   - `pattern`: A RegExp to match the macro styo rule and extract the dynamic value.
  //   - `template`: The template of the macro styo rule for typescript intellisense and code completion.
  //   - `createPartials`: A function to create the partials of the macro styo rule.
  .registerDynamicMacroStyoRule({
    name: 'padding-x',
    pattern: /px-\[(.*)\]/,
    template: 'px-[value]',
    createPartials: ([, value]) => [{ paddingLeft: value, paddingRight: value }]
  })
  // Unregister macro styo rules by names. It's useful when you want to drop some macro styo rules extended from other presets.
  .unregisterMacroStyoRules([
    'center',
    'btn',
    'btn-primary',
    'padding-x',
  ])
  .done()
```

---

## License
[MIT](./LICENSE)
