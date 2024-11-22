export type EventHookListener<EventPayload> = (payload: EventPayload) => void | Promise<void>
export function createEventHook<EventPayload>() {
	const listeners = new Set<EventHookListener<EventPayload>>()

	function trigger(payload: EventPayload) {
		listeners.forEach(listener => listener(payload))
	}

	function off(listener: EventHookListener<EventPayload>) {
		listeners.delete(listener)
	}

	function on(listener: EventHookListener<EventPayload>) {
		listeners.add(listener)
		const offListener = () => off(listener)
		return offListener
	}

	return {
		listeners,
		trigger,
		on,
		off,
	}
}

const chars = [...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ']
const numOfChars = chars.length
export function numberToChars(num: number) {
	let [str, n] = ['', num]
	while (true) {
		str = `${chars[n % numOfChars]}${str}`
		n = Math.floor(n / numOfChars)
		if (n === 0)
			break
	}
	return str
}

export function toKebab(maybeCamel: string) {
	return Array.from(maybeCamel, (c, i) => {
		if (i !== 0 && /[A-Z]/.test(c))
			return `-${c.toLowerCase()}`
		return c.toLowerCase()
	}).join('')
}

export function isNotNullish<T>(value: T): value is NonNullable<T> {
	return value != null
}

export function serialize(value: any) {
	return JSON.stringify(value)
}
