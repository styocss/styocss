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
  <code>Atomic CSS</code> + <code>CSS-in-JS</code> = <code>StyoCSS</code>
</p>

<br>
<br>

<blockquote align="center" font-size="10px">
  🚧 This project is still under development. 🚧
  
  The API is not stable yet.
</blockquote>

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

## Features
- 🥰 Framework agnostic 
  > Use it with any framework you like!
- ✨ Zero configuration 
  > Just use it right away!
- 📖 Almost zero learning curve 
  > Use the css property names you are familiar with!
- ⚒️ Fully customizable by using presets 
  > You can create your own preset!
- 🧰 Macro utilities (static and dynamic) 
  > Build your own utilities by using the macro utilities!
- 🧠 Typescript intellisense support 
  > No extension needed!
- 📦 Tiny size core (~3kb min+brotli)
  > Just that tiny!
- 👷‍♂️ Tested with over 95% code coverage
  > It should be stable!

---

> ⚠️ Currently, StyoCSS only provides a core library, but it is easy to integrate with any framework, such as React, Vue, Svelte, etc.

## Installation
```sh
npm i @styocss/core
```

---

## Introduction

### What is StyoCSS?
> StyoCSS is a Atomic CSS-in-JS library that allow you to write style in inline style way, but avoid the dark side of inline style, because it would generate atomic utility names for you.

### Why StyoCSS is been created?
> I love the idea of Atomic CSS, there are many great Atomic CSS solutions out there, such as UnoCSS, WindiCSS, TailwindCSS, Stylify, etc. 
>
> I don't like to memorize the utility class names, so UnoCSS, WindiCSS or TailwindCSS is not for me. 
>
> I like Stylify's idea of using the css property names as the utility class names, but the value of the css property is limited by the html class rules, so I can't use it in some cases. 
>
> I like to use the css property names as the utility class names, and I can use any value I want, so the idea of StyoCSS, a Atomic CSS-in-JS library, is born.

---

## Core concepts
### Atomic utilities definition
> Basically, an atomic utility is defined with `__nestedWith`, `__selector` and `__important` keys, and the rest of the keys are the css properties.
> - `__nestedWith` is used to define a nested selector like `@media`, `@supports` and so on.
> - `__selector` is used to define a selector, the `{u}` will be replaced with the utility name.
> - `__important` is used to define whether the utility class should be `!important` or not.
### Macro utility
> A macro utility could be combined with atomic utilities or even another macro utilities, and it would finally break down to atomic utilities for you.

> A macro utility can be defined as two types:
> - Static macro utility
    > A static macro utility is defined with a name and an array of atomic utilities or macro utilities.
> - Dynamic macro utility
    > A dynamic macro utility is defined with a RegExp pattern and a function that returns an array of atomic utilities or macro utilities.

### Preset
> A preset is a collection of `__nestedWith` templates, `__selector` templates and macro utilities, and it could be used to create a styo instance.

### Styo instance
> A styo instance provides a `style` function that accepts at least one definition or macro utility name, and returns an array of generated utility names.

## Usage

### Simple usage
```ts
import { createStyoInstance } from '@styocss/core'

// Create a styo instance with zero configuration
const styo = createStyoInstance().done()

// `styo.style` is a function that accepts at least one definition
// and returns an array of string (the utility names)
// Because the utility names are just plain strings, you can use them anywhere.
// For example, you can use them as the class names of your html elements like this:
// JSX: <div className={utilityNames.join(' ')} />
// Vue: <div :class="utilityNames" />
const utilityNames = styo.style(
  {
    // You can use camelCase or kebab-case for your definition
    color: '#000',
    fontSize: '16px',
    // 'font-size': '16px',
  },
  {
    // You can use `__selector` key to define a selector, the `{u}` will be replaced with the generated utility name
    __selector: '.{u}:hover',
    color: '#fff',
    backgroundColor: '#000',
  },
  {
    // You can write any custom selector within the `{u}` placeholder
    __selector: '[theme="dark"] .{u}',
    color: '#fff',
    fontSize: '16px',
  },
  {
    __selector: '[theme="dark"] .{u}:hover',
    color: '#000',
    backgroundColor: '#fff',
  },
  {
    // You can use `__nestedWith` key to define a nested selector like `@media`, `@supports` and so on
    '__nestedWith': '@media (min-width: 900px)',
    'font-size': '24px',
  },
  // If you want to use `!important` in your definition, you can use `__important` key
  {
    '__important': true,
    'font-size': '24px',
    // or directly use `!important` in your definition
    'font-weight': 'bold !important',
  }
)
```

### Advanced usage
- #### Create a styo preset
  ```ts
  import { createStyoPreset } from '@styocss/core'

  const presetA = createStyoPreset()
    // You can use `registerNestedWithTemplates` to add `__nestedWith` templates for typescript intellisense.
    // use in multiple arguments style
    .registerNestedWithTemplates(
      '@media screen and (min-width: 500px)',
      '@media screen and (min-width: 800px)',
      '@media screen and (min-width: 1100px)',
    )
    // use in array style
    // .registerNestedWithTemplates([
    //   '@media screen and (min-width: 500px)',
    //   '@media screen and (min-width: 800px)',
    //   '@media screen and (min-width: 1100px)',
    // ])

    // You can use `registerSelectorTemplates` to add `__selector` templates for typescript intellisense.
    // Use in multiple arguments style.
    .registerSelectorTemplates(
      '.{u}:hover',
      '.{u}:focus',
      '.{u}:active',
      '.{u}:visited',
      '.{u}:disabled',
    )
    // Use in array style.
    // .registerSelectorTemplates([
    //   '.{u}:hover',
    //   '.{u}:focus',
    //   '.{u}:active',
    //   '.{u}:visited',
    //   '.{u}:disabled',
    // ])
    .done()
  ```

- #### Create a styo instance with configurations
  ```ts
  import { createStyoInstance } from '@styocss/core'

  const styo = createStyoInstance()
    // Set the prefix of the atomic utility class name, default is ''
    .setAtomicUtilityNamePrefix('foo-')

    // Set the default atomic utility `__nestedWith` value, default is ''
    .setDefaultAtomicUtilityNestedWith('@media (min-width: 900px)')

    // Set the default atomic utility `__selector` value, default is '.{u}'
    .setDefaultAtomicUtilitySelector('.foo .{u}')

    // Set the default atomic utility `__important` value, default is false
    .setDefaultAtomicUtilityImportant(true)

    // You can use `usePreset` to use a styo preset
    .usePreset(presetA)

    // Both `registerNestedWithTemplates` and `registerSelectorTemplates` can accept multiple string arguments or an array of string.
    // You can use `registerNestedWithTemplates` to add `__nestedWith` templates for typescript intellisense.
    .registerNestedWithTemplates(
      '@media screen and (min-width: 600px)',
      '@media screen and (min-width: 900px)',
      '@media screen and (min-width: 1200px)',
    )
    .registerNestedWithTemplates([
      '@media screen and (min-width: 600px)',
      '@media screen and (min-width: 900px)',
      '@media screen and (min-width: 1200px)',
    ])

    // You can use `registerSelectorTemplates` to add `__selector` templates for typescript intellisense.
    .registerSelectorTemplates(
      '.{u}:hover',
      '.{u}:focus',
      '.{u}:active',
      '.{u}:visited',
      '.{u}:disabled',
    )
    .registerSelectorTemplates([
      '.{u}:hover',
      '.{u}:focus',
      '.{u}:active',
      '.{u}:visited',
      '.{u}:disabled',
    ])
    .done()
  ```

- #### Create a macro utilities
  ```ts
  import { createStyoPreset, createStyoInstance } from '@styocss/core'

  // You can register a macro utility when creating a styo instance or a styo preset, they are the same.
  // For example, you can create a styo preset to register a macro utility.
  const presetA = createStyoPreset()
    // Create a static macro utility
    .registerMacroUtility('center', [
      {
        'display': 'flex',
        'justify-content': 'center',
        'align-items': 'center',
      },
    ])
    .registerMacroUtility('btn', [
      {
        // You can use `__apply` key to apply other macro utilities to extend or override the applied values
        '__apply': ['center'],
        // The following display value will override the display value of the `center` macro utility
        'display': 'inline-flex',
        'padding': '8px 16px',
        'border-radius': '4px',
      },
    ])
    .registerMacroUtility('btn-primary', [
      // Directly use the macro name would act like pure "add" operation, it will not override the applied values
      'btn',
      {
        'color': '#fff',
        'background-color': '#000',
      },
    ])
    // You can even register a macro utility with no properties and use it to apply in atomic utilities definition.
    .registerMacroUtility('@smOnly', [
      {
        __nestedWith: '@media (max-width: 600px)',
      },
    ])
    .registerMacroUtility('hidden@sm', [
      {
        __apply: ['@smOnly'],
        display: 'none',
      },
    ])
    .done()
  ```

---

## Todo
- [ ] 🤝 Integrate with frameworks
  > Integrate with popular frameworks like Vue, React, Svelte, Angular, etc.
- [ ] 🚀 Compile time plugins, no runtime needed 
  > No runtime needed, everything is done at compile time and shipped as plain css!
- [ ] 📖 Improve documentation
  > Write documentation for the packages

---

## License
[MIT](./LICENSE)