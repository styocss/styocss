import { existsSync, readdirSync, readFileSync } from 'node:fs'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const DEFAULT_ROOT_URL = new URL('../', import.meta.url)

/**
 * The release command publishes every non-private workspace under
 * `packages/*`. Keep this check aligned with that publish selector and the
 * repository's lockstep versioning policy.
 */
export function validateReleaseVersions({ tag, rootVersion, packages }) {
	const errors = []

	if (tag !== `v${rootVersion}`)
		errors.push(`Tag ${tag} does not match package.json version ${rootVersion}.`)

	const publishablePackages = packages.filter(pkg => pkg.private !== true)
	if (publishablePackages.length === 0)
		errors.push('No publishable workspace packages were found under packages/.')

	for (const pkg of publishablePackages) {
		if (pkg.version !== rootVersion)
			errors.push(`Publishable package ${pkg.name} has version ${pkg.version}; expected ${rootVersion}.`)
	}

	return errors
}

function readWorkspacePackages(rootUrl) {
	const packagesUrl = new URL('packages/', rootUrl)
	return readdirSync(packagesUrl, { withFileTypes: true })
		.filter(entry => entry.isDirectory())
		.map(entry => new URL('package.json', new URL(`${entry.name}/`, packagesUrl)))
		.filter(packageUrl => existsSync(packageUrl))
		.map((packageUrl) => {
			const packageJson = JSON.parse(readFileSync(packageUrl, 'utf8'))
			return {
				name: packageJson.name,
				private: packageJson.private === true,
				version: packageJson.version,
			}
		})
}

export function runReleaseValidation({ rootDir, tag }) {
	const rootUrl = rootDir == null ? DEFAULT_ROOT_URL : pathToFileURL(`${rootDir}/`)
	const rootPackage = JSON.parse(readFileSync(new URL('package.json', rootUrl), 'utf8'))
	return validateReleaseVersions({
		tag,
		rootVersion: rootPackage.version,
		packages: readWorkspacePackages(rootUrl),
	})
}

if (process.argv[1] != null && fileURLToPath(import.meta.url) === process.argv[1]) {
	const tag = process.argv[2] ?? process.env.GITHUB_REF_NAME
	if (tag == null) {
		console.error('Usage: node scripts/release-validation.mjs <tag>')
		process.exit(1)
	}

	const errors = runReleaseValidation({ tag })
	if (errors.length > 0) {
		for (const error of errors)
			console.error(`::error::${error}`)
		process.exit(1)
	}

	console.log(`Release tag ${tag} matches the root and all publishable workspace package versions.`)
}
