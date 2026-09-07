import process from 'node:process'
import { analyzeDocsPages, hasDocsAnalysisFailures, printDocsAnalysis } from './page-audit'

async function main() {
	const report = await analyzeDocsPages()
	printDocsAnalysis(report)

	if (report.tasks.length === 0) {
		console.error('Documentation structure check failed: no templates found in templates/pages/.')
		process.exitCode = 1
		return
	}

	if (hasDocsAnalysisFailures(report)) {
		console.error('Documentation structure check failed.')
		process.exitCode = 1
		return
	}

	console.log('Documentation structure OK.')
}

main()
	.catch((error) => {
		console.error(error)
		process.exit(1)
	})
