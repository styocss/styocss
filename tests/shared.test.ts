import { beforeEach, describe, expect, it, vi } from 'vitest'
import { noop, invoke, createEventHook, numberToAlphabets, isRegExp, toKebab } from '@styocss/shared'

describe('Test "noop"', () => {
  it('should be empty logic', ({ expect }) => {
    expect(noop()).toBeUndefined()
    expect(noop.toString()).toMatch(/\(\) => \{\s*\}/)
  })
})

describe('Test "isRegExp"', () => {
  it ('should be a RegExp', ({ expect }) => {
    expect(isRegExp(/asd/)).toBeTruthy()
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
  it('should be equal.', () => {
    expect(numberToAlphabets(0)).toBe('a')
    expect(numberToAlphabets(26)).toBe('ba')
    expect(numberToAlphabets(676)).toBe('baa')
  })
})

describe('Test "toKebab"', () => {
  it('should be equal.', () => {
    expect(toKebab('aaa-bbb')).toBe('aaa-bbb')
    expect(toKebab('aaaBbb')).toBe('aaa-bbb')
    expect(toKebab('--aaa-bbb')).toBe('--aaa-bbb')
    expect(toKebab('AAABBB')).toBe('a-a-a-b-b-b')
  })
})
