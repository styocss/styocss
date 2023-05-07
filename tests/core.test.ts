import { describe, it, expect, beforeEach } from 'vitest'
import {
  createStyoEngine,
} from '@styocss/core'
import {
  $properties,
} from '@styocss/helpers'

describe('core', () => {
  function createLocalContext () {
    return {
      engine: createStyoEngine({
        aliases: {
          nested: [
            {
              type: 'dynamic',
              key: '@min',
              pattern: /^@min\[(\d+)\]$/,
              predefinedList: ['@min[576]', '@min[768]', '@min[992]', '@min[1200]', '@min[1400]'],
              createValue: (matched: RegExpMatchArray) => `@media (min-width: ${matched[1]}px)`,
            },
            {
              type: 'dynamic',
              key: '@max',
              pattern: /^@max\[(\d+)\]$/,
              predefinedList: ['@max[575]', '@max[767]', '@max[991]', '@max[1199]', '@max[1399]'],
              createValue: (matched: RegExpMatchArray) => `@media (max-width: ${matched[1]}px)`,
            },
            {
              type: 'dynamic',
              key: '@between',
              pattern: /^@between\[(\d+),(\d+)\]$/,
              predefinedList: ['@between[576,767]', '@between[768,991]', '@between[992,1199]', '@between[1200,1399]'],
              createValue: (matched: RegExpMatchArray) => `@media (min-width: ${matched[1]}px) and (max-width: ${matched[2]}px)`,
            },
            {
              type: 'static',
              key: '@xsOnly',
              alias: '@xsOnly',
              value: '@max[575]',
            },
            {
              type: 'static',
              key: '@smOnly',
              alias: '@smOnly',
              value: '@between[576,767]',
            },
            {
              type: 'static',
              key: '@mdOnly',
              alias: '@mdOnly',
              value: '@between[768,991]',
            },
            {
              type: 'static',
              key: '@lgOnly',
              alias: '@lgOnly',
              value: '@between[992,1199]',
            },
            {
              type: 'static',
              key: '@xlOnly',
              alias: '@xlOnly',
              value: '@between[1200,1399]',
            },
            {
              type: 'static',
              key: '@xxlOnly',
              alias: '@xxlOnly',
              value: '@min[1400]',
            },
          ],
          selector: [
            {
              type: 'dynamic',
              key: '[theme]',
              pattern: /^\[theme:(.*)\]$/,
              predefinedList: ['[theme:dark]', '[theme:light]'],
              createValue: (matched: RegExpMatchArray) => `[theme="${matched[1]}"]{s},[theme="${matched[1]}"] {s}`,
            },
          ],
        },
        shortcuts: [
          {
            type: 'static',
            key: 'flex-center',
            name: 'center',
            partials: [
              {
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
              },
            ],
          },
          {
            type: 'static',
            key: 'my-btn',
            name: 'my-btn',
            partials: [
              'center',
              {
                'display': 'inline-flex',
                'padding': '0.5rem 1rem',
                'border-radius': '0.25rem',
                'cursor': 'pointer',
              },
              {
                $selector: ':not(:active):hover',
                transform: 'scale(1.05)',
              },
              {
                $selector: ':active',
                transform: 'scale(0.95)',
              },
              {
                $selector: '[theme:dark]',
                backgroundColor: '#333',
                color: '#ddd',
              },
              {
                $selector: '[theme:light]',
                backgroundColor: '#ddd',
                color: '#333',
              },
            ],
          },
          {
            type: 'dynamic',
            key: 'padding-all',
            pattern: /^pa-(\d+)$/,
            predefinedList: ['pa-1', 'pa-2', 'pa-3', 'pa-4', 'pa-5', 'pa-6', 'pa-7', 'pa-8', 'pa-9', 'pa-10'],
            createPartials: (match) => {
              const n = Number(match[1])
              return [{
                padding: `${n / 4}rem`,
              }]
            },
          },
          {
            type: 'dynamic',
            key: 'margin-all',
            pattern: /^ma-(\d+)$/,
            predefinedList: ['ma-1', 'ma-2', 'ma-3', 'ma-4', 'ma-5', 'ma-6', 'ma-7', 'ma-8', 'ma-9', 'ma-10'],
            createPartials: (match) => {
              const n = Number(match[1])
              return [{
                margin: `${n / 4}rem`,
              }]
            },
          },
        ],
      }),
    }
  }

  type LocalContext = ReturnType<typeof createLocalContext>

  beforeEach<LocalContext>((context) => {
    const { engine } = createLocalContext()
    context.engine = engine
  })

  it<LocalContext>('should apply correct nested (alias for nested)', ({ engine }) => {
    engine.styo(
      {
        $nested: '@xsOnly',
        color: 'red',
      },
      {
        $nested: '@min[999]',
        color: 'red',
      },
      {
        $nested: '@max[999]',
        color: 'red',
      },
      {
        $nested: '@between[999,999]',
        color: 'red',
      },
    )
    expect(engine.atomicStylesMap.get('a')?.content).toEqual({
      nested: '@media (max-width: 575px)',
      selector: '.{a}',
      important: false,
      property: 'color',
      value: 'red',
    })
    expect(engine.atomicStylesMap.get('b')?.content).toEqual({
      nested: '@media (min-width: 999px)',
      selector: '.{a}',
      important: false,
      property: 'color',
      value: 'red',
    })
    expect(engine.atomicStylesMap.get('c')?.content).toEqual({
      nested: '@media (max-width: 999px)',
      selector: '.{a}',
      important: false,
      property: 'color',
      value: 'red',
    })
    expect(engine.atomicStylesMap.get('d')?.content).toEqual({
      nested: '@media (min-width: 999px) and (max-width: 999px)',
      selector: '.{a}',
      important: false,
      property: 'color',
      value: 'red',
    })
  })

  it<LocalContext>('should apply correct selector (alias for selector)', ({ engine }) => {
    engine.styo(
      {
        $selector: '[theme:dark]',
        color: 'white',
      },
      {
        $selector: '[theme:light]',
        color: 'black',
      },
    )
    expect(engine.atomicStylesMap.get('a')?.content).toEqual({
      nested: '',
      selector: '[theme="dark"].{a}',
      important: false,
      property: 'color',
      value: 'white',
    })
    expect(engine.atomicStylesMap.get('b')?.content).toEqual({
      nested: '',
      selector: '[theme="dark"] .{a}',
      important: false,
      property: 'color',
      value: 'white',
    })
    expect(engine.atomicStylesMap.get('c')?.content).toEqual({
      nested: '',
      selector: '[theme="light"].{a}',
      important: false,
      property: 'color',
      value: 'black',
    })
    expect(engine.atomicStylesMap.get('d')?.content).toEqual({
      nested: '',
      selector: '[theme="light"] .{a}',
      important: false,
      property: 'color',
      value: 'black',
    })
  })

  it<LocalContext>('should generate correct atomic styles (object style)', ({ engine }) => {
    engine.styo(
      {
        color: 'red',
        backgroundColor: 'blue',
      },
    )
    expect([...engine.atomicStylesMap.values()]).toEqual([
      {
        name: 'a',
        content: {
          nested: '',
          selector: '.{a}',
          important: false,
          property: 'color',
          value: 'red',
        },
      },
      {
        name: 'b',
        content: {
          nested: '',
          selector: '.{a}',
          important: false,
          property: 'background-color',
          value: 'blue',
        },
      },
    ])
  })

  it<LocalContext>('should generate correct atomic styles (string style)', ({ engine }) => {
    engine.styo(
      $properties`
        color: red;
        background-color: blue;
      `,
    )
    expect([...engine.atomicStylesMap.values()]).toEqual([
      {
        name: 'a',
        content: {
          nested: '',
          selector: '.{a}',
          important: false,
          property: 'color',
          value: 'red',
        },
      },
      {
        name: 'b',
        content: {
          nested: '',
          selector: '.{a}',
          important: false,
          property: 'background-color',
          value: 'blue',
        },
      },
    ])
  })

  it<LocalContext>('should generate correct shortcuts (pa-1, ma-1, center)', ({ engine }) => {
    engine.styo(
      'pa-1',
      'ma-1',
      'center',
    )
    expect([...engine.atomicStylesMap.values()]).toEqual([
      {
        name: 'a',
        content: {
          nested: '',
          selector: '.{a}',
          important: false,
          property: 'padding',
          value: '0.25rem',
        },
      },
      {
        name: 'b',
        content: {
          nested: '',
          selector: '.{a}',
          important: false,
          property: 'margin',
          value: '0.25rem',
        },
      },
      {
        name: 'c',
        content: {
          nested: '',
          selector: '.{a}',
          important: false,
          property: 'display',
          value: 'flex',
        },
      },
      {
        name: 'd',
        content: {
          nested: '',
          selector: '.{a}',
          important: false,
          property: 'justify-content',
          value: 'center',
        },
      },
      {
        name: 'e',
        content: {
          nested: '',
          selector: '.{a}',
          important: false,
          property: 'align-items',
          value: 'center',
        },
      },
    ])
  })

  it<LocalContext>('should generate correct shortcuts (my-btn)', ({ engine }) => {
    engine.styo(
      'my-btn',
    )
    expect([...engine.atomicStylesMap.values()]).toEqual([
      {
        content: {
          nested: '',
          selector: '.{a}',
          important: false,
          property: 'justify-content',
          value: 'center',
        },
        name: 'a',
      },
      {
        content: {
          nested: '',
          selector: '.{a}',
          important: false,
          property: 'align-items',
          value: 'center',
        },
        name: 'b',
      },
      {
        content: {
          nested: '',
          selector: '.{a}',
          important: false,
          property: 'display',
          value: 'inline-flex',
        },
        name: 'c',
      },
      {
        content: {
          nested: '',
          selector: '.{a}',
          important: false,
          property: 'padding',
          value: '0.5rem 1rem',
        },
        name: 'd',
      },
      {
        content: {
          nested: '',
          selector: '.{a}',
          important: false,
          property: 'border-radius',
          value: '0.25rem',
        },
        name: 'e',
      },
      {
        content: {
          nested: '',
          selector: '.{a}',
          important: false,
          property: 'cursor',
          value: 'pointer',
        },
        name: 'f',
      },
      {
        content: {
          nested: '',
          selector: '.{a}:not(:active):hover',
          important: false,
          property: 'transform',
          value: 'scale(1.05)',
        },
        name: 'g',
      },
      {
        content: {
          nested: '',
          selector: '.{a}:active',
          important: false,
          property: 'transform',
          value: 'scale(0.95)',
        },
        name: 'h',
      },
      {
        content: {
          nested: '',
          selector: '[theme="dark"].{a}',
          important: false,
          property: 'background-color',
          value: '#333',
        },
        name: 'i',
      },
      {
        content: {
          nested: '',
          selector: '[theme="dark"] .{a}',
          important: false,
          property: 'background-color',
          value: '#333',
        },
        name: 'j',
      },
      {
        content: {
          nested: '',
          selector: '[theme="dark"].{a}',
          important: false,
          property: 'color',
          value: '#ddd',
        },
        name: 'k',
      },
      {
        content: {
          nested: '',
          selector: '[theme="dark"] .{a}',
          important: false,
          property: 'color',
          value: '#ddd',
        },
        name: 'l',
      },
      {
        content: {
          nested: '',
          selector: '[theme="light"].{a}',
          important: false,
          property: 'background-color',
          value: '#ddd',
        },
        name: 'm',
      },
      {
        content: {
          nested: '',
          selector: '[theme="light"] .{a}',
          important: false,
          property: 'background-color',
          value: '#ddd',
        },
        name: 'n',
      },
      {
        content: {
          nested: '',
          selector: '[theme="light"].{a}',
          important: false,
          property: 'color',
          value: '#333',
        },
        name: 'o',
      },
      {
        content: {
          nested: '',
          selector: '[theme="light"] .{a}',
          important: false,
          property: 'color',
          value: '#333',
        },
        name: 'p',
      },
    ])
  })

  it<LocalContext>('should respect the order of shortcuts and not generate useless styles', ({ engine }) => {
    engine.styo(
      'pa-1',
      'pa-2',
      'pa-3',
      'pa-4',
    )
    expect(engine.atomicStylesMap.get('a')?.content).toEqual({
      nested: '',
      selector: '.{a}',
      important: false,
      property: 'padding',
      value: '1rem',
    })
  })
})
