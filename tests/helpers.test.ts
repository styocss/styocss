import { describe, it, expect } from 'vitest'
import { renderAtomicStyoRule, renderAtomicStyoRules, bindStyleEl } from '@styocss/helpers'
import { createStyoInstance } from '@styocss/core'
import type { HTMLStyleElement } from 'happy-dom'
import { Window } from 'happy-dom'

describe('Test runtime helpers', () => {
  it('should render atomic style rule correctly (renderAtomicStyoRule)', () => {
    // without nestedWith
    expect(renderAtomicStyoRule({
      name: 'a',
      content: {
        nestedWith: '',
        selector: '.{a}',
        important: false,
        property: 'color',
        value: 'red',
      },
    })).toBe('.a{color:red}')
    // with nestedWith
    expect(renderAtomicStyoRule({
      name: 'a',
      content: {
        nestedWith: '@media screen and (min-width: 768px)',
        selector: '.{a}:hover',
        important: true,
        property: 'color',
        value: 'red',
      },
    })).toBe('@media screen and (min-width: 768px){.a:hover{color:red !important}}')
  })

  it('should return null if the atomic style rule is invalid (renderAtomicStyoRule)', () => {
    // missing nestedWith
    expect(renderAtomicStyoRule({
      name: 'a',
      content: {
        selector: '.{a}',
        important: false,
        property: 'color',
        value: 'red',
      },
    })).toBeNull()
    // missing selector
    expect(renderAtomicStyoRule({
      name: 'a',
      content: {
        nestedWith: '',
        important: false,
        property: 'color',
        value: 'red',
      },
    })).toBeNull()
    // missing important
    expect(renderAtomicStyoRule({
      name: 'a',
      content: {
        nestedWith: '',
        selector: '.{a}',
        property: 'color',
        value: 'red',
      },
    })).toBeNull()
    // missing property
    expect(renderAtomicStyoRule({
      name: 'a',
      content: {
        nestedWith: '',
        selector: '.{a}',
        important: false,
        value: 'red',
      },
    })).toBeNull()
    // missing value
    expect(renderAtomicStyoRule({
      name: 'a',
      content: {
        nestedWith: '',
        selector: '.{a}',
        important: false,
        property: 'color',
      },
    })).toBeNull()
    // selector does not include {a}
    expect(renderAtomicStyoRule({
      name: 'a',
      content: {
        nestedWith: '',
        selector: '.a',
        important: false,
        property: 'color',
        value: 'red',
      },
    })).toBeNull()
  })

  it('should render atomic style rules correctly (renderAtomicStyoRules)', () => {
    expect(renderAtomicStyoRules([
      {
        name: 'a',
        content: {
          nestedWith: '',
          selector: '.{a}',
          important: false,
          property: 'color',
          value: 'red',
        },
      },
      {
        name: 'b',
        content: {
          nestedWith: '@media screen and (min-width: 768px)',
          selector: '.{a}:hover',
          important: true,
          property: 'color',
          value: 'red',
        },
      },
      // invalid atomic style rule
      {
        name: 'c',
        content: {
          selector: '.{a}',
          important: false,
          property: 'color',
          value: 'red',
        },
      },
    ])).toBe([
      '/* AtomicStyoRule */',
      '.a{color:red}',
      '@media screen and (min-width: 768px){.b:hover{color:red !important}}',
    ].join('\n'))
  })

  it('should bind style element correctly (bindStyleEl with sheet strategy)', () => {
    const window = new Window()
    const document = window.document
    const styleEl = document.createElement('style') as HTMLStyleElement
    document.head.appendChild(styleEl)

    const styo = createStyoInstance().done()
    bindStyleEl(styo, styleEl as any, { strategy: 'sheet' })

    const sheet = styleEl.sheet

    styo.style({
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '1rem',
      color: 'red',
    })

    expect([...sheet.cssRules].length).toBe(5)
    expect([...sheet.cssRules].map((r) => r.cssText))
      .toEqual([
        '.a { display: flex; }',
        '.b { align-items: center; }',
        '.c { justify-content: center; }',
        '.d { padding: 1rem; }',
        '.e { color: red; }',
      ])
  })

  it('should bind style element correctly (bindStyleEl with innerHTML strategy)', () => {
    const window = new Window()
    const document = window.document
    const styleEl = document.createElement('style') as HTMLStyleElement
    document.head.appendChild(styleEl)

    const styo = createStyoInstance().done()
    bindStyleEl(styo, styleEl as any, { strategy: 'innerHTML' })

    styo.style({
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '1rem',
      color: 'red',
    })

    expect(styleEl.innerHTML)
      .toBe([
        '/* AtomicStyoRule */',
        '.a{display:flex}',
        '.b{align-items:center}',
        '.c{justify-content:center}',
        '.d{padding:1rem}',
        '.e{color:red}',
      ].join('\n'))
  })
})
