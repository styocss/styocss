import type { Awaitable } from './types'

/** Core-private work that must run after every plugin configureEngine hook but before Engine finalization. */
type EngineFinalizer = () => Awaitable<void>

const finalizers = new WeakMap<object, EngineFinalizer[]>()

/** @internal */
export function registerCoreEngineFinalizer(engine: object, finalizer: EngineFinalizer): void {
	const tasks = finalizers.get(engine) ?? []
	tasks.push(finalizer)
	finalizers.set(engine, tasks)
}

/** @internal */
export async function runCoreEngineFinalizers(engine: object): Promise<void> {
	const tasks = finalizers.get(engine) ?? []
	finalizers.delete(engine)
	for (const task of tasks)
		await task()
}
