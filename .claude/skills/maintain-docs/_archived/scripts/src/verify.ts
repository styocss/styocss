import process from 'node:process'
import {
	buildSourceMap,
	currentTimestamp,
	isDirectExecution,
	listDocsPages,
	stateRoot,
	toWorkspacePath,
	writeReport,
} from './shared.js'
import { markPagesVerified } from './analyze.js'

interface VerifyReport {
	schema: 'pikacss-docs-verify-report'
	schemaVersion: 1
	generatedAt: string
	verifiedPages: string[]
	skippedPages: string[]
}

function parseScopedValues(args: string[], flag: '--packages' | '--files' | '--pages'): string[] {
	const index = args.indexOf(flag)
	if (index === -1)
		return []

	const nextFlagIndex = args.findIndex((arg, position) => position > index && arg.startsWith('--'))
	const end = nextFlagIndex === -1 ? args.length : nextFlagIndex
	return args.slice(index + 1, end)
}

async function main() {
	const args = process.argv.slice(2)
	const isValidated = args.includes('--validated')
	const verifyAll = args.includes('--all') || args.length === 0
	const packageFilters = parseScopedValues(args, '--packages')
	const fileFilters = parseScopedValues(args, '--files')
	const explicitPages = parseScopedValues(args, '--pages')

	if (!isValidated) {
		console.error('Refusing to clear verification state without explicit confirmation. Run verify only after successful docs validation and pass --validated.')
		process.exit(1)
	}

	const associations = await buildSourceMap()
	const docsPages = (await listDocsPages()).map(toWorkspacePath)

	let targetPages = docsPages

	if (!verifyAll || packageFilters.length > 0 || fileFilters.length > 0 || explicitPages.length > 0) {
		targetPages = docsPages.filter((pagePath) => {
			if (explicitPages.length > 0)
				return explicitPages.includes(pagePath)

			const association = associations.find(entry => entry.pagePath === pagePath)
			if (!association)
				return false

			if (packageFilters.length > 0) {
				const packageMatch = association.relatedPackages.some(pkg => packageFilters.includes(pkg))
				if (!packageMatch)
					return false
			}

			if (fileFilters.length > 0) {
				const fileMatch = fileFilters.some(filter => pagePath.includes(filter))
				if (!fileMatch)
					return false
			}

			return true
		})
	}

	if (targetPages.length === 0) {
		console.error('No docs pages matched the requested verify scope.')
		process.exit(1)
	}

	await markPagesVerified(targetPages)

	const report: VerifyReport = {
		schema: 'pikacss-docs-verify-report',
		schemaVersion: 1,
		generatedAt: currentTimestamp(),
		verifiedPages: targetPages,
		skippedPages: docsPages.filter(pagePath => !targetPages.includes(pagePath)),
	}

	const reportPath = `${stateRoot}/verify-report.json`
	await writeReport(reportPath, report)

	console.log(`Verified ${targetPages.length} page(s).`)
	console.log(`Report written to: ${toWorkspacePath(reportPath)}`)
}

if (isDirectExecution(import.meta.url)) {
	main().catch((error) => {
		console.error(error)
		process.exit(1)
	})
}

export { main as verifyPages }