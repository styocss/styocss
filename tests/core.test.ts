import { describe, it, expect, beforeEach } from 'vitest'
import type {
  StyoInstance,
} from '@styocss/core'
import {
  createStyoInstance,
  createStyoPreset,
} from '@styocss/core'

describe('Test StyoPresetBuilder', () => {
  it('should register and unregister nestedWith templates', () => {
    const preset = createStyoPreset('test')
      .registerNestedWithTemplates([
        '@media (min-width: 1100px)',
        '@media (min-width: 1200px)',
        '@media (min-width: 1300px)',
        '@media (min-width: 1400px)',
      ])
      .unregisterNestedWithTemplates([
        '@media (min-width: 1200px)',
        '@media (min-width: 1300px)',
      ])
      .done()

    expect([...preset.nestedWithTemplateSet]).toEqual([
      '@media (min-width: 1100px)',
      '@media (min-width: 1400px)',
    ])
  })

  it('should register and unregister selector templates', () => {
    const preset = createStyoPreset('test')
      .registerSelectorTemplates([
        '.aaa .{a}',
        '.bbb .{a}',
        '.ccc .{a}',
        '.ddd .{a}',
      ])
      .unregisterSelectorTemplates([
        '.bbb .{a}',
        '.ccc .{a}',
      ])
      .done()

    expect([...preset.selectorTemplateSet]).toEqual([
      '.aaa .{a}',
      '.ddd .{a}',
    ])
  })

  it('should register and unregister macro styo rules (only check names)', () => {
    const preset = createStyoPreset('test')
      .registerMacroStyoRule(
        'color-red',
        [{ color: 'red' }],
      )
      .registerMacroStyoRule(
        'color-blue',
        [{ color: 'blue' }],
      )
      .registerMacroStyoRule(
        'color-green',
        [{ color: 'green' }],
      )
      .registerMacroStyoRule(
        'padding-x',
        /px-\[(.*)\]/,
        'px-[value]',
        ([, value]) => [{ paddingLeft: value, paddingRight: value }],
      )
      .registerMacroStyoRule(
        'padding-y',
        /py-\[(.*)\]/,
        'py-[value]',
        ([, value]) => [{ paddingTop: value, paddingBottom: value }],
      )
      .registerMacroStyoRule(
        'padding-all',
        /pa-\[(.*)\]/,
        'pa-[value]',
        ([, value]) => [{ padding: value }],
      )
      .unregisterMacroStyoRules([
        'color-blue',
        'color-green',
        'padding-x',
        'padding-y',
      ])
      .done()

    expect([...preset.registeredMacroStyoRuleMap.keys()]).toEqual([
      'color-red',
      'padding-all',
    ])
  })

  it('should use preset (simple extending)', () => {
    const preset1 = createStyoPreset('preset1')
      .registerNestedWithTemplates([
        '@media (min-width: 1100px)',
      ])
      .registerSelectorTemplates([
        '.aaa .{a}',
      ])
      .registerMacroStyoRule(
        'color-red',
        [{ color: 'red' }],
      )
      .registerMacroStyoRule(
        'padding-all',
        /pa-\[(.*)\]/,
        'pa-[value]',
        ([, value]) => [{ padding: value }],
      )
      .done()

    const preset2 = createStyoPreset('preset2')
      .usePreset(preset1)
      .registerNestedWithTemplates([
        '@media (min-width: 1200px)',
      ])
      .registerSelectorTemplates([
        '.bbb .{a}',
      ])
      .registerMacroStyoRule(
        'color-blue',
        [{ color: 'blue' }],
      )
      .registerMacroStyoRule(
        'padding-x',
        /px-\[(.*)\]/,
        'px-[value]',
        ([, value]) => [{ paddingLeft: value, paddingRight: value }],
      )
      .done()

    expect([...preset2.usingPresetNameSet]).toEqual([
      'preset1',
    ])
    expect([...preset2.nestedWithTemplateSet]).toEqual([
      '@media (min-width: 1100px)',
      '@media (min-width: 1200px)',
    ])
    expect([...preset2.selectorTemplateSet]).toEqual([
      '.aaa .{a}',
      '.bbb .{a}',
    ])
    expect([...preset2.registeredMacroStyoRuleMap.keys()]).toEqual([
      'color-red',
      'padding-all',
      'color-blue',
      'padding-x',
    ])
  })

  it('should use preset (extending with unregister things)', () => {
    const preset1 = createStyoPreset('preset1')
      .registerNestedWithTemplates([
        '@media (min-width: 1100px)',
      ])
      .registerSelectorTemplates([
        '.aaa .{a}',
      ])
      .registerMacroStyoRule(
        'color-red',
        [{ color: 'red' }],
      )
      .registerMacroStyoRule(
        'padding-all',
        /pa-\[(.*)\]/,
        'pa-[value]',
        ([, value]) => [{ padding: value }],
      )
      .done()

    const preset2 = createStyoPreset('preset2')
      .usePreset(preset1)
      .unregisterNestedWithTemplates([
        '@media (min-width: 1100px)',
      ])
      .unregisterSelectorTemplates([
        '.aaa .{a}',
      ])
      .unregisterMacroStyoRules([
        'color-red',
        'padding-all',
      ])
      .registerNestedWithTemplates([
        '@media (min-width: 1200px)',
      ])
      .registerSelectorTemplates([
        '.bbb .{a}',
      ])
      .registerMacroStyoRule(
        'color-blue',
        [{ color: 'blue' }],
      )
      .registerMacroStyoRule(
        'padding-x',
        /px-\[(.*)\]/,
        'px-[value]',
        ([, value]) => [{ paddingLeft: value, paddingRight: value }],
      )
      .done()

    // check preset1 is not changed
    expect([...preset1.usingPresetNameSet]).toEqual([])
    expect([...preset1.nestedWithTemplateSet]).toEqual([
      '@media (min-width: 1100px)',
    ])
    expect([...preset1.selectorTemplateSet]).toEqual([
      '.aaa .{a}',
    ])
    expect([...preset1.registeredMacroStyoRuleMap.keys()]).toEqual([
      'color-red',
      'padding-all',
    ])

    // check preset2 is correct
    expect([...preset2.usingPresetNameSet]).toEqual([
      'preset1',
    ])
    expect([...preset2.nestedWithTemplateSet]).toEqual([
      '@media (min-width: 1200px)',
    ])
    expect([...preset2.selectorTemplateSet]).toEqual([
      '.bbb .{a}',
    ])
    expect([...preset2.registeredMacroStyoRuleMap.keys()]).toEqual([
      'color-blue',
      'padding-x',
    ])
  })

  it('should use preset (extending with overriding macro styo rules)', () => {
    const preset1 = createStyoPreset('preset1')
      .registerMacroStyoRule(
        '@sm',
        [{
          $nestedWith: '@media (min-width: 640px)',
        }],
      )
      .done()

    const preset2 = createStyoPreset('preset2')
      .usePreset(preset1)
      .registerMacroStyoRule(
        '@sm',
        [{
          $nestedWith: '@media (min-width: 640px) and (max-width: 767px)',
        }],
      )
      .done()

    expect([...preset2.usingPresetNameSet]).toEqual([
      'preset1',
    ])
    expect([...preset2.registeredMacroStyoRuleMap.keys()]).toEqual([
      '@sm',
    ])
    expect(preset2.registeredMacroStyoRuleMap.get('@sm')?.definition).toEqual({
      name: '@sm',
      partials: [{
        $nestedWith: '@media (min-width: 640px) and (max-width: 767px)',
      }],
    })
  })
})

describe('Test StyoInstanceBuilder', () => {
  it('should set basic options', () => {
    const b = createStyoInstance()

    expect(b.styoOptions.prefix).toBe('')
    expect(b.styoOptions.defaultNestedWith).toBe('')
    expect(b.styoOptions.defaultSelector).toBe('.{a}')
    expect(b.styoOptions.defaultImportant).toBe(false)

    const builder = b
      .setPrefix('styo-')
      .setDefaultNestedWith('@media (min-width: 640px)')
      .setDefaultSelector('.styo-scope .{a}')
      .setDefaultImportant(true)

    expect(builder.styoOptions.prefix).toBe('styo-')
    expect(builder.styoOptions.defaultNestedWith).toBe('@media (min-width: 640px)')
    expect(builder.styoOptions.defaultSelector).toBe('.styo-scope .{a}')
    expect(builder.styoOptions.defaultImportant).toBe(true)
  })

  it('should register and unregister nestedWith templates', () => {
    const styo = createStyoInstance()
      .registerNestedWithTemplates([
        '@media (min-width: 1100px)',
        '@media (min-width: 1200px)',
        '@media (min-width: 1300px)',
        '@media (min-width: 1400px)',
      ])
      .unregisterNestedWithTemplates([
        '@media (min-width: 1200px)',
        '@media (min-width: 1300px)',
      ])
      .done()

    expect([...styo.nestedWithTemplateSet]).toEqual([
      '@media (min-width: 1100px)',
      '@media (min-width: 1400px)',
    ])
  })

  it('should register and unregister selector templates', () => {
    const styo = createStyoInstance()
      .registerSelectorTemplates([
        '.aaa .{a}',
        '.bbb .{a}',
        '.ccc .{a}',
        '.ddd .{a}',
      ])
      .unregisterSelectorTemplates([
        '.bbb .{a}',
        '.ccc .{a}',
      ])
      .done()

    expect([...styo.selectorTemplateSet]).toEqual([
      '.aaa .{a}',
      '.ddd .{a}',
    ])
  })

  it('should register and unregister macro styo rules (only check names)', () => {
    const styo = createStyoInstance()
      .registerMacroStyoRule(
        'color-red',
        [{ color: 'red' }],
      )
      .registerMacroStyoRule(
        'color-blue',
        [{ color: 'blue' }],
      )
      .registerMacroStyoRule(
        'color-green',
        [{ color: 'green' }],
      )
      .registerMacroStyoRule(
        'padding-x',
        /px-\[(.*)\]/,
        'px-[value]',
        ([, value]) => [{ paddingLeft: value, paddingRight: value }],
      )
      .registerMacroStyoRule(
        'padding-y',
        /py-\[(.*)\]/,
        'py-[value]',
        ([, value]) => [{ paddingTop: value, paddingBottom: value }],
      )
      .registerMacroStyoRule(
        'padding-all',
        /pa-\[(.*)\]/,
        'pa-[value]',
        ([, value]) => [{ padding: value }],
      )
      .unregisterMacroStyoRules([
        'color-blue',
        'color-green',
        'padding-x',
        'padding-y',
      ])
      .done()

    expect([...styo.registeredMacroStyoRuleMap.keys()]).toEqual([
      'color-red',
      'padding-all',
    ])
  })

  it('should use preset (simple extending)', () => {
    const preset1 = createStyoPreset('preset1')
      .registerNestedWithTemplates([
        '@media (min-width: 1100px)',
      ])
      .registerSelectorTemplates([
        '.aaa .{a}',
      ])
      .registerMacroStyoRule(
        'color-red',
        [{ color: 'red' }],
      )
      .registerMacroStyoRule(
        'padding-all',
        /pa-\[(.*)\]/,
        'pa-[value]',
        ([, value]) => [{ padding: value }],
      )
      .done()

    const styo = createStyoInstance()
      .usePreset(preset1)
      .registerNestedWithTemplates([
        '@media (min-width: 1200px)',
      ])
      .registerSelectorTemplates([
        '.bbb .{a}',
      ])
      .registerMacroStyoRule(
        'color-blue',
        [{ color: 'blue' }],
      )
      .registerMacroStyoRule(
        'padding-x',
        /px-\[(.*)\]/,
        'px-[value]',
        ([, value]) => [{ paddingLeft: value, paddingRight: value }],
      )
      .done()

    expect([...styo.usingPresetNameSet]).toEqual([
      'preset1',
    ])
    expect([...styo.nestedWithTemplateSet]).toEqual([
      '@media (min-width: 1100px)',
      '@media (min-width: 1200px)',
    ])
    expect([...styo.selectorTemplateSet]).toEqual([
      '.aaa .{a}',
      '.bbb .{a}',
    ])
    expect([...styo.registeredMacroStyoRuleMap.keys()]).toEqual([
      'color-red',
      'padding-all',
      'color-blue',
      'padding-x',
    ])
  })

  it('should use preset (extending with unregister things)', () => {
    const preset1 = createStyoPreset('preset1')
      .registerNestedWithTemplates([
        '@media (min-width: 1100px)',
      ])
      .registerSelectorTemplates([
        '.aaa .{a}',
      ])
      .registerMacroStyoRule(
        'color-red',
        [{ color: 'red' }],
      )
      .registerMacroStyoRule(
        'padding-all',
        /pa-\[(.*)\]/,
        'pa-[value]',
        ([, value]) => [{ padding: value }],
      )
      .done()

    const styo = createStyoInstance()
      .usePreset(preset1)
      .unregisterNestedWithTemplates([
        '@media (min-width: 1100px)',
      ])
      .unregisterSelectorTemplates([
        '.aaa .{a}',
      ])
      .unregisterMacroStyoRules([
        'color-red',
        'padding-all',
      ])
      .registerNestedWithTemplates([
        '@media (min-width: 1200px)',
      ])
      .registerSelectorTemplates([
        '.bbb .{a}',
      ])
      .registerMacroStyoRule(
        'color-blue',
        [{ color: 'blue' }],
      )
      .registerMacroStyoRule(
        'padding-x',
        /px-\[(.*)\]/,
        'px-[value]',
        ([, value]) => [{ paddingLeft: value, paddingRight: value }],
      )
      .done()

    // check preset1 is not changed
    expect([...preset1.usingPresetNameSet]).toEqual([])
    expect([...preset1.nestedWithTemplateSet]).toEqual([
      '@media (min-width: 1100px)',
    ])
    expect([...preset1.selectorTemplateSet]).toEqual([
      '.aaa .{a}',
    ])
    expect([...preset1.registeredMacroStyoRuleMap.keys()]).toEqual([
      'color-red',
      'padding-all',
    ])

    // check styo is correct
    expect([...styo.usingPresetNameSet]).toEqual([
      'preset1',
    ])
    expect([...styo.nestedWithTemplateSet]).toEqual([
      '@media (min-width: 1200px)',
    ])
    expect([...styo.selectorTemplateSet]).toEqual([
      '.bbb .{a}',
    ])
    expect([...styo.registeredMacroStyoRuleMap.keys()]).toEqual([
      'color-blue',
      'padding-x',
    ])
  })

  it('should use preset (extending with overriding macro styo rules)', () => {
    const preset1 = createStyoPreset('preset1')
      .registerMacroStyoRule(
        '@sm',
        [{
          $nestedWith: '@media (min-width: 640px)',
        }],
      )
      .done()

    const styo = createStyoInstance()
      .usePreset(preset1)
      .registerMacroStyoRule(
        '@sm',
        [{
          $nestedWith: '@media (min-width: 640px) and (max-width: 767px)',
        }],
      )
      .done()

    expect([...styo.usingPresetNameSet]).toEqual([
      'preset1',
    ])
    expect([...styo.registeredMacroStyoRuleMap.keys()]).toEqual([
      '@sm',
    ])
    expect(styo.registeredMacroStyoRuleMap.get('@sm')?.definition).toEqual({
      name: '@sm',
      partials: [{
        $nestedWith: '@media (min-width: 640px) and (max-width: 767px)',
      }],
    })
  })
})

describe('Test StyoInstance (zero config)', () => {
  interface LocalTestContext {
    styo: StyoInstance
  }

  beforeEach<LocalTestContext>((ctx) => {
    ctx.styo = createStyoInstance().done()
  })

  it<LocalTestContext>('should register atomic styo rules correctly', ({ styo }) => {
    const atomicStyoRuleNames = styo.style(
      {
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
      },
      {
        $nestedWith: '@media (min-width: 640px)',
        $selector: '.aaa .{a}',
        $important: true,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
      },
    )

    expect(atomicStyoRuleNames).toEqual(['a', 'b', 'c', 'd', 'e', 'f'])
    expect(styo.registeredAtomicStyoRuleMap.size).toEqual(6)
    expect(styo.registeredAtomicStyoRuleMap.get('a')?.content).toEqual({
      nestedWith: '',
      selector: '.{a}',
      important: false,
      property: 'display',
      value: 'flex',
    })
    expect(styo.registeredAtomicStyoRuleMap.get('b')?.content).toEqual({
      nestedWith: '',
      selector: '.{a}',
      important: false,
      property: 'justify-content',
      value: 'center',
    })
    expect(styo.registeredAtomicStyoRuleMap.get('c')?.content).toEqual({
      nestedWith: '',
      selector: '.{a}',
      important: false,
      property: 'align-items',
      value: 'center',
    })
    expect(styo.registeredAtomicStyoRuleMap.get('d')?.content).toEqual({
      nestedWith: '@media (min-width: 640px)',
      selector: '.aaa .{a}',
      important: true,
      property: 'display',
      value: 'flex',
    })
    expect(styo.registeredAtomicStyoRuleMap.get('e')?.content).toEqual({
      nestedWith: '@media (min-width: 640px)',
      selector: '.aaa .{a}',
      important: true,
      property: 'justify-content',
      value: 'center',
    })
    expect(styo.registeredAtomicStyoRuleMap.get('f')?.content).toEqual({
      nestedWith: '@media (min-width: 640px)',
      selector: '.aaa .{a}',
      important: true,
      property: 'align-items',
      value: 'center',
    })
  })
})

describe('Test StyoInstance (with config)', () => {
  function createStyoInstanceWithConfig () {
    return createStyoInstance()
      .setPrefix('styo-')
      .setDefaultNestedWith('@media (min-width: 1000px)')
      .setDefaultSelector('.default .{a}')
      .setDefaultImportant(true)
      // simple static macro styo rule
      .registerMacroStyoRule('center', [
        {
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
        },
      ])
      // Extending strategy 1: using "__apply" key, which is able to override
      // Aware that "__apply" would flatten the macro styo rules,
      // so it's not recommended to use it with a macro styo rule which has multiple partials
      .registerMacroStyoRule('btn', [
        {
          $apply: ['center'],
          display: 'inline-flex',
          padding: '0.5rem 1rem',
          borderRadius: '0.25rem',
          cursor: 'pointer',
        },
      ])
      // Extending strategy 2: directly using macro styo rule name, which is just like "append" and not able to override
      .registerMacroStyoRule('btn-primary', [
        'btn',
        {
          backgroundColor: 'blue',
        },
      ])
      // simple dynamic macro styo rule
      .registerMacroStyoRule('padding-x', /px-\[(.*)\]/, 'px-[value]', ([, value]) => [{ paddingLeft: value, paddingRight: value }])
      // macro styo rule without any properties, which is useful for using "__apply"
      // Cases like breakpoint, theme, pseudo class, pseudo element, etc.
      .registerMacroStyoRule('@xsOnly', [{ $nestedWith: '@media (max-width: 639px)' }])
      .registerMacroStyoRule('[dark]', [{ $selector: '[theme="dark"] {s}' }])
      .registerMacroStyoRule(':hover', [{ $selector: '{s}:hover' }])
      .registerMacroStyoRule('::before', [{ $selector: '{s}::before' }])
      .done()
  }

  interface LocalTestContext {
    styo: ReturnType<typeof createStyoInstanceWithConfig>
  }

  beforeEach<LocalTestContext>((ctx) => {
    ctx.styo = createStyoInstanceWithConfig()
  })

  it<LocalTestContext>('should register atomic styo rules correctly', ({ styo }) => {
    const atomicStyoRuleNames = styo.style(
      {
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
      },
      {
        $nestedWith: '@media (min-width: 640px)',
        $selector: '.aaa .{a}',
        $important: true,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
      },
    )

    expect(atomicStyoRuleNames).toEqual(['styo-a', 'styo-b', 'styo-c', 'styo-d', 'styo-e', 'styo-f'])
    expect(styo.registeredAtomicStyoRuleMap.size).toEqual(6)
    expect(styo.registeredAtomicStyoRuleMap.get('styo-a')?.content).toEqual({
      nestedWith: '@media (min-width: 1000px)',
      selector: '.default .{a}',
      important: true,
      property: 'display',
      value: 'flex',
    })
    expect(styo.registeredAtomicStyoRuleMap.get('styo-b')?.content).toEqual({
      nestedWith: '@media (min-width: 1000px)',
      selector: '.default .{a}',
      important: true,
      property: 'justify-content',
      value: 'center',
    })
    expect(styo.registeredAtomicStyoRuleMap.get('styo-c')?.content).toEqual({
      nestedWith: '@media (min-width: 1000px)',
      selector: '.default .{a}',
      important: true,
      property: 'align-items',
      value: 'center',
    })
    expect(styo.registeredAtomicStyoRuleMap.get('styo-d')?.content).toEqual({
      nestedWith: '@media (min-width: 640px)',
      selector: '.aaa .{a}',
      important: true,
      property: 'display',
      value: 'flex',
    })
    expect(styo.registeredAtomicStyoRuleMap.get('styo-e')?.content).toEqual({
      nestedWith: '@media (min-width: 640px)',
      selector: '.aaa .{a}',
      important: true,
      property: 'justify-content',
      value: 'center',
    })
    expect(styo.registeredAtomicStyoRuleMap.get('styo-f')?.content).toEqual({
      nestedWith: '@media (min-width: 640px)',
      selector: '.aaa .{a}',
      important: true,
      property: 'align-items',
      value: 'center',
    })
  })

  it<LocalTestContext>('should generate atomic styo rules from macro styo rules correctly (center)', ({ styo }) => {
    const atomicStyoRuleNames = styo.style('center')

    expect(atomicStyoRuleNames).toEqual(['styo-a', 'styo-b', 'styo-c'])
    expect(styo.registeredAtomicStyoRuleMap.size).toEqual(3)
    expect(styo.registeredAtomicStyoRuleMap.get('styo-a')?.content).toEqual({
      nestedWith: '@media (min-width: 1000px)',
      selector: '.default .{a}',
      important: true,
      property: 'display',
      value: 'flex',
    })
    expect(styo.registeredAtomicStyoRuleMap.get('styo-b')?.content).toEqual({
      nestedWith: '@media (min-width: 1000px)',
      selector: '.default .{a}',
      important: true,
      property: 'justify-content',
      value: 'center',
    })
    expect(styo.registeredAtomicStyoRuleMap.get('styo-c')?.content).toEqual({
      nestedWith: '@media (min-width: 1000px)',
      selector: '.default .{a}',
      important: true,
      property: 'align-items',
      value: 'center',
    })
  })

  it<LocalTestContext>('should generate atomic styo rules from macro styo rules correctly (btn)', ({ styo }) => {
    const atomicStyoRuleNames = styo.style('btn')

    expect(atomicStyoRuleNames).toEqual(['styo-d', 'styo-b', 'styo-c', 'styo-e', 'styo-f', 'styo-g'])
    // Although the result of names has 6 items (override), the registeredAtomicStyoRuleMap should have 7 items.
    // Because the macro styo rule "btn" has a property "__apply" which is used to apply "center" and it would register 3 atomic styo rules.
    expect(styo.registeredAtomicStyoRuleMap.size).toEqual(7)
    // Here is the override atomic styo rule.
    expect(styo.registeredAtomicStyoRuleMap.get('styo-a')?.content).toEqual({
      nestedWith: '@media (min-width: 1000px)',
      selector: '.default .{a}',
      important: true,
      property: 'display',
      value: 'flex',
    })
    expect(styo.registeredAtomicStyoRuleMap.get('styo-b')?.content).toEqual({
      nestedWith: '@media (min-width: 1000px)',
      selector: '.default .{a}',
      important: true,
      property: 'justify-content',
      value: 'center',
    })
    expect(styo.registeredAtomicStyoRuleMap.get('styo-c')?.content).toEqual({
      nestedWith: '@media (min-width: 1000px)',
      selector: '.default .{a}',
      important: true,
      property: 'align-items',
      value: 'center',
    })
    expect(styo.registeredAtomicStyoRuleMap.get('styo-d')?.content).toEqual({
      nestedWith: '@media (min-width: 1000px)',
      selector: '.default .{a}',
      important: true,
      property: 'display',
      value: 'inline-flex',
    })
    expect(styo.registeredAtomicStyoRuleMap.get('styo-e')?.content).toEqual({
      nestedWith: '@media (min-width: 1000px)',
      selector: '.default .{a}',
      important: true,
      property: 'padding',
      value: '0.5rem 1rem',
    })
    expect(styo.registeredAtomicStyoRuleMap.get('styo-f')?.content).toEqual({
      nestedWith: '@media (min-width: 1000px)',
      selector: '.default .{a}',
      important: true,
      property: 'border-radius',
      value: '0.25rem',
    })
    expect(styo.registeredAtomicStyoRuleMap.get('styo-g')?.content).toEqual({
      nestedWith: '@media (min-width: 1000px)',
      selector: '.default .{a}',
      important: true,
      property: 'cursor',
      value: 'pointer',
    })
  })

  it<LocalTestContext>('should generate atomic styo rules from macro styo rules correctly (btn-primary)', ({ styo }) => {
    const atomicStyoRuleNames = styo.style('btn-primary')

    expect(atomicStyoRuleNames).toEqual([
      'styo-d',
      'styo-b',
      'styo-c',
      'styo-e',
      'styo-f',
      'styo-g',
      'styo-h',
    ])
    expect(styo.registeredAtomicStyoRuleMap.size).toEqual(8)
    expect(styo.registeredAtomicStyoRuleMap.get('styo-a')?.content).toEqual({
      nestedWith: '@media (min-width: 1000px)',
      selector: '.default .{a}',
      important: true,
      property: 'display',
      value: 'flex',
    })
    expect(styo.registeredAtomicStyoRuleMap.get('styo-b')?.content).toEqual({
      nestedWith: '@media (min-width: 1000px)',
      selector: '.default .{a}',
      important: true,
      property: 'justify-content',
      value: 'center',
    })
    expect(styo.registeredAtomicStyoRuleMap.get('styo-c')?.content).toEqual({
      nestedWith: '@media (min-width: 1000px)',
      selector: '.default .{a}',
      important: true,
      property: 'align-items',
      value: 'center',
    })
    expect(styo.registeredAtomicStyoRuleMap.get('styo-d')?.content).toEqual({
      nestedWith: '@media (min-width: 1000px)',
      selector: '.default .{a}',
      important: true,
      property: 'display',
      value: 'inline-flex',
    })
    expect(styo.registeredAtomicStyoRuleMap.get('styo-e')?.content).toEqual({
      nestedWith: '@media (min-width: 1000px)',
      selector: '.default .{a}',
      important: true,
      property: 'padding',
      value: '0.5rem 1rem',
    })
    expect(styo.registeredAtomicStyoRuleMap.get('styo-f')?.content).toEqual({
      nestedWith: '@media (min-width: 1000px)',
      selector: '.default .{a}',
      important: true,
      property: 'border-radius',
      value: '0.25rem',
    })
    expect(styo.registeredAtomicStyoRuleMap.get('styo-g')?.content).toEqual({
      nestedWith: '@media (min-width: 1000px)',
      selector: '.default .{a}',
      important: true,
      property: 'cursor',
      value: 'pointer',
    })
    expect(styo.registeredAtomicStyoRuleMap.get('styo-h')?.content).toEqual({
      nestedWith: '@media (min-width: 1000px)',
      selector: '.default .{a}',
      important: true,
      property: 'background-color',
      value: 'blue',
    })
  })

  it<LocalTestContext>('should generate atomic styo rules from macro styo rules correctly (padding-x)', ({ styo }) => {
    const atomicStyoRuleNames = styo.style('px-[1rem]', 'px-[16px]')

    expect(atomicStyoRuleNames).toEqual(['styo-a', 'styo-b', 'styo-c', 'styo-d'])
    expect(styo.registeredAtomicStyoRuleMap.size).toEqual(4)
    expect(styo.registeredAtomicStyoRuleMap.get('styo-a')?.content).toEqual({
      nestedWith: '@media (min-width: 1000px)',
      selector: '.default .{a}',
      important: true,
      property: 'padding-left',
      value: '1rem',
    })
    expect(styo.registeredAtomicStyoRuleMap.get('styo-b')?.content).toEqual({
      nestedWith: '@media (min-width: 1000px)',
      selector: '.default .{a}',
      important: true,
      property: 'padding-right',
      value: '1rem',
    })
    expect(styo.registeredAtomicStyoRuleMap.get('styo-c')?.content).toEqual({
      nestedWith: '@media (min-width: 1000px)',
      selector: '.default .{a}',
      important: true,
      property: 'padding-left',
      value: '16px',
    })
    expect(styo.registeredAtomicStyoRuleMap.get('styo-d')?.content).toEqual({
      nestedWith: '@media (min-width: 1000px)',
      selector: '.default .{a}',
      important: true,
      property: 'padding-right',
      value: '16px',
    })
  })

  it<LocalTestContext>('should generate atomic styo rules from no properties macro styo rules correctly (@xsOnly, [dark], :hover)', ({ styo }) => {
    const atomicStyoRuleNames = styo.style('@xsOnly', '[dark]', ':hover')

    expect(atomicStyoRuleNames).toEqual([])
    expect(styo.registeredAtomicStyoRuleMap.size).toEqual(3)
    // All of them are virtual atomic styo rules
    expect(Array.from(styo.registeredAtomicStyoRuleMap.keys()).filter((k) => !k.startsWith('styo-virtual-')).length).toEqual(0)
    expect(styo.registeredAtomicStyoRuleMap.get('styo-virtual-a')?.content).toEqual({
      nestedWith: '@media (max-width: 639px)',
    })
    expect(styo.registeredAtomicStyoRuleMap.get('styo-virtual-b')?.content).toEqual({
      selector: '[theme="dark"] {s}',
    })
    expect(styo.registeredAtomicStyoRuleMap.get('styo-virtual-c')?.content).toEqual({
      selector: '{s}:hover',
    })
  })

  it<LocalTestContext>('should generate atomic styo rules from macro styo rules correctly (with "__apply: ["@xsOnly", "[dark]", ":hover"]")', ({ styo }) => {
    const atomicStyoRuleNames = styo.style({
      $apply: ['@xsOnly', '[dark]', ':hover'],
      color: 'red',
    })

    expect(atomicStyoRuleNames).toEqual(['styo-a'])
    expect(styo.registeredAtomicStyoRuleMap.size).toEqual(4)
    expect(styo.registeredAtomicStyoRuleMap.get('styo-a')?.content).toEqual({
      nestedWith: '@media (max-width: 639px)',
      selector: '[theme="dark"] .default .{a}:hover',
      important: true,
      property: 'color',
      value: 'red',
    })
  })

  it<LocalTestContext>('should generate atomic styo rules from macro styo rules correctly (with "__apply: ["::before"]")', ({ styo }) => {
    const atomicStyoRuleNames = styo.style({
      $apply: ['::before'],
      content: '""',
    })

    expect(atomicStyoRuleNames).toEqual(['styo-a'])
    expect(styo.registeredAtomicStyoRuleMap.size).toEqual(2)
    expect(styo.registeredAtomicStyoRuleMap.get('styo-a')?.content).toEqual({
      nestedWith: '@media (min-width: 1000px)',
      selector: '.default .{a}::before',
      important: true,
      property: 'content',
      value: '""',
    })
  })
})
