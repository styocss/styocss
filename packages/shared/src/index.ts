export const noop = () => {}

export const invoke = <Fn extends (...params: any[]) => any>(fn: Fn, ...params: Parameters<Fn>): ReturnType<Fn> => fn(...params)

export const isRegExp = (value: unknown): value is RegExp => Object.prototype.toString.call(value) === '[object RegExp]'

export type EventHookListener<EventPayload> = (payload: EventPayload) => void | Promise<void>
export function createEventHook<EventPayload> () {
  const listeners = new Set<EventHookListener<EventPayload>>()

  function trigger (payload: EventPayload) {
    listeners.forEach((fn) => fn(payload))
  }

  function off (fn: EventHookListener<EventPayload>) {
    listeners.delete(fn)
  }

  function on (fn: EventHookListener<EventPayload>) {
    listeners.add(fn)
    const _off = () => off(fn)
    return _off
  }

  return {
    trigger,
    on,
    off,
  }
}

const alphabets = [
  'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i',
  'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r',
  's', 't', 'u', 'v', 'w', 'x', 'y', 'z',
]
const numOfAlphabets = alphabets.length
export function numberToAlphabets (num: number) {
  let [str, n] = ['', num]
  while (true) {
    str = `${alphabets[n % numOfAlphabets]}${str}`
    n = Math.floor(n / numOfAlphabets)
    if (n === 0)
      break
  }
  return str
}

export function toKebab (maybeCamel: string) {
  return Array.from(maybeCamel, (c, i) => {
    if (i !== 0 && /[A-Z]/.test(c))
      return `-${c.toLowerCase()}`
    return c.toLowerCase()
  }).join('')
}
