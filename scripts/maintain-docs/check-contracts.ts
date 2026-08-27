import { existsSync, readdirSync, readFileSync } from 'node:fs'
import process from 'node:process'
import { resolve } from 'pathe'
import ts from 'typescript'
import { PACKAGES, workspaceRoot } from '../_skill-shared'

interface PackageManifest {
	private?: boolean
	engines?: Record<string, string>
	exports?: Record<string, unknown>
	peerDependencies?: Record<string, string>
}

const UNPLUGIN_TYPES_PATH = 'packages/unplugin/src/types.ts'
const failures: string[] = []

function readWorkspaceFile(path: string): string {
	return readFileSync(resolve(workspaceRoot, path), 'utf8')
}

function readManifest(path: string): PackageManifest {
	return JSON.parse(readWorkspaceFile(path)) as PackageManifest
}

function expectContains(path: string, expected: string, reason: string) {
	const content = readWorkspaceFile(path)
	if (!content.includes(expected))
		failures.push(`${path}: ${reason} (missing ${JSON.stringify(expected)})`)
}

function findNode<T extends ts.Node>(root: ts.Node, predicate: (node: ts.Node) => node is T): T | undefined {
	let match: T | undefined

	function visit(node: ts.Node) {
		if (match != null)
			return
		if (predicate(node)) {
			match = node
			return
		}
		ts.forEachChild(node, visit)
	}

	visit(root)
	return match
}

// A published package that is not registered in PACKAGES is invisible to
// gen-api, maintain-docs, and every other tooling pass that iterates the
// registry, so it would ship without API reference or docs coverage.
const registeredDirs = new Set(PACKAGES.map(pkg => pkg.dir))

for (const entry of readdirSync(resolve(workspaceRoot, 'packages'), { withFileTypes: true })) {
	if (!entry.isDirectory())
		continue

	const manifestPath = `packages/${entry.name}/package.json`
	if (!existsSync(resolve(workspaceRoot, manifestPath)))
		continue

	const manifest = readManifest(manifestPath)
	if (manifest.private === true)
		continue

	if (!registeredDirs.has(entry.name))
		failures.push(`${manifestPath}: published package is missing from PACKAGES in scripts/_skill-shared/index.ts`)

	if (!existsSync(resolve(workspaceRoot, `packages/${entry.name}/README.md`)))
		failures.push(`packages/${entry.name}/README.md: published package must ship a README`)
}

const manifests = new Map(
	PACKAGES.map(pkg => [pkg.name, readManifest(`packages/${pkg.dir}/package.json`)]),
)
const PLATFORM_NEUTRAL_PACKAGES = new Set([
	'@pikacss/core',
	'@pikacss/plugin-design-tokens',
	'@pikacss/plugin-icons',
])
const nodeRanges = new Map<string, string>()

for (const pkg of PACKAGES) {
	const nodeRange = manifests.get(pkg.name)?.engines?.node
	if (PLATFORM_NEUTRAL_PACKAGES.has(pkg.name)) {
		if (nodeRange != null)
			failures.push(`packages/${pkg.dir}/package.json: platform-neutral package must not declare engines.node`)
		continue
	}
	if (nodeRange == null)
		failures.push(`packages/${pkg.dir}/package.json: engines.node is required for Node-targeted public package contract checks`)
	else
		nodeRanges.set(pkg.name, nodeRange)
}

const distinctNodeRanges = new Set(nodeRanges.values())
if (distinctNodeRanges.size > 1) {
	failures.push(`public package Node.js ranges differ: ${[...nodeRanges]
		.map(([name, range]) => `${name}=${range}`)
		.join(', ')}`)
}

const unpluginManifest = manifests.get('@pikacss/unplugin-pikacss')
const documentedNodeRange = unpluginManifest?.engines?.node
// The published consumer skill is installed into arbitrary agents via
// `npx skills add`, so a stale version claim there misleads users we never see.
// Nothing checked it until now.
const CONSUMER_SKILL_PATH = 'skills/pikacss-use/SKILL.md'

const vitePeerRange = unpluginManifest?.peerDependencies?.vite
if (vitePeerRange != null) {
	expectContains(
		CONSUMER_SKILL_PATH,
		vitePeerRange,
		'state the supported Vite range from the unplugin peerDependencies',
	)
}

if (documentedNodeRange != null) {
	for (const path of [
		'docs/getting-started/setup.md',
		'docs/zh-tw/getting-started/setup.md',
		'packages/unplugin/README.md',
		CONSUMER_SKILL_PATH,
	]) {
		expectContains(path, `\`${documentedNodeRange}\``, `document the supported Node.js range from the published packages`)
	}
}

const unpluginExports = Object.keys(unpluginManifest?.exports ?? {})
	.filter(subpath => subpath !== '.')

for (const subpath of unpluginExports) {
	const specifier = `@pikacss/unplugin-pikacss${subpath.slice(1)}`
	for (const path of ['packages/unplugin/README.md', CONSUMER_SKILL_PATH]) {
		expectContains(
			path,
			specifier,
			`list the exported bundler entry point ${specifier}`,
		)
	}
}

const unpluginTypesSource = readWorkspaceFile(UNPLUGIN_TYPES_PATH)
const unpluginTypesSourceFile = ts.createSourceFile(
	UNPLUGIN_TYPES_PATH,
	unpluginTypesSource,
	ts.ScriptTarget.Latest,
	true,
	ts.ScriptKind.TS,
)
const pluginOptionsInterface = findNode(
	unpluginTypesSourceFile,
	(node): node is ts.InterfaceDeclaration => ts.isInterfaceDeclaration(node)
		&& node.name.text === 'PluginOptions',
)
const pluginOptionNames = pluginOptionsInterface?.members.flatMap((member) => {
	if (!ts.isPropertySignature(member) || member.name == null)
		return []
	if (ts.isIdentifier(member.name) || ts.isStringLiteralLike(member.name))
		return [member.name.text]
	return []
}) ?? []
const expectedPluginOptionNames = ['config', 'cwd']
if (pluginOptionsInterface == null) {
	failures.push(`${UNPLUGIN_TYPES_PATH}: could not locate PluginOptions interface`)
}
else if (pluginOptionNames.length !== expectedPluginOptionNames.length
	|| expectedPluginOptionNames.some(name => !pluginOptionNames.includes(name))) {
	failures.push(`${UNPLUGIN_TYPES_PATH}: PluginOptions must be exactly { config?: string, cwd?: string } (found: ${pluginOptionNames.join(', ') || '(none)'})`)
}

expectContains(
	'packages/integration/README.md',
	'currentPackageName: \'@acme/pikacss-integration\'',
	'demonstrate that custom integrations must identify their own package',
)
if (failures.length > 0) {
	console.error('\nDocumentation contract checks failed:\n')
	for (const failure of failures)
		console.error(`  - ${failure}`)
	console.error('')
	process.exit(1)
}

console.log(`Documentation contracts OK (${nodeRanges.size} Node-targeted package engines, ${PLATFORM_NEUTRAL_PACKAGES.size} neutral packages, ${unpluginExports.length} bundler entry points, and ${pluginOptionNames.length} unplugin bootstrap options checked).`)
