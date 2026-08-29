import type { CreatePikaScanMatcherOptions, PikaScanMatcher } from './host-types'
import { isAbsolute, normalize } from 'pathe'
import picomatch from 'picomatch'
import { isEqualOrDescendant } from './host-paths'

/**
 * Creates the canonical source-membership matcher for one normalized entry.
 *
 * @remarks Inputs are the absolute scan patterns emitted by the Config host.
 * The resolved state directory is excluded structurally before glob matching,
 * even when an include pattern would otherwise match it.
 *
 * @param options - Normalized scan configuration and resolved state directory.
 * @param options.scan - Normalized absolute include/exclude scan patterns.
 * @param options.stateDir - Resolved project state directory that is always excluded.
 */
export function createPikaScanMatcher({ scan, stateDir }: CreatePikaScanMatcherOptions): PikaScanMatcher {
	const includes = scan.include.map(pattern => picomatch(pattern, { dot: true }))
	const excludes = scan.exclude.map(pattern => picomatch(pattern, { dot: true }))
	const normalizedStateDir = normalize(stateDir)

	return Object.freeze({
		matches(filePath: string): boolean {
			if (!isAbsolute(filePath))
				throw new Error('Pika scan matcher requires an absolute physical source path')
			const normalizedPath = normalize(filePath)
			if (isEqualOrDescendant(normalizedStateDir, normalizedPath))
				return false
			return includes.some(matches => matches(normalizedPath))
				&& !excludes.some(matches => matches(normalizedPath))
		},
	})
}
