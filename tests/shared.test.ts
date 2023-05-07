import { beforeEach, describe, it, vi } from 'vitest'
import { noop, invoke, createEventHook, numberToAlphabets, toKebab, mergeTwoSets, mergeTwoMaps } from '@styocss/shared'

describe('Test "noop"', () => {
  it('should be empty logic', ({ expect }) => {
    expect(noop()).toBeUndefined()
    expect(noop.toString()).toMatch(/\(\) => \{\s*\}/)
  })
})

describe('Test "invoke"', () => {
  it('should be invoked', ({ expect }) => {
    const obj = {
      fn (a: number) {
        return a
      },
    }
    const fnSpy = vi.spyOn(obj, 'fn')
    expect(invoke(obj.fn, 123)).toBe(123)
    expect(fnSpy.mock.lastCall).toEqual([123])
  })
})

describe('Test "createEventHook"', () => {
  interface LocalTestContext {
    hook: ReturnType<typeof createEventHook>
  }

  beforeEach<LocalTestContext>((ctx) => {
    ctx.hook = createEventHook()
  })

  it<LocalTestContext>('should be notified after binding listener', ({ expect, hook }) => {
    const fn = vi.fn()
    hook.on(fn)
    hook.trigger('test')
    expect(fn.mock.lastCall).toEqual(['test'])
  })

  it<LocalTestContext>('should not be notified after unbinding listener', ({ expect, hook }) => {
    const fn = vi.fn()
    invoke(hook.on(fn))
    hook.trigger('test')
    expect(fn.mock.lastCall).toBeUndefined()

    hook.on(fn)
    hook.off(fn)
    hook.trigger('test')
    expect(fn.mock.lastCall).toBeUndefined()
  })
})

describe('Test "numberToAlphabets"', () => {
  it('should be equal.', ({ expect }) => {
    expect(numberToAlphabets(0)).toBe('a')
    expect(numberToAlphabets(26)).toBe('A')
    expect(numberToAlphabets(676)).toBe('na')
  })
})

describe('Test "toKebab"', () => {
  it('should be equal.', ({ expect }) => {
    expect(toKebab('aaa-bbb')).toBe('aaa-bbb')
    expect(toKebab('aaaBbb')).toBe('aaa-bbb')
    expect(toKebab('--aaa-bbb')).toBe('--aaa-bbb')
    expect(toKebab('AAABBB')).toBe('a-a-a-b-b-b')
  })
})

describe('Test "mergeTwoSets"', () => {
  it('should be equal.', ({ expect }) => {
    // Check the order of the elements.
    expect([...mergeTwoSets(new Set([1, 2, 3]), new Set([1, 3, 4]))]).toEqual([...new Set([2, 1, 3, 4])])
  })
})

describe('Test "mergeTwoMaps"', () => {
  it('should be equal.', ({ expect }) => {
    // Check the order of the elements.
    expect([...mergeTwoMaps(new Map([[1, 2], [2, 3], [3, 4]]), new Map([[1, 2], [3, 4], [4, 5]]))]).toEqual([...new Map([[2, 3], [1, 2], [3, 4], [4, 5]])])
  })
})
