import { describe, beforeEach, it, vi } from 'vitest'
import { UtilitiesEngine } from '@styocss/utilities-engine'

describe('Test UtilitiesEngine', () => {
  interface LocalTestContext {
    engine: UtilitiesEngine<Record<string, any>, Record<string, any>>
  }

  beforeEach<LocalTestContext>((ctx) => {
    ctx.engine = new UtilitiesEngine({
      atomicUtilitiesDefinitionExtractor (atomicUtilitiesDefinition) {
        return Object.entries(atomicUtilitiesDefinition)
          .map(([key, value]) => ({ [key]: value }))
      },
      atomicUtilityNameGetter (atomicUtilityMeta) {
        return JSON.stringify(atomicUtilityMeta)
      },
    })
    ctx.engine.addMacroUtilities([
      {
        name: 'a+b',
        partials: [
          {
            a: '1',
            b: '2',
          },
        ],
      },
      {
        pattern: /^c\[(.*)\]$/,
        createPartials: ([, value]) => [
          'a+b',
          {
            c: value,
          },
        ],
      },
    ])
  })

  it<LocalTestContext>('should be triggered. (hooks)', ({ expect, engine }) => {
    const fn = vi.fn()
    engine.onAtomicUtilityRegistered(fn)
    engine.useUtilities({ a: '1' })
    expect(fn.mock.lastCall).toEqual([{ name: '{"a":"1"}', content: { a: '1' } }])

    engine.onWarned(fn)
    engine.useUtilities('undefined macro')
    expect(fn.mock.lastCall).toEqual([['MacroUtilityUndefined', 'undefined macro']])
  })

  it<LocalTestContext>('should be matched. (using atomic utilities)', ({ expect, engine }) => {
    expect(engine.registeredAtomicUtilitiesMap).toEqual(new Map())

    const definition = { a: '1', b: '2' }
    const expectedAtomicUtilityNames = ['{"a":"1"}', '{"b":"2"}']
    const expectedRegisteredAtomicUtilitiesMap = new Map([
      [expectedAtomicUtilityNames[0], {
        name: expectedAtomicUtilityNames[0],
        content: {
          a: '1',
        },
      }],
      [expectedAtomicUtilityNames[1], {
        name: expectedAtomicUtilityNames[1],
        content: {
          b: '2',
        },
      }],
    ])
    const expectedAtomicUtilities = expectedAtomicUtilityNames.map((name) => expectedRegisteredAtomicUtilitiesMap.get(name)!)

    expect(engine.useUtilities(definition)).toEqual(expectedAtomicUtilities)
    expect(engine.registeredAtomicUtilitiesMap).toEqual(expectedRegisteredAtomicUtilitiesMap)

    // using repeated registered atomic utilities, should be deduplicated
    expect(engine.useUtilities(definition, definition, definition)).toEqual(expectedAtomicUtilities)
  })

  it<LocalTestContext>('should be matched. (using static macro utilities)', ({ expect, engine }) => {
    expect(engine.registeredAtomicUtilitiesMap).toEqual(new Map())
    const expectedAtomicUtilityNames = ['{"a":"1"}', '{"b":"2"}']
    const expectedRegisteredAtomicUtilitiesMap = new Map([
      [expectedAtomicUtilityNames[0], {
        name: expectedAtomicUtilityNames[0],
        content: {
          a: '1',
        },
      }],
      [expectedAtomicUtilityNames[1], {
        name: expectedAtomicUtilityNames[1],
        content: {
          b: '2',
        },
      }],
    ])
    const expectedAtomicUtilities = expectedAtomicUtilityNames.map((name) => expectedRegisteredAtomicUtilitiesMap.get(name)!)
    expect(engine.useUtilities('a+b')).toEqual(expectedAtomicUtilities)
    expect(engine.registeredAtomicUtilitiesMap).toEqual(expectedRegisteredAtomicUtilitiesMap)
  })

  it<LocalTestContext>('should be matched. (using dynamic macro utilities)', ({ expect, engine }) => {
    expect(engine.registeredAtomicUtilitiesMap).toEqual(new Map())
    const expectedAtomicUtilityNames = ['{"a":"1"}', '{"b":"2"}', '{"c":"3"}', '{"c":"4"}']
    const expectedRegisteredAtomicUtilitiesMap = new Map([
      [expectedAtomicUtilityNames[0], {
        name: expectedAtomicUtilityNames[0],
        content: {
          a: '1',
        },
      }],
      [expectedAtomicUtilityNames[1], {
        name: expectedAtomicUtilityNames[1],
        content: {
          b: '2',
        },
      }],
      [expectedAtomicUtilityNames[2], {
        name: expectedAtomicUtilityNames[2],
        content: {
          c: '3',
        },
      }],
      [expectedAtomicUtilityNames[3], {
        name: expectedAtomicUtilityNames[3],
        content: {
          c: '4',
        },
      }],
    ])
    const expectedAtomicUtilities = expectedAtomicUtilityNames.map((name) => expectedRegisteredAtomicUtilitiesMap.get(name)!)

    expect(engine.useUtilities('c[3]', 'c[4]')).toEqual(expectedAtomicUtilities)
    expect(engine.registeredAtomicUtilitiesMap).toEqual(expectedRegisteredAtomicUtilitiesMap)
  })

  it<LocalTestContext>('should be matched. (using temporary added macro utilities)', ({ expect, engine }) => {
    expect(engine.useUtilities('temp')).toEqual([])
    engine.addMacroUtilities([
      {
        name: 'temp',
        partials: [{ temp: '1' }],
      },
    ])

    const expectedAtomicUtilityNames = ['{"temp":"1"}']
    const expectedRegisteredAtomicUtilitiesMap = new Map([
      [expectedAtomicUtilityNames[0], {
        name: expectedAtomicUtilityNames[0],
        content: { temp: '1' },
      }],
    ])
    const expectedAtomicUtilities = expectedAtomicUtilityNames.map((name) => expectedRegisteredAtomicUtilitiesMap.get(name)!)

    expect(engine.useUtilities('temp')).toEqual(expectedAtomicUtilities)
  })
})

// describe('default options, atomic utilities', () => {
//   interface LocalTestContext {
//     engine: UtilitiesEngine
//   }

//   beforeEach<LocalTestContext>((ctx) => {
//     ctx.engine = new UtilitiesEngine()
//   })

//   it<LocalTestContext>('should be matched (only properties)', ({ expect, engine }) => {
//     expect(engine.useUtilities({
//       display: 'flex',
//     })).toMatchObject(['a'])
//     expect(engine.renderAtomicUtilities()).toBe('.a{display:flex}')
//   })

//   it<LocalTestContext>('should be matched (properties with "__important")', ({ expect, engine }) => {
//     expect(engine.useUtilities({
//       __important: true,
//       display: 'flex',
//     })).toMatchObject(['a'])
//     expect(engine.renderAtomicUtilities()).toBe('.a{display:flex !important}')
//   })

//   it<LocalTestContext>('should be matched (properties with "__selector")', ({ expect, engine }) => {
//     expect(engine.useUtilities({
//       __selector: '.%name%:hover',
//       display: 'flex',
//     })).toMatchObject(['a'])
//     expect(engine.renderAtomicUtilities()).toBe('.a:hover{display:flex}')
//   })

//   it<LocalTestContext>('should be matched (properties with "__nestedWith")', ({ expect, engine }) => {
//     expect(engine.useUtilities({
//       __nestedWith: '@media screen and (min-width:300px)',
//       display: 'flex',
//     })).toMatchObject(['a'])
//     expect(engine.renderAtomicUtilities()).toBe('@media screen and (min-width:300px){.a{display:flex}}')
//   })
// })

// describe('default options, macro utilities', () => {
//   interface LocalTestContext {
//     engine: UtilitiesEngine
//   }

//   beforeEach<LocalTestContext>((ctx) => {
//     ctx.engine = new UtilitiesEngine({
//       macroUtilities: [
//         {
//           center: [{
//             display: 'flex',
//             alignItems: 'center',
//             justifyContent: 'center',
//           }],
//         },
//         ['bg-black', [{ backgroundColor: 'black' }]],
//         [/^p-(\d+)$/, ([, n]) => [
//           {
//             padding: `${Number(n) / 4}rem`,
//           },
//         ]],
//         // error case
//         [{}, () => ['aaa']] as any,
//       ],
//     })
//   })

//   it<LocalTestContext>('should be matched (macro utility)', ({ expect, engine }) => {
//     expect(engine.useUtilities('center')).toMatchObject(['a', 'b', 'c'])
//     expect(engine.useUtilities('bg-black')).toMatchObject(['d'])
//     expect(engine.useUtilities('p-1')).toMatchObject(['e'])
//     expect(engine.useUtilities('p-2')).toMatchObject(['f'])
//     expect(engine.useUtilities('undefined')).toMatchObject([])
//     expect(engine.renderAtomicUtilities()).toBe(`
//       .a{display:flex}
//       .b{align-items:center}
//       .c{justify-content:center}
//       .d{background-color:black}
//       .e{padding:0.25rem}
//       .f{padding:0.5rem}
//     `.trim().split('\n').map((s) => s.trim()).join('\n'))
//   })
// })
