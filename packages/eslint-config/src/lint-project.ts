import type { ResolvedProjectEntry } from '@pikacss/config'
import type { LoadedPikaConfig, PikaScanMatcher } from '@pikacss/config/host'
import { createPikaScanMatcher } from '@pikacss/config/host'

/** One normalized project entry plus its canonical source-ownership matcher. */
export interface LintProjectEntry extends ResolvedProjectEntry {
	readonly index: number
	readonly matcher: PikaScanMatcher
}

/**
 * Private immutable project state captured by one configured ESLint plugin.
 *
 * This type is intentionally exported only from an internal module. The
 * package root transports the state through the configured rule closure rather
 * than through ESLint rule options or settings.
 */
export interface LintProjectModel {
	readonly projectRoot: string
	readonly stateDir: string
	readonly roots: readonly string[]
	readonly entries: readonly LintProjectEntry[]
}

/** The two outputs derived together from one canonical Config-host load. */
export interface DerivedLintProject {
	readonly model: LintProjectModel
	readonly globals: Readonly<Record<string, 'readonly'>>
}

/**
 * Derives the rule model and ambient readonly globals from one loaded project.
 * Every entry gets the exact matcher supplied by `@pikacss/config/host`.
 */
export function deriveLintProject(loaded: LoadedPikaConfig): DerivedLintProject {
	const entries = loaded.config.entries.map((entry, index) => Object.freeze({
		...entry,
		index,
		matcher: createPikaScanMatcher({
			scan: entry.scan,
			stateDir: loaded.config.stateDir,
		}),
	}))
	const frozenEntries = Object.freeze(entries)
	const roots = Object.freeze(frozenEntries.map(entry => entry.fnName))
	const model = Object.freeze({
		projectRoot: loaded.projectRoot,
		stateDir: loaded.config.stateDir,
		roots,
		entries: frozenEntries,
	})
	const globals = Object.freeze(Object.fromEntries(roots.map(root => [root, 'readonly' as const])))

	return Object.freeze({ model, globals })
}
