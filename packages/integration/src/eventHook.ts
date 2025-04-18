export type EventHookListener<EventPayload> = (payload: EventPayload) => void | Promise<void>

export interface EventHook<EventPayload> {
	listeners: Set<EventHookListener<EventPayload>>
	trigger: (payload: EventPayload) => void
	on: (listener: EventHookListener<EventPayload>) => () => void
	off: (listener: EventHookListener<EventPayload>) => void
}

export function createEventHook<EventPayload>(): EventHook<EventPayload> {
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
