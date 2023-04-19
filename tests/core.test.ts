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
      .registerNestedWithTemplates({
        bp1: '@media (min-width: 1100px)',
        bp2: '@media (min-width: 1200px)',
        bp3: '@media (min-width: 1300px)',
        bp4: '@media (min-width: 1400px)',
      })
      .unregisterNestedWithTemplates([
        'bp2',
        'bp3',
      ])
      .done()

    expect([...preset.nestedWithTemplateMap]).toEqual([
      ['bp1', '@media (min-width: 1100px)'],
      ['bp4', '@media (min-width: 1400px)'],
    ])
  })

  it('should register and unregister selector templates', () => {
    const preset = createStyoPreset('test')
      .registerSelectorTemplates({
        aaa: '.aaa .{a}',
        bbb: '.bbb .{a}',
        ccc: '.ccc .{a}',
        ddd: '.ddd .{a}',
      })
      .unregisterSelectorTemplates([
        'bbb',
        'ccc',
      ])
      .done()

    expect([...preset.selectorTemplateMap]).toEqual([
      ['aaa', '.aaa .{a}'],
      ['ddd', '.ddd .{a}'],
    ])
  })

  it('should register and unregister macro styo rules (only check names)', () => {
    const preset = createStyoPreset('test')
      .registerStaticMacroStyoRule({
        name: 'color-red',
        partials: [{ color: 'red' }],
      })
      .registerStaticMacroStyoRule({
        name: 'color-blue',
        partials: [{ color: 'blue' }],
      })
      .registerStaticMacroStyoRule({
        name: 'color-green',
        partials: [{ color: 'green' }],
      })
      .registerDynamicMacroStyoRule({
        name: 'padding-x',
        pattern: /px-\[(.*)\]/,
        template: 'px-[value]',
        createPartials: ([, value]) => [{ paddingLeft: value, paddingRight: value }],
      })
      .registerDynamicMacroStyoRule({
        name: 'padding-y',
        pattern: /py-\[(.*)\]/,
        template: 'py-[value]',
        createPartials: ([, value]) => [{ paddingTop: value, paddingBottom: value }],
      })
      .registerDynamicMacroStyoRule({
        name: 'padding-all',
        pattern: /pa-\[(.*)\]/,
        template: 'pa-[value]',
        createPartials: ([, value]) => [{ padding: value }],
      })
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
      .registerNestedWithTemplates({
        bp1: '@media (min-width: 1100px)',
      })
      .registerSelectorTemplates({
        aaa: '.aaa .{a}',
      })
      .registerStaticMacroStyoRule({
        name: 'color-red',
        partials: [{ color: 'red' }],
      })
      .registerDynamicMacroStyoRule({
        name: 'padding-all',
        pattern: /pa-\[(.*)\]/,
        template: 'pa-[value]',
        createPartials: ([, value]) => [{ padding: value }],
      })
      .done()

    const preset2 = createStyoPreset('preset2')
      .usePreset(preset1)
      .registerNestedWithTemplates({
        bp2: '@media (min-width: 1200px)',
      })
      .registerSelectorTemplates({
        bbb: '.bbb .{a}',
      })
      .registerStaticMacroStyoRule({
        name: 'color-blue',
        partials: [{ color: 'blue' }],
      })
      .registerDynamicMacroStyoRule({
        name: 'padding-x',
        pattern: /px-\[(.*)\]/,
        template: 'px-[value]',
        createPartials: ([, value]) => [{ paddingLeft: value, paddingRight: value }],
      })
      .done()

    expect([...preset2.usingPresetNameSet]).toEqual([
      'preset1',
    ])
    expect([...preset2.nestedWithTemplateMap]).toEqual([
      ['bp1', '@media (min-width: 1100px)'],
      ['bp2', '@media (min-width: 1200px)'],
    ])
    expect([...preset2.selectorTemplateMap]).toEqual([
      ['aaa', '.aaa .{a}'],
      ['bbb', '.bbb .{a}'],
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
      .registerNestedWithTemplates({
        bp1: '@media (min-width: 1100px)',
      })
      .registerSelectorTemplates({
        aaa: '.aaa .{a}',
      })
      .registerStaticMacroStyoRule({
        name: 'color-red',
        partials: [{ color: 'red' }],
      })
      .registerDynamicMacroStyoRule({
        name: 'padding-all',
        pattern: /pa-\[(.*)\]/,
        template: 'pa-[value]',
        createPartials: ([, value]) => [{ padding: value }],
      })
      .done()

    const preset2 = createStyoPreset('preset2')
      .usePreset(preset1)
      .unregisterNestedWithTemplates([
        'bp1',
      ])
      .unregisterSelectorTemplates([
        'aaa',
      ])
      .unregisterMacroStyoRules([
        'color-red',
        'padding-all',
      ])
      .registerNestedWithTemplates({
        bp2: '@media (min-width: 1200px)',
      })
      .registerSelectorTemplates({
        bbb: '.bbb .{a}',
      })
      .registerStaticMacroStyoRule({
        name: 'color-blue',
        partials: [{ color: 'blue' }],
      })
      .registerDynamicMacroStyoRule({
        name: 'padding-x',
        pattern: /px-\[(.*)\]/,
        template: 'px-[value]',
        createPartials: ([, value]) => [{ paddingLeft: value, paddingRight: value }],
      })
      .done()

    // check preset1 is not changed
    expect([...preset1.usingPresetNameSet]).toEqual([])
    expect([...preset1.nestedWithTemplateMap]).toEqual([
      ['bp1', '@media (min-width: 1100px)'],
    ])
    expect([...preset1.selectorTemplateMap]).toEqual([
      ['aaa', '.aaa .{a}'],
    ])
    expect([...preset1.registeredMacroStyoRuleMap.keys()]).toEqual([
      'color-red',
      'padding-all',
    ])

    // check preset2 is correct
    expect([...preset2.usingPresetNameSet]).toEqual([
      'preset1',
    ])
    expect([...preset2.nestedWithTemplateMap]).toEqual([
      ['bp2', '@media (min-width: 1200px)'],
    ])
    expect([...preset2.selectorTemplateMap]).toEqual([
      ['bbb', '.bbb .{a}'],
    ])
    expect([...preset2.registeredMacroStyoRuleMap.keys()]).toEqual([
      'color-blue',
      'padding-x',
    ])
  })

  it('should use preset (extending with overriding macro styo rules)', () => {
    const preset1 = createStyoPreset('preset1')
      .registerStaticMacroStyoRule({
        name: 'macro1',
        partials: [{
          color: 'red',
        }],
      })
      .done()

    const preset2 = createStyoPreset('preset2')
      .usePreset(preset1)
      .registerStaticMacroStyoRule({
        name: 'macro1',
        partials: [{
          color: 'blue',
        }],
      })
      .done()

    expect([...preset2.usingPresetNameSet]).toEqual([
      'preset1',
    ])
    expect([...preset2.registeredMacroStyoRuleMap.keys()]).toEqual([
      'macro1',
    ])
    expect(preset2.registeredMacroStyoRuleMap.get('macro1')?.definition).toEqual({
      name: 'macro1',
      partials: [{
        color: 'blue',
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
      .registerNestedWithTemplates({
        bp1: '@media (min-width: 1100px)',
        bp2: '@media (min-width: 1200px)',
        bp3: '@media (min-width: 1300px)',
        bp4: '@media (min-width: 1400px)',
      })
      .unregisterNestedWithTemplates([
        'bp2',
        'bp3',
      ])
      .done()

    expect([...styo.nestedWithTemplateMap]).toEqual([
      ['bp1', '@media (min-width: 1100px)'],
      ['bp4', '@media (min-width: 1400px)'],
    ])
  })

  it('should register and unregister selector templates', () => {
    const styo = createStyoInstance()
      .registerSelectorTemplates({
        aaa: '.aaa .{a}',
        bbb: '.bbb .{a}',
        ccc: '.ccc .{a}',
        ddd: '.ddd .{a}',
      })
      .unregisterSelectorTemplates([
        'bbb',
        'ccc',
      ])
      .done()

    expect([...styo.selectorTemplateMap]).toEqual([
      ['aaa', '.aaa .{a}'],
      ['ddd', '.ddd .{a}'],
    ])
  })

  it('should register and unregister macro styo rules (only check names)', () => {
    const styo = createStyoInstance()
      .registerStaticMacroStyoRule({
        name: 'color-red',
        partials: [{ color: 'red' }],
      })
      .registerStaticMacroStyoRule({
        name: 'color-blue',
        partials: [{ color: 'blue' }],
      })
      .registerStaticMacroStyoRule({
        name: 'color-green',
        partials: [{ color: 'green' }],
      })
      .registerDynamicMacroStyoRule({
        name: 'padding-x',
        pattern: /px-\[(.*)\]/,
        template: 'px-[value]',
        createPartials: ([, value]) => [{ paddingLeft: value, paddingRight: value }],
      })
      .registerDynamicMacroStyoRule({
        name: 'padding-y',
        pattern: /py-\[(.*)\]/,
        template: 'py-[value]',
        createPartials: ([, value]) => [{ paddingTop: value, paddingBottom: value }],
      })
      .registerDynamicMacroStyoRule({
        name: 'padding-all',
        pattern: /pa-\[(.*)\]/,
        template: 'pa-[value]',
        createPartials: ([, value]) => [`px-[${value}]`, `py-[${value}]`],
      })
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
      .registerNestedWithTemplates({
        bp1: '@media (min-width: 1100px)',
      })
      .registerSelectorTemplates({
        aaa: '.aaa .{a}',
      })
      .registerStaticMacroStyoRule({
        name: 'color-red',
        partials: [{ color: 'red' }],
      })
      .registerDynamicMacroStyoRule({
        name: 'padding-all',
        pattern: /pa-\[(.*)\]/,
        template: 'pa-[value]',
        createPartials: ([, value]) => [{ padding: value }],
      })
      .done()

    const styo = createStyoInstance()
      .usePreset(preset1)
      .registerNestedWithTemplates({
        bp2: '@media (min-width: 1200px)',
      })
      .registerSelectorTemplates({
        bbb: '.bbb .{a}',
      })
      .registerStaticMacroStyoRule({
        name: 'color-blue',
        partials: [{ color: 'blue' }],
      })
      .registerDynamicMacroStyoRule({
        name: 'padding-x',
        pattern: /px-\[(.*)\]/,
        template: 'px-[value]',
        createPartials: ([, value]) => [{ paddingLeft: value, paddingRight: value }],
      })
      .done()

    expect([...styo.usingPresetNameSet]).toEqual([
      'preset1',
    ])
    expect([...styo.nestedWithTemplateMap]).toEqual([
      ['bp1', '@media (min-width: 1100px)'],
      ['bp2', '@media (min-width: 1200px)'],
    ])
    expect([...styo.selectorTemplateMap]).toEqual([
      ['aaa', '.aaa .{a}'],
      ['bbb', '.bbb .{a}'],
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
      .registerNestedWithTemplates({
        bp1: '@media (min-width: 1100px)',
      })
      .registerSelectorTemplates({
        aaa: '.aaa .{a}',
      })
      .registerStaticMacroStyoRule({
        name: 'color-red',
        partials: [{ color: 'red' }],
      })
      .registerDynamicMacroStyoRule({
        name: 'padding-all',
        pattern: /pa-\[(.*)\]/,
        template: 'pa-[value]',
        createPartials: ([, value]) => [{ padding: value }],
      })
      .done()

    const styo = createStyoInstance()
      .usePreset(preset1)
      .unregisterNestedWithTemplates([
        'bp1',
      ])
      .unregisterSelectorTemplates([
        'aaa',
      ])
      .unregisterMacroStyoRules([
        'color-red',
        'padding-all',
      ])
      .registerNestedWithTemplates({
        bp2: '@media (min-width: 1200px)',
      })
      .registerSelectorTemplates({
        bbb: '.bbb .{a}',
      })
      .registerStaticMacroStyoRule({
        name: 'color-blue',
        partials: [{ color: 'blue' }],
      })
      .registerDynamicMacroStyoRule({
        name: 'padding-x',
        pattern: /px-\[(.*)\]/,
        template: 'px-[value]',
        createPartials: ([, value]) => [{ paddingLeft: value, paddingRight: value }],
      })
      .done()

    // check preset1 is not changed
    expect([...preset1.usingPresetNameSet]).toEqual([])
    expect([...preset1.nestedWithTemplateMap]).toEqual([
      ['bp1', '@media (min-width: 1100px)'],
    ])
    expect([...preset1.selectorTemplateMap]).toEqual([
      ['aaa', '.aaa .{a}'],
    ])
    expect([...preset1.registeredMacroStyoRuleMap.keys()]).toEqual([
      'color-red',
      'padding-all',
    ])

    // check styo is correct
    expect([...styo.usingPresetNameSet]).toEqual([
      'preset1',
    ])
    expect([...styo.nestedWithTemplateMap]).toEqual([
      ['bp2', '@media (min-width: 1200px)'],
    ])
    expect([...styo.selectorTemplateMap]).toEqual([
      ['bbb', '.bbb .{a}'],
    ])
    expect([...styo.registeredMacroStyoRuleMap.keys()]).toEqual([
      'color-blue',
      'padding-x',
    ])
  })

  it('should use preset (extending with overriding macro styo rules)', () => {
    const preset1 = createStyoPreset('preset1')
      .registerStaticMacroStyoRule({
        name: 'macro1',
        partials: [{
          color: 'red',
        }],
      })
      .done()

    const styo = createStyoInstance()
      .usePreset(preset1)
      .registerStaticMacroStyoRule({
        name: 'macro1',
        partials: [{
          color: 'blue',
        }],
      })
      .done()

    expect([...styo.usingPresetNameSet]).toEqual([
      'preset1',
    ])
    expect([...styo.registeredMacroStyoRuleMap.keys()]).toEqual([
      'macro1',
    ])
    expect(styo.registeredMacroStyoRuleMap.get('macro1')?.definition).toEqual({
      name: 'macro1',
      partials: [{
        color: 'blue',
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
      .registerNestedWithTemplates({
        '@smOnly': '@media (max-width: 767px)',
      })
      .registerSelectorTemplates({
        '[dark]': '[theme="dark"]{s},[theme="dark"] {s}',
        ':hover': '{s}:hover',
        '::before': '{s}::before',
      })
      // simple static macro styo rule
      .registerStaticMacroStyoRule({
        name: 'center',
        partials: [
          {
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
          },
        ],
      })
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
        ],
      })
      .registerStaticMacroStyoRule({
        name: 'btn-primary',
        partials: [
          'btn',
          {
            backgroundColor: 'blue',
          },
        ],
      })
      // simple dynamic macro styo rule
      .registerDynamicMacroStyoRule({
        name: 'padding-x',
        pattern: /px-\[(.*)\]/,
        template: 'px-[value]',
        createPartials: ([, value]) => [{ paddingLeft: value, paddingRight: value }],
      })
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

    // The result of names has 6 items because the display property from "center" is overridden by "btn" macro styo rule.
    expect(atomicStyoRuleNames).toEqual(['styo-b', 'styo-c', 'styo-d', 'styo-e', 'styo-f', 'styo-g'])
    // Although the display property from "center" is overridden by "btn" macro styo rule, the number of registered atomic styo rules from "center" is still 3.
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
      'styo-b',
      'styo-c',
      'styo-d',
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

    // If the same condition but different value rule is generated, it will be overwritten.
    expect(atomicStyoRuleNames).toEqual(['styo-c', 'styo-d'])
    // The atomic styo rules from "px-[1rem]" are still registered.
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

  it<LocalTestContext>('should override the meta parts and able to write extra properties', ({ styo }) => {
    const atomicStyoRuleNames = styo.style(
      {
        $nestedWith: '@smOnly',
        $selector: '[dark]',
        $important: false,
        $apply: ['px-[16px]', 'px-[1rem]'],
        color: 'red',
      },
    )
    expect(atomicStyoRuleNames).toEqual(['styo-e', 'styo-f', 'styo-g'])
    expect(styo.registeredAtomicStyoRuleMap.size).toEqual(7)
    expect(styo.registeredAtomicStyoRuleMap.get('styo-a')?.content).toEqual({
      nestedWith: '@media (min-width: 1000px)',
      selector: '.default .{a}',
      important: true,
      property: 'padding-left',
      value: '16px',
    })
    expect(styo.registeredAtomicStyoRuleMap.get('styo-b')?.content).toEqual({
      nestedWith: '@media (min-width: 1000px)',
      selector: '.default .{a}',
      important: true,
      property: 'padding-right',
      value: '16px',
    })
    expect(styo.registeredAtomicStyoRuleMap.get('styo-c')?.content).toEqual({
      nestedWith: '@media (min-width: 1000px)',
      selector: '.default .{a}',
      important: true,
      property: 'padding-left',
      value: '1rem',
    })
    expect(styo.registeredAtomicStyoRuleMap.get('styo-d')?.content).toEqual({
      nestedWith: '@media (min-width: 1000px)',
      selector: '.default .{a}',
      important: true,
      property: 'padding-right',
      value: '1rem',
    })
    expect(styo.registeredAtomicStyoRuleMap.get('styo-e')?.content).toEqual({
      nestedWith: '@media (max-width: 767px)',
      selector: '[theme="dark"].default .{a},[theme="dark"] .default .{a}',
      important: false,
      property: 'padding-left',
      value: '1rem',
    })
    expect(styo.registeredAtomicStyoRuleMap.get('styo-f')?.content).toEqual({
      nestedWith: '@media (max-width: 767px)',
      selector: '[theme="dark"].default .{a},[theme="dark"] .default .{a}',
      important: false,
      property: 'padding-right',
      value: '1rem',
    })
    expect(styo.registeredAtomicStyoRuleMap.get('styo-g')?.content).toEqual({
      nestedWith: '@media (max-width: 767px)',
      selector: '[theme="dark"].default .{a},[theme="dark"] .default .{a}',
      important: false,
      property: 'color',
      value: 'red',
    })
  })
})
