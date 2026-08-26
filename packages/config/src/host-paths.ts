import { isAbsolute, normalize, relative, resolve } from 'pathe'

/** @internal */
export function normalizeAbsolutePath(value: string, label: string): string {
	if (typeof value !== 'string' || value.trim().length === 0)
		throw new Error(`${label} must be a non-empty absolute filesystem path`)
	if (!isAbsolute(value))
		throw new Error(`${label} must be an absolute filesystem path`)
	return normalize(value)
}

/** @internal */
export function resolveFrom(base: string, value: string): string {
	return isAbsolute(value) ? normalize(value) : resolve(base, value)
}

/** @internal */
export function isEqualOrDescendant(parent: string, candidate: string): boolean {
	const rel = relative(parent, candidate)
	return rel === '' || (rel !== '..' && !rel.startsWith('../') && !isAbsolute(rel))
}

/** @internal */
export function assertStateDirSafe(projectRoot: string, stateDir: string): void {
	if (isEqualOrDescendant(stateDir, projectRoot)) {
		throw new Error(`Resolved stateDir "${stateDir}" must not equal or contain projectRoot "${projectRoot}"`)
	}
}

/** @internal */
export function stripLoaderSuffix(value: string): string {
	return value.split(/[?#]/, 1)[0]!
}

/** @internal */
export function isNodeModulesPath(value: string): boolean {
	return normalize(value)
		.split('/')
		.includes('node_modules')
}
