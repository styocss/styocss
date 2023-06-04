import { beforeEach, describe, it, vi } from 'vitest'
import { createEventHook, numberToAlphabets, toKebab } from '@styocss/shared'

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
    hook.on(fn)()
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
