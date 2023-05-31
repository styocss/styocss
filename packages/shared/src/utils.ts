/* c8 ignore next 2 */
export const isString = (value: unknown): value is string => typeof value === 'string'
export const isArray = <T = any>(value: unknown): value is T[] => Array.isArray(value)

export type EventHookListener<EventPayload> = (payload: EventPayload) => void | Promise<void>
export function createEventHook<EventPayload> () {
  const listeners = new Set<EventHookListener<EventPayload>>()

  function trigger (payload: EventPayload) {
    listeners.forEach((listener) => listener(payload))
  }

  function off (listener: EventHookListener<EventPayload>) {
    listeners.delete(listener)
  }

  function on (listener: EventHookListener<EventPayload>) {
    listeners.add(listener)
    const offListener = () => off(listener)
    return offListener
  }

  return {
    trigger,
    on,
    off,
  }
}

const alphabets = [...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ']
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

export function isNotNullish<T> (value: T): value is NonNullable<T> {
  return value != null
}
