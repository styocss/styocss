import { describe, beforeEach, it, vi, expect } from 'vitest'
import { AtomicMacroItemEngine } from '../packages/atomic-macro-item-engine/src'

describe('Test AtomicMacroItemEngine', () => {
  interface LocalTestContext {
    engine: AtomicMacroItemEngine<Record<string, any>, Record<string, any>>
  }

  beforeEach<LocalTestContext>((ctx) => {
    ctx.engine = new AtomicMacroItemEngine({
      atomicItemsDefinitionExtractor (atomicUtilitiesDefinition) {
        return Object.entries(atomicUtilitiesDefinition)
          .map(([key, value]) => ({ [key]: value }))
      },
      atomicItemNameGetter (atomicUtilityMeta) {
        return JSON.stringify(atomicUtilityMeta)
      },
    })
    ctx.engine.addMacroItems([
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

  it<LocalTestContext>('should be triggered. (hooks)', ({ engine }) => {
    const fn = vi.fn()
    engine.onAtomicItemRegistered(fn)
    engine.useAtomicItems({ a: '1' })
    expect(fn.mock.lastCall).toEqual([{ name: '{"a":"1"}', content: { a: '1' } }])

    engine.onWarned(fn)
    engine.useAtomicItems('undefined macro')
    expect(fn.mock.lastCall).toEqual([['MacroItemUndefined', 'undefined macro']])
  })

  it<LocalTestContext>('should be matched. (using atomic utilities)', ({ engine }) => {
    expect(engine.registeredAtomicItemMap).toEqual(new Map())

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

    expect(engine.useAtomicItems(definition)).toEqual(expectedAtomicUtilities)
    expect(engine.registeredAtomicItemMap).toEqual(expectedRegisteredAtomicUtilitiesMap)

    // using repeated registered atomic utilities, should be deduplicated
    expect(engine.useAtomicItems(definition, definition, definition)).toEqual(expectedAtomicUtilities)
  })

  it<LocalTestContext>('should be matched. (using static macro utilities)', ({ engine }) => {
    expect(engine.registeredAtomicItemMap).toEqual(new Map())
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
    expect(engine.useAtomicItems('a+b')).toEqual(expectedAtomicUtilities)
    expect(engine.registeredAtomicItemMap).toEqual(expectedRegisteredAtomicUtilitiesMap)
  })

  it<LocalTestContext>('should be matched. (using dynamic macro utilities)', ({ engine }) => {
    expect(engine.registeredAtomicItemMap).toEqual(new Map())
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

    expect(engine.useAtomicItems('c[3]', 'c[4]')).toEqual(expectedAtomicUtilities)
    expect(engine.registeredAtomicItemMap).toEqual(expectedRegisteredAtomicUtilitiesMap)
  })

  it<LocalTestContext>('should be matched. (using temporary added macro utilities)', ({ engine }) => {
    expect(engine.useAtomicItems('temp')).toEqual([])
    engine.addMacroItems([
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

    expect(engine.useAtomicItems('temp')).toEqual(expectedAtomicUtilities)
  })
})
