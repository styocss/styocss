import { mkdir, writeFile } from 'node:fs/promises'
import process from 'node:process'
import { resolve } from 'pathe'
import { analyzeDocsPages, printDocsAnalysis } from './page-audit'
import { tasksOutputRoot, templatePathToTaskFileName } from './shared'

async function main() {
	const report = await analyzeDocsPages()
	printDocsAnalysis(report)

	if (report.tasks.length === 0) {
		console.log('No templates found in templates/pages/.')
		return
	}

	await mkdir(tasksOutputRoot, { recursive: true })
	for (const task of report.tasks) {
		const templateRelPath = task.templatePath.replace('.claude/skills/maintain-docs/templates/pages/', '')
		const taskPath = resolve(tasksOutputRoot, templatePathToTaskFileName(templateRelPath))
		await writeFile(taskPath, `${JSON.stringify(task, null, '\t')}\n`, 'utf8')
	}

	console.log('Task files written to: .maintain-docs/tasks/')
}

main()
	.catch((error) => {
		console.error(error)
		process.exit(1)
	})
