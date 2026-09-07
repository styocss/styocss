import type { TaskFile } from './shared'
import { execFileSync } from 'node:child_process'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { resolve } from 'pathe'
import { analyzeDocsPages } from './page-audit'
import { workspaceRoot } from './shared'

export interface DocsImpact {
	docsPath: string
	matchedSources: string[]
	touched: boolean
}

function lines(value: string): string[] {
	return value.split('\n')
		.map(line => line.trim())
		.filter(Boolean)
}

export function changedPathsFromNameStatus(value: string): string[] {
	const tokens = value.split('\0')
		.filter(Boolean)
	const paths: string[] = []
	for (let index = 0; index < tokens.length;) {
		const status = tokens[index++]!
		if (status.startsWith('R') || status.startsWith('C')) {
			const previousPath = tokens[index++]
			const nextPath = tokens[index++]
			if (previousPath != null)
				paths.push(previousPath)
			if (nextPath != null)
				paths.push(nextPath)
			continue
		}
		const path = tokens[index++]
		if (path != null)
			paths.push(path)
	}
	return paths
}

export function findDocsImpacts(tasks: readonly TaskFile[], changedPaths: ReadonlySet<string>): DocsImpact[] {
	return tasks.flatMap((task) => {
		const matchedSources = task.relatedSources.filter(source => changedPaths.has(source))
		if (matchedSources.length === 0)
			return []
		return [{
			docsPath: task.docsPath,
			matchedSources,
			touched: changedPaths.has(task.docsPath),
		}]
	})
}

function git(...args: string[]): string {
	return execFileSync('git', args, {
		cwd: workspaceRoot,
		encoding: 'utf8',
		maxBuffer: 64 * 1024 * 1024,
	})
}

function changedPathsAgainst(baseRef: string): Set<string> {
	let base: string
	try {
		base = git('merge-base', baseRef, 'HEAD')
			.trim()
	}
	catch {
		throw new Error(`Cannot resolve a merge base against ${baseRef}. Fetch the base ref first.`)
	}

	return new Set([
		...changedPathsFromNameStatus(git('diff', '--name-status', '-z', '--diff-filter=ACMRD', `${base}...HEAD`)),
		...changedPathsFromNameStatus(git('diff', '--name-status', '-z', '--diff-filter=ACMRD', 'HEAD')),
		...lines(git('ls-files', '--others', '--exclude-standard')),
	])
}

async function main() {
	const baseRef = process.env.BASE_REF ?? 'origin/main'
	const changedPaths = changedPathsAgainst(baseRef)
	const { tasks } = await analyzeDocsPages()
	const impacts = findDocsImpacts(tasks, changedPaths)
	const untouched = impacts.filter(impact => !impact.touched)

	if (process.argv.includes('--json')) {
		console.log(JSON.stringify({
			baseRef,
			changedPaths: [...changedPaths].sort(),
			impacts,
			untouched,
		}, null, '\t'))
		return
	}

	console.log('\n=== Documentation Impact ===\n')
	console.log(`Changed paths:              ${changedPaths.size}`)
	console.log(`Related docs pages:         ${impacts.length}`)
	console.log(`Impacted but untouched:     ${untouched.length}`)
	console.log('')

	if (impacts.length === 0) {
		console.log('No documentation pages declare a changed path in relatedSources.')
		return
	}

	console.log('Related pages:')
	for (const impact of impacts) {
		console.log(`  - ${impact.docsPath}${impact.touched ? ' (touched)' : ' (UNTOUCHED)'}`)
		for (const source of impact.matchedSources)
			console.log(`      ← ${source}`)
	}

	if (untouched.length > 0) {
		console.log('')
		console.log('Review the impacted-but-untouched pages against the changed source before handoff.')
	}
}

if (process.argv[1] != null && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
	main()
		.catch((error) => {
			console.error(error)
			process.exit(1)
		})
}
