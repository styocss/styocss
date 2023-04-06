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

## Introduction

### What is StyoCSS?
> StyoCSS is an Atomic CSS-in-JS engine that allow you to write style in CSS-in-JS way and output in Atomic CSS way.

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
- 👷‍♂️ Highly Tested
  > With > 90% test coverage, you can be confident to use it!

---

## Installation

> ### ⚠️ Warning
> Currently, StyoCSS only provides a core library, you need to handle the css injection by yourself!

```sh
npm i @styocss/core
```

---

## Basic Usage
- **styo.ts**
  ```ts
  import { createStyoInstance } from '@styocss/core'

  // Create a styo instance with zero configuration
  const styo = createStyoInstance().done()

  // For example, you can handle the css injection by the following code:
  const styleEl = document.createElement('style')
  styleEl.title = 'styo'
  document.head.appendChild(styleEl)

  // Fully re-render the css when a new rule is registered
  // (not recommended, a better way is to use CSSOM API to update the css)
  styo.onAtomicStyoRuleRegistered(() => {
    const css = styo.renderCss()
    styleEl.innerHTML = css
  })

  // Export the style function
  export const style = styo.style.bind(styo)
  ```

- **Component.tsx**
  ```tsx
  import { style } from './styo'

  export const Component = () => {
    return <div
      // The style function would generate atomic styo rule names for you in an array,
      // so you can use the array join method to get the class names
      className={style({
        color: 'red',
        fontSize: '16px',
      }).join(' ')}
    >
      Hello World
    </div>
  }
  ```

- **Component.vue**
  ```html
  <template>
    <div
      <!-- 
        The style function would generate atomic styo rule names for you in an array, 
        so you could directly pass to :class in vue template 
      -->
      :class="style({
        color: 'red',
        fontSize: '16px',
      })"
    >
      Hello World
    </div>
  </template>

  <script setup lang="ts">
  import { style } from './styo'
  </script>
  ```

- **Output CSS** (spaces minified but keep newlines)
  ```css
  .a{color:red}
  .b{font-size:16px}
  ```

---

## More to know

- ### `AtomicStyoRule`
  > An atomic styo rule is the smallest unit of StyoCSS, it is a css rule that only contains one css property.

- ### `AtomicStyoRulesDefinition`
  > An object defines a group of atomic styo rules.
  ```ts
  export interface AtomicStyoRulesDefinition {
    // The `__apply` property is used to apply the other macro rules.
    // The order of the macro rules is important because the later macro rules would override the previous macro rules.
    __apply?: string[]

    // Property to define the nested selector of the atomic styo rules.
    // It is useful when you want to define the @media or @supports.
    __nestedWith?: string

    // Property to define the selector of the atomic styo rules.
    // It is useful when you want to define the pseudo class or pseudo element.
    // The selector must contain the `{a}` placeholder, which would be replaced with the atomic styo rule name.
    __selector?: string

    // Property to define whether the atomic styo rules are `!important`.
    // You can still use `!important` in the css property's value to define the `!important` for a specific css property.
    __important?: boolean

    // The rest of the properties are the css properties.
    // The property key can be camelCase or kebab-case.
    // If the value is `undefined`, the atomic styo rule would be ignored.
    // It is useful when you want to remove the css property from the `__apply` specified macro rules.
    [cssProperty: string]: string | number | undefined
  }
  ```

- ### `MacroStyoRulePartial`
  > Could be an `AtomicStyoRulesDefinition` or a defined `MacroStyoRule`.

- ### `MacroStyoRule`
  > A macro styo rule is a predefined combination of macro styo rule partials.
  > It is useful when you want to define a group of styo rules that are commonly used together.
  > 
  > There are two types of macro styo rules:
  > #### `StaticMacroStyoRule`
  > > A static macro styo rule is a fixed combination of atomic styo rules or other macro styo rules.
  > #### `DynamicMacroStyoRule`
  > > A dynamic macro styo rule is matched by a RegExp, it is useful when you want to define a group of atomic styo rules that are commonly used together but the css property names are not fixed.

- ### `NestedWithTemplate`
  > A nested with template is a string that would be used to be the value of the `__nestedWith` property of the atomic styo rules definition, it is helpful for retrieving the typescript intellisense support.

- ### `SelectorTemplate`
  > A selector template is a string that would be used to be the value of the `__selector` property of the atomic styo rules definition, it is helpful for retrieving the typescript intellisense support.

- ### `StyoPreset`
  > A styo preset is a collection of `macro styo rules`, `nested with templates` and `selector templates`. It is useful to distribute them to different packages, so that you can easily reuse them.

- ### `createStyoPreset`
  > The `createStyoPreset` function is used to create a styo preset, it is a chainable function, actually it is a factory function that returns a `StyoPresetBuilder` instance, you can use the `StyoPresetBuilder` instance to add macro styo rules, nested with templates and selector templates and then call the `done` method to get the `StyoPreset` instance.
  ```ts
  import { createStyoPreset } from '@styocss/core'

  export const presetA = createStyoPreset()
    // The `registerNestedWithTemplates` function is used to add `__nestedWith` templates for typescript intellisense.
    // You can input templates in multiple arguments style.
    .registerNestedWithTemplates(
      '@media screen and (min-width: 500px)',
      '@media screen and (min-width: 800px)',
      '@media screen and (min-width: 1100px)',
    )
    // You can input templates in array style, too.
    // .registerNestedWithTemplates([
    //   '@media screen and (min-width: 500px)',
    //   '@media screen and (min-width: 800px)',
    //   '@media screen and (min-width: 1100px)',
    // ])
    //
    //
    //
    // The `registerSelectorTemplates` is same as the `registerNestedWithTemplates` function, but for `__selector` templates.
    // You can input templates in multiple arguments style.
    .registerSelectorTemplates(
      '.{a}:hover',
      '.{a}:focus',
      '.{a}:active',
      '.{a}:visited',
      '.{a}:disabled',
    )
    // You can input templates in array style, too.
    // .registerSelectorTemplates([
    //   '.{a}:hover',
    //   '.{a}:focus',
    //   '.{a}:active',
    //   '.{a}:visited',
    //   '.{a}:disabled',
    // ])
    //
    //
    //
    // Creating a static macro styo rule is easy, just use the `registerMacroStyoRule` function, the first argument is the macro styo rule name, the second argument is the macro styo rule partials.
    .registerMacroStyoRule(
      // The macro styo rule name
      'center',
      // The macro styo rule partials
      [
        {
          'display': 'flex',
          'justify-content': 'center',
          'align-items': 'center',
        },
      ]
    )
    .registerMacroUtility(
      'btn',
      [
        {
        // Using `__apply` key to apply other macro utilities in order to extend and override the applied values
          '__apply': ['center'],
          // The applied property from 'center' macro utility, 'display' would be overridden by the 'inline-flex' value
          'display': 'inline-flex',
          'padding': '8px 16px',
          'border-radius': '4px',
        },
      ]
    )
    .registerMacroUtility(
      'btn-primary',
      [
      // Using the macro name directly would act like pure "append" operation, it will not override the applied values
        'btn',
        {
          'color': '#fff',
          'background-color': '#000',
        },
      ]
    )
    // You can even register a macro utility with no properties and use it to apply in atomic styo rules definition.
    .registerMacroUtility(
      '@smOnly',
      [
        {
          __nestedWith: '@media (max-width: 600px)',
        },
      ]
    )
    .registerMacroUtility(
      'hidden@sm',
      [
        {
          __apply: ['@smOnly'],
          display: 'none',
        },
      ]
    )
    //
    //
    //
    // Don't forget to call the `done` function to get the styo preset instance.
    .done()
  ```

- ### `StyoInstance`
  > A styo instance is an instance of the styo core, it is the entry point of the styo core, you can use it to call the `style` function to generate the atomic styo rule names, listen to the `onAtomicStyoRuleRegistered` event to get notified when a new atomic styo rule is registered, and call the `renderCss` function to render the css.

- ### `createStyoInstance`
  > The `createStyoInstance` function is used to create a styo instance, it is a chainable function, actually it is a factory function that returns a `StyoInstanceBuilder` instance, you can use the `StyoInstanceBuilder` instance to use styo presets, register nested with templates, selector templates, macro styo rules and configure the styo instance, and then call the `done` method to get the `StyoInstance` instance.
  ```ts
  import { createStyoInstance } from '@styocss/core'
  import { presetA } from './preset-a'

  const styo = createStyoInstance()
    // The `usePreset` function is used to use a styo preset, it is useful to reuse the macro styo rules, nested with templates and selector templates from the styo preset.
    .usePreset(presetA)
    //
    //
    //
    // Same as the `registerNestedWithTemplates` function in the `StyoPresetBuilder` instance, but for the styo instance.
    .registerNestedWithTemplates(
      '@media screen and (min-width: 500px)',
      '@media screen and (min-width: 800px)',
      '@media screen and (min-width: 1100px)',
    )
    //
    //
    //
    // Same as the `registerSelectorTemplates` function in the `StyoPresetBuilder` instance, but for the styo instance.
    .registerSelectorTemplates(
      '.{a}:hover',
      '.{a}:focus',
      '.{a}:active',
      '.{a}:visited',
      '.{a}:disabled',
    )
    //
    //
    //
    // Same as the `registerMacroStyoRule` function in the `StyoPresetBuilder` instance, but for the styo instance.
    .registerMacroStyoRule(
      'center',
      [
        {
          'display': 'flex',
          'justify-content': 'center',
          'align-items': 'center',
        },
      ]
    )
    //
    //
    //
    // Set the prefix of the atomic styo rule names, the default value is ''.
    .setPrefix('styo-')

    // Set the default `__nestedWith` value, the default value is ''.
    .setDefaultNestedWith('@media screen and (min-width: 500px)')

    // Set the default `__selector` value, the default value is '.{a}'.
    .setDefaultSelector('.styo-scope .{a}')

    // Set the default `__important` value, the default value is false.
    .setDefaultImportant(true)
    //
    //
    //
    // Don't forget to call the `done` function to get the styo instance.
    .done()
  ```


## Todo
- [ ] 💪 Add helpers package
  > Add helpers package to solve common needs like binding output css to `<style>` tag, etc.
- [ ] 🤝 Integrate with frameworks
  > Integrate with popular frameworks like Vue, React, Svelte, Angular, etc.
- [ ] 📖 Improve documentation
  > Write documentation for the packages
- [ ] 🚀 Compile time plugins, no runtime needed 
  > No runtime needed, everything is done at compile time and shipped as plain css!

---

## License
[MIT](./LICENSE)