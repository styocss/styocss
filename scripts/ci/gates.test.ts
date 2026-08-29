import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { globbySync } from 'globby'
import { dirname, join } from 'pathe'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import { workspaceRoot } from '../_skill-shared'
import { hasInternalJsDocTag, isPrivateOrProtectedDeclaration, selectFunctionApiDeclarations } from '../maintain-docs/api-helpers'
import { relatedSourceIssues } from '../maintain-docs/shared'
import { diffAgainst, numstatAgainst } from '../maintain-i18n/shared'
import {
	exampleHarnessViolations,
	findForbiddenPaths,
	hasWaiverLabel,
	isCommentOnlyDiff,
	LOCAL_ICON_CONFIG_GLOBS,
	localIconAdapterViolation,
	packageOfSourcePath,
	packagesMissingTestChanges,
} from './gates'

describe('findForbiddenPaths', () => {
	it('flags ephemeral pika.gen outputs that must never be committed', () => {
		const findings = findForbiddenPaths(['playground/src/pika.gen.ts', 'demo/src/pika.gen.css'])
		expect(findings.map(f => f.path))
			.toEqual(['playground/src/pika.gen.ts', 'demo/src/pika.gen.css'])
	})

	it('allows tracked generated outputs whose drift the codegen-drift CI step verifies', () => {
		// docs/api pages and core generated data legitimately change whenever
		// their sources change; hand edits are caught by re-running the
		// generators in CI, not by banning the paths.
		expect(findForbiddenPaths([
			'docs/api/core.md',
			'docs/api/index.md',
			'packages/core/src/generated/csstype.ts',
		]))
			.toEqual([])
	})

	it('leaves the example harness to the invariant gate and ordinary files alone', () => {
		expect(findForbiddenPaths([
			'docs/.examples/_utils/pika-example.ts',
			'packages/core/src/engine.ts',
			'docs/getting-started/setup.md',
		]))
			.toEqual([])
	})
})

describe('exampleHarnessViolations', () => {
	const conforming = [
		'import { createInlineIntegrationTestContext } from \'@pikacss/integration/testing\'',
		'const ctx = createInlineIntegrationTestContext({})',
		'await ctx.transform(code, id)',
	].join('\n')

	it('accepts a harness that drives examples through the repository-private Integration pipeline', () => {
		expect(exampleHarnessViolations(conforming))
			.toEqual([])
	})

	it('rejects dropping the private harness import or the transform call', () => {
		expect(exampleHarnessViolations('const x = 1'))
			.toHaveLength(2)
	})

	it('rejects the removed public createCtx compatibility import', () => {
		const legacy = [
			'import { createCtx } from \'@pikacss/integration\'',
			'const ctx = createCtx({})',
			'await ctx.transform(code, id)',
		].join('\n')
		expect(exampleHarnessViolations(legacy))
			.toContain('must use the repository-private Integration inline-config test harness')
	})

	it('rejects replacing the pipeline with direct engine execution', () => {
		const bypassing = `${conforming}\nconst engine = await createEngine({})\nawait engine.use({})`
		const violations = exampleHarnessViolations(bypassing)
		expect(violations.some(v => v.includes('createEngine')))
			.toBe(true)
		expect(violations.some(v => v.includes('engine.use')))
			.toBe(true)
	})
})

describe('localIconAdapterViolation', () => {
	it('flags an active neutral icons plugin when the workspace directly installs an Iconify collection', () => {
		const violation = localIconAdapterViolation(
			JSON.stringify({ devDependencies: { '@iconify-json/mdi': '^1.2.3' } }),
			'import { icons } from \'@pikacss/plugin-icons\'\nexport default { engine: { plugins: [icons()] } }',
		)
		expect(violation)
			.toContain('@pikacss/plugin-icons/node')
	})

	it('flags an active neutral namespace import when local icon capabilities are requested', () => {
		const manifest = JSON.stringify({ devDependencies: { '@iconify-json/mdi': '^1.2.3' } })
		const config = `
import * as iconsPackage from '@pikacss/plugin-icons'
const iconFactory = iconsPackage.icons
export default { engine: { plugins: [iconFactory()] } }
`
		expect(localIconAdapterViolation(manifest, config))
			.toContain('@pikacss/plugin-icons/node')
	})

	it('inspects every entry in a legal multi-entry defineConfig array', () => {
		const manifest = JSON.stringify({ devDependencies: { '@iconify-json/mdi': '^1.2.3' } })
		const config = `
import { icons } from '@pikacss/plugin-icons'
export default defineConfig([
  { fnName: 'plain', cssModule: 'plain.css' },
  { fnName: 'icons', cssModule: 'icons.css', engine: { plugins: [icons()] } },
])
`
		expect(localIconAdapterViolation(manifest, config))
			.toContain('@pikacss/plugin-icons/node')
	})

	it('tracks destructured, member-object, and function-declaration factory indirection', () => {
		const manifest = JSON.stringify({ devDependencies: { '@iconify-json/mdi': '^1.2.3' } })
		const config = `
import * as iconsPackage from '@pikacss/plugin-icons'
const { icons: destructuredFactory } = iconsPackage
const member = { icons: iconsPackage.icons }
const memberFactory = member.icons
function wrappedFactory() { return destructuredFactory() }
export default { engine: { plugins: [memberFactory(), wrappedFactory()] } }
`
		expect(localIconAdapterViolation(manifest, config))
			.toContain('@pikacss/plugin-icons/node')
	})

	it('respects a function parameter or local binding that shadows the neutral import', () => {
		const manifest = JSON.stringify({ devDependencies: { '@iconify-json/mdi': '^1.2.3' } })
		const parameter = `
import { icons } from '@pikacss/plugin-icons'
const customFactory = () => ({ name: 'custom' })
function makePlugin(icons: () => any) { return icons() }
export default { engine: { plugins: [makePlugin(customFactory)] } }
`
		const local = `
import { icons } from '@pikacss/plugin-icons'
const customFactory = () => ({ name: 'custom' })
function makePlugin() { const icons = customFactory; return icons() }
export default { engine: { plugins: [makePlugin()] } }
`
		expect(localIconAdapterViolation(manifest, parameter))
			.toBeUndefined()
		expect(localIconAdapterViolation(manifest, local))
			.toBeUndefined()
	})

	it('resolves local aliases and statically invoked wrappers with lexical bindings', () => {
		const manifest = JSON.stringify({ devDependencies: { '@iconify-json/mdi': '^1.2.3' } })
		const localAlias = `
import { icons } from '@pikacss/plugin-icons'
function wrapped() {
  const factory = icons
  return factory()
}
export default { engine: { plugins: [wrapped()] } }
`
		const parameterWrapper = `
import { icons } from '@pikacss/plugin-icons'
function wrapped(factory: () => any) { return factory() }
export default { engine: { plugins: [wrapped(icons)] } }
`
		const customParameter = `
import { icons } from '@pikacss/plugin-icons'
const customFactory = () => ({ name: 'custom' })
function wrapped(factory: () => any) { return factory() }
export default { engine: { plugins: [wrapped(customFactory)] } }
`
		expect(localIconAdapterViolation(manifest, localAlias))
			.toContain('@pikacss/plugin-icons/node')
		expect(localIconAdapterViolation(manifest, parameterWrapper))
			.toContain('@pikacss/plugin-icons/node')
		expect(localIconAdapterViolation(manifest, customParameter))
			.toBeUndefined()
	})

	it('keeps block bindings local and only follows executed closures', () => {
		const manifest = JSON.stringify({ devDependencies: { '@iconify-json/mdi': '^1.2.3' } })
		const blockShadow = `
import { icons } from '@pikacss/plugin-icons'
const custom = () => ({ name: 'custom' })
const factory = () => {
  { const icons = custom; icons() }
  return custom()
}
export default { engine: { plugins: [factory()] } }
`
		const outsideBlock = `
import { icons } from '@pikacss/plugin-icons'
const custom = () => ({ name: 'custom' })
const factory = () => {
  if (true) { const icons = custom }
  return icons()
}
export default { engine: { plugins: [factory()] } }
`
		const closure = `
import { icons } from '@pikacss/plugin-icons'
const factory = () => {
  const invoke = () => icons()
  return invoke()
}
export default { engine: { plugins: [factory()] } }
`
		const unusedNestedFunction = `
import { icons } from '@pikacss/plugin-icons'
const custom = () => ({ name: 'custom' })
const factory = () => {
  function unused() { return icons() }
  return custom()
}
export default { engine: { plugins: [factory()] } }
`
		expect(localIconAdapterViolation(manifest, blockShadow))
			.toBeUndefined()
		expect(localIconAdapterViolation(manifest, outsideBlock))
			.toContain('@pikacss/plugin-icons/node')
		expect(localIconAdapterViolation(manifest, closure))
			.toContain('@pikacss/plugin-icons/node')
		expect(localIconAdapterViolation(manifest, unusedNestedFunction))
			.toBeUndefined()
	})

	it('hoists var bindings to the containing function without leaking lexical bindings', () => {
		const manifest = JSON.stringify({ devDependencies: { '@iconify-json/mdi': '^1.2.3' } })
		const customBlockVar = `
import { icons } from '@pikacss/plugin-icons'
const custom = () => ({ name: 'custom' })
function wrapped() {
  { var icons = custom }
  return icons()
}
export default { engine: { plugins: [wrapped()] } }
`
		const customIfVar = `
import { icons } from '@pikacss/plugin-icons'
const custom = () => ({ name: 'custom' })
function wrapped() {
  if (true) { var icons = custom }
  return icons()
}
export default { engine: { plugins: [wrapped()] } }
`
		const neutralBlockVar = `
import { icons } from '@pikacss/plugin-icons'
function wrapped() {
  { var factory = icons }
  return factory()
}
export default { engine: { plugins: [wrapped()] } }
`
		const neutralIfVar = `
import { icons } from '@pikacss/plugin-icons'
function wrapped() {
  if (true) { var factory = icons }
  return factory()
}
export default { engine: { plugins: [wrapped()] } }
`
		expect(localIconAdapterViolation(manifest, customBlockVar))
			.toBeUndefined()
		expect(localIconAdapterViolation(manifest, customIfVar))
			.toBeUndefined()
		expect(localIconAdapterViolation(manifest, neutralBlockVar))
			.toContain('@pikacss/plugin-icons/node')
		expect(localIconAdapterViolation(manifest, neutralIfVar))
			.toContain('@pikacss/plugin-icons/node')
	})

	it('preserves the caller environment when binding direct and destructured arguments', () => {
		const manifest = JSON.stringify({ devDependencies: { '@iconify-json/mdi': '^1.2.3' } })
		const neutralAlias = `
import { icons } from '@pikacss/plugin-icons'
function invoke(factory: () => any) { return factory() }
function outer() {
  const local = icons
  return invoke(local)
}
export default { engine: { plugins: [outer()] } }
`
		const neutralNamespaceAlias = `
import * as neutral from '@pikacss/plugin-icons'
function invoke(factory: () => any) { return factory() }
function outer() {
  const local = neutral.icons
  return invoke(local)
}
export default { engine: { plugins: [outer()] } }
`
		const neutralDestructured = `
import { icons } from '@pikacss/plugin-icons'
function invoke({ factory }: { factory: () => any }) { return factory() }
function outer() {
  const local = icons
  return invoke({ factory: local })
}
export default { engine: { plugins: [outer()] } }
`
		const customAlias = `
import { icons } from '@pikacss/plugin-icons'
const custom = () => ({ name: 'custom' })
function invoke(factory: () => any) { return factory() }
function outer() {
  const local = custom
  return invoke(local)
}
export default { engine: { plugins: [outer()] } }
`
		expect(localIconAdapterViolation(manifest, neutralAlias))
			.toContain('@pikacss/plugin-icons/node')
		expect(localIconAdapterViolation(manifest, neutralNamespaceAlias))
			.toContain('@pikacss/plugin-icons/node')
		expect(localIconAdapterViolation(manifest, neutralDestructured))
			.toContain('@pikacss/plugin-icons/node')
		expect(localIconAdapterViolation(manifest, customAlias))
			.toBeUndefined()
	})

	it('does not scan statically dead statements after bounded termination or branch selection', () => {
		const manifest = JSON.stringify({ devDependencies: { '@iconify-json/mdi': '^1.2.3' } })
		const custom = `const custom = () => ({ name: 'custom' })`
		const deadCases = [
			`${custom}
function wrapped() { if (false) return icons(); return custom() }`,
			`${custom}
function wrapped() { if (true) return custom(); else return icons() }`,
			`${custom}
function wrapped() { const enabled = false; if (enabled) icons(); return custom() }`,
			`${custom}
function wrapped() { while (false) { icons() }; return custom() }`,
			`${custom}
function wrapped() { return custom(); icons() }`,
			`${custom}
function wrapped() { throw new Error('x'); icons() }`,
		].map(body => `
import { icons } from '@pikacss/plugin-icons'
${body}
export default { engine: { plugins: [wrapped()] } }
`)
		for (const config of deadCases) {
			expect(localIconAdapterViolation(manifest, config), config)
				.toBeUndefined()
		}

		const liveCases = [
			'if (true) return icons(); return custom()',
			'if (false) return custom(); else return icons()',
			'const enabled = true; if (enabled) icons(); return custom()',
			'while (true) { icons() }',
		].map(body => `
import { icons } from '@pikacss/plugin-icons'
const custom = () => ({ name: 'custom' })
function wrapped() { ${body} }
export default { engine: { plugins: [wrapped()] } }
`)
		for (const config of liveCases) {
			expect(localIconAdapterViolation(manifest, config), config)
				.toContain('@pikacss/plugin-icons/node')
		}
	})

	it('narrows statically selected callable logical and conditional branches', () => {
		const manifest = JSON.stringify({ devDependencies: { '@iconify-json/mdi': '^1.2.3' } })
		const deadBranches = `
import { icons } from '@pikacss/plugin-icons'
const custom = () => ({ name: 'custom' })
const customWrapper = () => custom()
const neutralWrapper = () => icons()
const wrapped = true ? customWrapper : neutralWrapper
function invoke() {
  true || icons()
  false && icons()
  return wrapped()
}
export default { engine: { plugins: [invoke()] } }
`
		const liveBranches = `
import { icons } from '@pikacss/plugin-icons'
const custom = () => ({ name: 'custom' })
const customWrapper = () => custom()
const neutralWrapper = () => icons()
const wrapped = false ? customWrapper : neutralWrapper
function invoke() {
  false || icons()
  true && icons()
  return wrapped()
}
export default { engine: { plugins: [invoke()] } }
`
		expect(localIconAdapterViolation(manifest, deadBranches))
			.toBeUndefined()
		expect(localIconAdapterViolation(manifest, liveBranches))
			.toContain('@pikacss/plugin-icons/node')
	})

	it('resolves statically-returned factory values without executing dynamic calls', () => {
		const manifest = JSON.stringify({ devDependencies: { '@iconify-json/mdi': '^1.2.3' } })
		const immediatelyReturned = `
import { icons } from '@pikacss/plugin-icons'
const factory = (() => icons)()
export default { engine: { plugins: [factory()] } }
`
		const functionReturned = `
import { icons } from '@pikacss/plugin-icons'
function makeFactory() { return icons }
export default { engine: { plugins: [makeFactory()()] } }
`
		const customReturned = `
import { icons } from '@pikacss/plugin-icons'
const custom = () => ({ name: 'custom' })
function makeFactory() { return custom }
export default { engine: { plugins: [makeFactory()()] } }
`
		const recursive = `
import { icons } from '@pikacss/plugin-icons'
function makeFactory() { return makeFactory() }
export default { engine: { plugins: [makeFactory()()] } }
`
		expect(localIconAdapterViolation(manifest, immediatelyReturned))
			.toContain('@pikacss/plugin-icons/node')
		expect(localIconAdapterViolation(manifest, functionReturned))
			.toContain('@pikacss/plugin-icons/node')
		expect(localIconAdapterViolation(manifest, customReturned))
			.toBeUndefined()
		expect(localIconAdapterViolation(manifest, recursive))
			.toBeUndefined()
	})

	it('resolves positional array destructuring while leaving holes and object patterns bounded', () => {
		const manifest = JSON.stringify({ devDependencies: { '@iconify-json/mdi': '^1.2.3' } })
		const direct = `
import { icons } from '@pikacss/plugin-icons'
const [factory] = [icons]
export default { engine: { plugins: [factory()] } }
`
		const hole = `
import { icons } from '@pikacss/plugin-icons'
const [, factory] = [undefined, icons]
export default { engine: { plugins: [factory()] } }
`
		const nested = `
import { icons } from '@pikacss/plugin-icons'
const [, [factory]] = [undefined, [icons]]
export default { engine: { plugins: [factory()] } }
`
		const customObject = `
import { icons } from '@pikacss/plugin-icons'
const custom = () => ({ name: 'custom' })
const { factory } = { factory: custom }
export default { engine: { plugins: [factory()] } }
`
		expect(localIconAdapterViolation(manifest, direct))
			.toContain('@pikacss/plugin-icons/node')
		expect(localIconAdapterViolation(manifest, hole))
			.toContain('@pikacss/plugin-icons/node')
		expect(localIconAdapterViolation(manifest, nested))
			.toContain('@pikacss/plugin-icons/node')
		expect(localIconAdapterViolation(manifest, customObject))
			.toBeUndefined()
	})

	it('does not classify a shadowed require as the Node module loader', () => {
		const manifest = JSON.stringify({ devDependencies: { '@iconify-json/mdi': '^1.2.3' } })
		const parameter = `
import { icons } from '@pikacss/plugin-icons'
const custom = () => ({ name: 'custom' })
function make(require: (id: string) => any) {
  const pkg = require('@pikacss/plugin-icons')
  return pkg.icons()
}
export default { engine: { plugins: [make(() => ({ icons: custom }))] } }
`
		const local = `
import { icons } from '@pikacss/plugin-icons'
const custom = () => ({ name: 'custom' })
const require = (_id: string) => ({ icons: custom })
const pkg = require('@pikacss/plugin-icons')
export default { engine: { plugins: [pkg.icons()] } }
`
		const functionShadow = `
import { icons } from '@pikacss/plugin-icons'
const custom = () => ({ name: 'custom' })
function require(_id: string) { return { icons: custom } }
const pkg = require('@pikacss/plugin-icons')
export default { engine: { plugins: [pkg.icons()] } }
`
		const realRequire = `
const pkg = require('@pikacss/plugin-icons')
export default { engine: { plugins: [pkg.icons()] } }
`
		expect(localIconAdapterViolation(manifest, parameter))
			.toBeUndefined()
		expect(localIconAdapterViolation(manifest, local))
			.toBeUndefined()
		expect(localIconAdapterViolation(manifest, functionShadow))
			.toBeUndefined()
		expect(localIconAdapterViolation(manifest, realRequire))
			.toContain('@pikacss/plugin-icons/node')
	})

	it('follows conditional and logical config-object aliases across entries', () => {
		const manifest = JSON.stringify({ devDependencies: { '@iconify-json/mdi': '^1.2.3' } })
		const conditionalTrue = `
import { icons } from '@pikacss/plugin-icons'
const useNeutral = true
const engine = useNeutral ? { plugins: [icons()] } : { plugins: [] }
export default { engine }
`
		const conditionalFalse = conditionalTrue.replace('const useNeutral = true', 'const useNeutral = false')
		const conditionalUnknown = `
import { icons } from '@pikacss/plugin-icons'
declare const useNeutral: boolean
const engine = useNeutral ? { plugins: [icons()] } : { plugins: [] }
export default { engine }
`
		const logicalAliases = `
import { icons } from '@pikacss/plugin-icons'
const engine = false || { plugins: [icons()] }
const otherEngine = true && { plugins: [icons()] }
const nullishEngine = null ?? { plugins: [icons()] }
export default defineConfig([
  { engine },
  { engine: otherEngine },
  { engine: nullishEngine },
])
`
		const multiEntry = `
import { icons } from '@pikacss/plugin-icons'
const useNeutral = true
export default defineConfig([
  { engine: { plugins: [] } },
  { engine: useNeutral ? { plugins: [icons()] } : { plugins: [] } },
])
`
		expect(localIconAdapterViolation(manifest, conditionalTrue))
			.toContain('@pikacss/plugin-icons/node')
		expect(localIconAdapterViolation(manifest, conditionalFalse))
			.toBeUndefined()
		expect(localIconAdapterViolation(manifest, conditionalUnknown))
			.toContain('@pikacss/plugin-icons/node')
		expect(localIconAdapterViolation(manifest, logicalAliases))
			.toContain('@pikacss/plugin-icons/node')
		expect(localIconAdapterViolation(manifest, multiEntry))
			.toContain('@pikacss/plugin-icons/node')
	})

	it('selects static switch cases and bounded loop paths', () => {
		const manifest = JSON.stringify({ devDependencies: { '@iconify-json/mdi': '^1.2.3' } })
		const deadFor = `
import { icons } from '@pikacss/plugin-icons'
const custom = () => ({ name: 'custom' })
function wrapped() { for (; false;) { icons() }; return custom() }
export default { engine: { plugins: [wrapped()] } }
`
		const liveFor = `
import { icons } from '@pikacss/plugin-icons'
function wrapped() { for (; true;) { icons(); break } }
export default { engine: { plugins: [wrapped()] } }
`
		const unmatched = `
import { icons } from '@pikacss/plugin-icons'
const mode = 'custom'
const custom = () => ({ name: 'custom' })
function wrapped() {
  switch (mode) {
    case 'neutral': return icons()
    default: return custom()
  }
}
export default { engine: { plugins: [wrapped()] } }
`
		const matched = unmatched.replace('const mode = \'custom\'', 'const mode = \'neutral\'')
		const fallthrough = `
import { icons } from '@pikacss/plugin-icons'
const mode = 'neutral'
function wrapped() {
  switch (mode) {
    case 'neutral':
    case 'shared': icons(); break
    default: break
  }
}
export default { engine: { plugins: [wrapped()] } }
`
		const unknown = `
import { icons } from '@pikacss/plugin-icons'
declare const mode: string
function wrapped() {
  switch (mode) {
    case 'neutral': return icons()
    default: return undefined
  }
}
export default { engine: { plugins: [wrapped()] } }
`
		expect(localIconAdapterViolation(manifest, deadFor))
			.toBeUndefined()
		expect(localIconAdapterViolation(manifest, liveFor))
			.toContain('@pikacss/plugin-icons/node')
		expect(localIconAdapterViolation(manifest, unmatched))
			.toBeUndefined()
		expect(localIconAdapterViolation(manifest, matched))
			.toContain('@pikacss/plugin-icons/node')
		expect(localIconAdapterViolation(manifest, fallthrough))
			.toContain('@pikacss/plugin-icons/node')
		expect(localIconAdapterViolation(manifest, unknown))
			.toContain('@pikacss/plugin-icons/node')
	})

	it('explores later loop iterations and dynamic loop forms conservatively', () => {
		const manifest = JSON.stringify({ devDependencies: { '@iconify-json/mdi': '^1.2.3' } })
		const laterFor = `
import { icons } from '@pikacss/plugin-icons'
const custom = () => ({ name: 'custom' })
function wrapped() {
  for (let index = 0; index < 2; index++) {
    if (index) return icons()
  }
  return custom()
}
export default { engine: { plugins: [wrapped()] } }
`
		const dynamicLoops = [
			`do { icons() } while (false)`,
			`for (const value of values) { icons() }`,
			`for (const key in values) { icons() }`,
		].map(loop => `
import { icons } from '@pikacss/plugin-icons'
declare const values: Record<string, unknown>
function wrapped() { ${loop}; return undefined }
export default { engine: { plugins: [wrapped()] } }
`)

		expect(localIconAdapterViolation(manifest, laterFor))
			.toContain('@pikacss/plugin-icons/node')
		for (const config of dynamicLoops) {
			expect(localIconAdapterViolation(manifest, config), config)
				.toContain('@pikacss/plugin-icons/node')
		}
	})

	it('does not inspect unreachable loop incrementors, conditions, or bodies', () => {
		const manifest = JSON.stringify({ devDependencies: { '@iconify-json/mdi': '^1.2.3' } })
		const deadIncrementor = `
import { icons } from '@pikacss/plugin-icons'
function wrapped() {
  for (; true; icons()) return undefined
}
export default { engine: { plugins: [wrapped()] } }
`
		const deadDoConditions = `
import { icons } from '@pikacss/plugin-icons'
function wrapped() {
  do { return undefined } while (icons())
}
export default { engine: { plugins: [wrapped()] } }
`
		const deadDoBreakCondition = `
import { icons } from '@pikacss/plugin-icons'
function wrapped() {
  do { break } while (icons())
  return undefined
}
export default { engine: { plugins: [wrapped()] } }
`
		const oneIteration = `
import { icons } from '@pikacss/plugin-icons'
const custom = () => ({ name: 'custom' })
function wrapped() {
  for (let index = 0; index < 1; index++) {
    if (index) return icons()
  }
  return custom()
}
export default { engine: { plugins: [wrapped()] } }
`
		for (const config of [deadIncrementor, deadDoConditions, deadDoBreakCondition, oneIteration]) {
			expect(localIconAdapterViolation(manifest, config), config)
				.toBeUndefined()
		}
	})

	it('models continue as reaching the loop continuation but not later statements', () => {
		const manifest = JSON.stringify({ devDependencies: { '@iconify-json/mdi': '^1.2.3' } })
		const skippedAfterContinue = `
import { icons } from '@pikacss/plugin-icons'
function wrapped() {
  for (let index = 0; index < 1; index++) {
    continue
    icons()
  }
  return undefined
}
export default { engine: { plugins: [wrapped()] } }
`
		const reachableIncrementor = `
import { icons } from '@pikacss/plugin-icons'
function wrapped() {
  for (let index = 0; index < 1; index++, icons()) {
    continue
  }
  return undefined
}
export default { engine: { plugins: [wrapped()] } }
`
		const reachableDoCondition = `
import { icons } from '@pikacss/plugin-icons'
function wrapped() {
  do { continue } while (icons())
  return undefined
}
export default { engine: { plugins: [wrapped()] } }
`
		const returnSkipsDoCondition = `
import { icons } from '@pikacss/plugin-icons'
function wrapped() {
  do { return undefined } while (icons())
}
export default { engine: { plugins: [wrapped()] } }
`
		expect(localIconAdapterViolation(manifest, skippedAfterContinue))
			.toBeUndefined()
		expect(localIconAdapterViolation(manifest, reachableIncrementor))
			.toContain('@pikacss/plugin-icons/node')
		expect(localIconAdapterViolation(manifest, reachableDoCondition))
			.toContain('@pikacss/plugin-icons/node')
		expect(localIconAdapterViolation(manifest, returnSkipsDoCondition))
			.toBeUndefined()
	})

	it('treats definitely empty literal and aliased for-of/in sources as zero-iteration', () => {
		const manifest = JSON.stringify({ devDependencies: { '@iconify-json/mdi': '^1.2.3' } })
		const empty = `
import { icons } from '@pikacss/plugin-icons'
const emptyValues = []
const emptyObject = {}
function wrapped() {
  for (const value of []) { icons() }
  for (const value of emptyValues) { icons() }
  for (const key in {}) { icons() }
  for (const key in emptyObject) { icons() }
  return undefined
}
export default { engine: { plugins: [wrapped()] } }
`
		const nonEmpty = `
import { icons } from '@pikacss/plugin-icons'
function wrapped() {
  for (const value of [1]) { icons() }
  for (const key in { key: 1 }) { icons() }
  return undefined
}
export default { engine: { plugins: [wrapped()] } }
`
		expect(localIconAdapterViolation(manifest, empty))
			.toBeUndefined()
		expect(localIconAdapterViolation(manifest, nonEmpty))
			.toContain('@pikacss/plugin-icons/node')
	})

	it('explores every reachable clause for an unknown switch discriminant', () => {
		const manifest = JSON.stringify({ devDependencies: { '@iconify-json/mdi': '^1.2.3' } })
		const config = `
import { icons } from '@pikacss/plugin-icons'
declare const mode: string
const custom = () => ({ name: 'custom' })
function wrapped() {
  switch (mode) {
    case 'custom': return custom()
    case 'neutral': return icons()
    default: return custom()
  }
}
export default { engine: { plugins: [wrapped()] } }
`
		expect(localIconAdapterViolation(manifest, config))
			.toContain('@pikacss/plugin-icons/node')
	})

	it('evaluates static switch case expressions only until the selected case', () => {
		const manifest = JSON.stringify({ devDependencies: { '@iconify-json/mdi': '^1.2.3' } })
		const afterMatch = `
import { icons } from '@pikacss/plugin-icons'
const custom = () => ({ name: 'custom' })
function wrapped() {
  switch ('a') {
    case 'a': return custom()
    case String(icons()): return custom()
    default: return custom()
  }
}
export default { engine: { plugins: [wrapped()] } }
`
		const beforeMatch = `
import { icons } from '@pikacss/plugin-icons'
const custom = () => ({ name: 'custom' })
function wrapped() {
  switch ('b') {
    case String(icons()): return custom()
    case 'b': return custom()
    default: return custom()
  }
}
export default { engine: { plugins: [wrapped()] } }
`
		expect(localIconAdapterViolation(manifest, afterMatch))
			.toBeUndefined()
		expect(localIconAdapterViolation(manifest, beforeMatch))
			.toContain('@pikacss/plugin-icons/node')
	})

	it('flags neutral callable aliases in conditional and logical branches', () => {
		const manifest = JSON.stringify({ devDependencies: { '@iconify-json/mdi': '^1.2.3' } })
		for (const alias of [
			'useNeutral ? icons : (() => ({ name: \'custom\' }))',
			'a || icons',
			'a && icons',
			'a ?? icons',
		]) {
			const config = `
import { icons } from '@pikacss/plugin-icons'
declare const useNeutral: boolean
declare const a: (() => any) | undefined
const factory = ${alias}
export default { engine: { plugins: [factory()] } }
`
			expect(localIconAdapterViolation(manifest, config), alias)
				.toContain('@pikacss/plugin-icons/node')
		}
	})

	it('does not flag statically custom-only callable branches', () => {
		const manifest = JSON.stringify({ devDependencies: { '@iconify-json/mdi': '^1.2.3' } })
		const config = `
import { icons } from '@pikacss/plugin-icons'
const factory = false ? icons : (() => ({ name: 'custom' }))
const fallback = (() => ({ name: 'custom' })) || icons
export default { engine: { plugins: [factory(), fallback()] } }
`
		expect(localIconAdapterViolation(manifest, config))
			.toBeUndefined()
	})

	it('supports the CommonJS exports supported by the config host', () => {
		const manifest = JSON.stringify({ devDependencies: { '@iconify-json/mdi': '^1.2.3' } })
		const moduleExports = `
const { icons } = require('@pikacss/plugin-icons')
module.exports = defineConfig({ engine: { plugins: [icons()] } })
`
		const defaultExport = `
const iconsPackage = require('@pikacss/plugin-icons')
exports.default = defineConfig({ engine: { plugins: [iconsPackage.icons()] } })
`
		const moduleDefaultExport = `
const iconsPackage = require('@pikacss/plugin-icons')
module.exports.default = defineConfig({ engine: { plugins: [iconsPackage.icons()] } })
`
		const wrappedDefaultExport = `
const iconsPackage = require('@pikacss/plugin-icons')
module.exports = { default: defineConfig({ engine: { plugins: [iconsPackage.icons()] } }) }
`
		expect(localIconAdapterViolation(manifest, moduleExports))
			.toContain('@pikacss/plugin-icons/node')
		expect(localIconAdapterViolation(manifest, defaultExport))
			.toContain('@pikacss/plugin-icons/node')
		expect(localIconAdapterViolation(manifest, moduleDefaultExport))
			.toContain('@pikacss/plugin-icons/node')
		expect(localIconAdapterViolation(manifest, wrappedDefaultExport))
			.toContain('@pikacss/plugin-icons/node')
	})

	it('does not treat a namespace import from the Node adapter as neutral', () => {
		const manifest = JSON.stringify({ devDependencies: { '@iconify-json/mdi': '^1.2.3' } })
		const config = `
import * as iconsPackage from '@pikacss/plugin-icons/node'
export default { engine: { plugins: [iconsPackage.icons()], icons: { autoInstall: true } } }
`
		expect(localIconAdapterViolation(manifest, config))
			.toBeUndefined()
	})

	it('flags Node-only icons options through common config aliases and spreads', () => {
		const manifest = JSON.stringify({ dependencies: { '@pikacss/plugin-icons': '^1.0.0' } })
		const config = `
import { icons as iconPlugin } from '@pikacss/plugin-icons'
const iconOptions = { autoInstall: true }
const engineBase = { plugins: [iconPlugin()] }
const engine = { ...engineBase, icons: { ...iconOptions } }
export default { engine }
`
		expect(localIconAdapterViolation(manifest, config))
			.toContain('@pikacss/plugin-icons/node')
	})

	it('applies last-write-wins for statically-known config spreads', () => {
		const manifest = JSON.stringify({ devDependencies: { '@iconify-json/mdi': '^1.2.3' } })
		const neutralThenCustom = `
import { icons } from '@pikacss/plugin-icons'
const custom = () => ({ name: 'custom' })
const neutralBase = { plugins: [icons()] }
const customOverride = { plugins: [custom()] }
export default { engine: { ...neutralBase, ...customOverride } }
`
		const customThenNeutral = neutralThenCustom
			.replace('...neutralBase, ...customOverride', '...customOverride, ...neutralBase')
		const directOverride = `
import { icons } from '@pikacss/plugin-icons'
const custom = () => ({ name: 'custom' })
const neutralBase = { plugins: [icons()] }
export default { engine: { ...neutralBase, plugins: [custom()] } }
`
		expect(localIconAdapterViolation(manifest, neutralThenCustom))
			.toBeUndefined()
		expect(localIconAdapterViolation(manifest, customThenNeutral))
			.toContain('@pikacss/plugin-icons/node')
		expect(localIconAdapterViolation(manifest, directOverride))
			.toBeUndefined()
	})

	it('scopes Node-only option detection to engine.icons', () => {
		const manifest = JSON.stringify({ dependencies: { '@pikacss/plugin-icons': '^1.0.0' } })
		const config = `
import { icons } from '@pikacss/plugin-icons'
export default {
  metadata: { icons: { cwd: './not-an-icons-config' } },
  engine: { plugins: [icons()], icons: { cdn: 'https://example.test/{collection}.json' } },
}
`
		expect(localIconAdapterViolation(manifest, config))
			.toBeUndefined()
	})

	it('does not require /node for explicitly disabled or undefined options', () => {
		const manifest = JSON.stringify({ dependencies: { '@pikacss/plugin-icons': '^1.0.0' } })
		for (const option of ['autoInstall', 'cwd']) {
			const config = `
import { icons } from '@pikacss/plugin-icons'
export default { engine: { plugins: [icons()], icons: { ${option}: undefined } } }
`
			expect(localIconAdapterViolation(manifest, config), option)
				.toBeUndefined()
		}
		const disabled = `
import { icons } from '@pikacss/plugin-icons'
export default { engine: { plugins: [icons()], icons: { autoInstall: false } } }
`
		expect(localIconAdapterViolation(manifest, disabled))
			.toBeUndefined()
	})

	it('treats concrete cwd values and unknown option values conservatively', () => {
		const manifest = JSON.stringify({ dependencies: { '@pikacss/plugin-icons': '^1.0.0' } })
		const concrete = `
import { icons } from '@pikacss/plugin-icons'
export default { engine: { plugins: [icons()], icons: { cwd: ['./icons', './other'], autoInstall: true } } }
`
		const unknown = `
import { icons } from '@pikacss/plugin-icons'
declare const enabled: boolean
export default { engine: { plugins: [icons()], icons: { autoInstall: enabled } } }
`
		const unknownOptions = `
import { icons } from '@pikacss/plugin-icons'
declare const options: Record<string, unknown>
export default { engine: { plugins: [icons()], icons: options } }
`
		expect(localIconAdapterViolation(manifest, concrete))
			.toContain('@pikacss/plugin-icons/node')
		expect(localIconAdapterViolation(manifest, unknown))
			.toContain('@pikacss/plugin-icons/node')
		expect(localIconAdapterViolation(manifest, unknownOptions))
			.toContain('@pikacss/plugin-icons/node')
	})

	it('handles computed icons config keys exactly when resolvable and conservatively otherwise', () => {
		const manifest = JSON.stringify({ dependencies: { '@pikacss/plugin-icons': '^1.0.0' } })
		const resolved = `
import { icons } from '@pikacss/plugin-icons'
const key = 'autoInstall'
export default { engine: { plugins: [icons()], icons: { [key]: true } } }
`
		const resolvedNeutralOption = `
import { icons } from '@pikacss/plugin-icons'
const key = 'cdn'
export default { engine: { plugins: [icons()], icons: { [key]: 'https://example.test/{collection}.json' } } }
`
		const unresolved = `
import { icons } from '@pikacss/plugin-icons'
declare const key: string
export default { engine: { plugins: [icons()], icons: { [key]: true } } }
`
		expect(localIconAdapterViolation(manifest, resolved))
			.toContain('@pikacss/plugin-icons/node')
		expect(localIconAdapterViolation(manifest, resolvedNeutralOption))
			.toBeUndefined()
		expect(localIconAdapterViolation(manifest, unresolved))
			.toContain('@pikacss/plugin-icons/node')
	})

	it('preserves possible plugins from unresolved keys and trailing spreads', () => {
		const manifest = JSON.stringify({ devDependencies: { '@iconify-json/mdi': '^1.2.3' } })
		const unresolvedKey = `
import { icons } from '@pikacss/plugin-icons'
declare const key: string
export default { engine: { [key]: [icons()] } }
`
		const trailingSpread = `
import { icons } from '@pikacss/plugin-icons'
declare const extra: Record<string, unknown>
export default { engine: { plugins: [], ...extra } }
`
		const knownLastWrite = `
import { icons } from '@pikacss/plugin-icons'
const extra = { plugins: [icons()] }
export default { engine: { ...extra, plugins: [] } }
`
		expect(localIconAdapterViolation(manifest, unresolvedKey))
			.toContain('@pikacss/plugin-icons/node')
		expect(localIconAdapterViolation(manifest, trailingSpread))
			.toContain('@pikacss/plugin-icons/node')
		expect(localIconAdapterViolation(manifest, knownLastWrite))
			.toBeUndefined()
	})

	it('does not infer neutral activation from an unknown config or engine shape', () => {
		const manifest = JSON.stringify({ devDependencies: { '@iconify-json/mdi': '^1.2.3' } })
		const unknownConfigs = [
			`declare const cfg: any
export default cfg`,
			`import { icons } from '@pikacss/plugin-icons'
declare const cfg: any
export default cfg`,
			`declare const engine: any
export default { engine }`,
		]
		for (const config of unknownConfigs) {
			expect(localIconAdapterViolation(manifest, config), config)
				.toBeUndefined()
		}
	})

	it('applies last-write-wins independently to Node-only icon options', () => {
		const manifest = JSON.stringify({ dependencies: { '@pikacss/plugin-icons': '^1.0.0' } })
		const leadingUnknownSpread = `
import { icons } from '@pikacss/plugin-icons'
declare const extra: Record<string, unknown>
export default { engine: { plugins: [icons()], icons: { ...extra, autoInstall: false, cwd: undefined } } }
`
		const trailingUnknownSpread = leadingUnknownSpread.replace(
			'{ ...extra, autoInstall: false, cwd: undefined }',
			'{ autoInstall: false, cwd: undefined, ...extra }',
		)
		expect(localIconAdapterViolation(manifest, leadingUnknownSpread))
			.toBeUndefined()
		expect(localIconAdapterViolation(manifest, trailingUnknownSpread))
			.toContain('@pikacss/plugin-icons/node')
	})

	it('keeps post-loop reachability for possible breaks without leaking nested controls', () => {
		const manifest = JSON.stringify({ devDependencies: { '@iconify-json/mdi': '^1.2.3' } })
		const breaks = [
			`declare const flag: boolean
function wrapped() {
  while (true) { if (flag) break }
  return icons()
}`,
			`function wrapped() {
  while (true) { if (true) break }
  return icons()
}`,
		]
		const noBreak = `
function wrapped() {
  while (true) { if (false) break }
  return icons()
}
`
		const nestedSwitchBreak = `
declare const flag: boolean
function wrapped() {
  while (true) {
    switch (flag) {
      case true: break
      default: break
    }
  }
  return icons()
}
`
		const nestedLoopBreak = `
function wrapped() {
  while (true) {
    while (true) break
  }
  return icons()
}
`
		for (const body of breaks) {
			const config = `import { icons } from '@pikacss/plugin-icons'\n${body}\nexport default { engine: { plugins: [wrapped()] } }`
			expect(localIconAdapterViolation(manifest, config), config)
				.toContain('@pikacss/plugin-icons/node')
		}
		expect(localIconAdapterViolation(manifest, `import { icons } from '@pikacss/plugin-icons'\n${noBreak}\nexport default { engine: { plugins: [wrapped()] } }`))
			.toBeUndefined()
		expect(localIconAdapterViolation(manifest, `import { icons } from '@pikacss/plugin-icons'\n${nestedSwitchBreak}\nexport default { engine: { plugins: [wrapped()] } }`))
			.toBeUndefined()
		expect(localIconAdapterViolation(manifest, `import { icons } from '@pikacss/plugin-icons'\n${nestedLoopBreak}\nexport default { engine: { plugins: [wrapped()] } }`))
			.toBeUndefined()
	})

	it('snapshots top-level config bindings at each export evaluation', () => {
		const manifest = JSON.stringify({ devDependencies: { '@iconify-json/mdi': '^1.2.3' } })
		const engineNeutralBeforeExport = `
import { icons } from '@pikacss/plugin-icons'
let engine = { plugins: [] }
engine = { plugins: [icons()] }
export default { engine }
`
		const engineCustomBeforeExport = engineNeutralBeforeExport
			.replace('engine = { plugins: [icons()] }', 'engine = { plugins: [] }')
		const engineNeutralAfterExport = `
import { icons } from '@pikacss/plugin-icons'
let engine = { plugins: [icons()] }
export default { engine }
engine = { plugins: [] }
`
		const engineCustomAfterExport = `
import { icons } from '@pikacss/plugin-icons'
let engine = { plugins: [] }
export default { engine }
engine = { plugins: [icons()] }
`
		expect(localIconAdapterViolation(manifest, engineNeutralBeforeExport))
			.toContain('@pikacss/plugin-icons/node')
		expect(localIconAdapterViolation(manifest, engineCustomBeforeExport))
			.toBeUndefined()
		expect(localIconAdapterViolation(manifest, engineNeutralAfterExport))
			.toContain('@pikacss/plugin-icons/node')
		expect(localIconAdapterViolation(manifest, engineCustomAfterExport))
			.toBeUndefined()

		const aliasNeutralBeforeExport = `
import { icons } from '@pikacss/plugin-icons'
let plugins = []
plugins = [icons()]
let engine = { plugins }
export default { engine }
`
		const aliasCustomBeforeExport = aliasNeutralBeforeExport
			.replace('plugins = [icons()]', 'plugins = []')
		const aliasNeutralAfterExport = `
import { icons } from '@pikacss/plugin-icons'
let plugins = [icons()]
let engine = { plugins }
export default { engine }
plugins = []
`
		const aliasCustomAfterExport = `
import { icons } from '@pikacss/plugin-icons'
let plugins = []
let engine = { plugins }
export default { engine }
plugins = [icons()]
`
		expect(localIconAdapterViolation(manifest, aliasNeutralBeforeExport))
			.toContain('@pikacss/plugin-icons/node')
		expect(localIconAdapterViolation(manifest, aliasCustomBeforeExport))
			.toBeUndefined()
		expect(localIconAdapterViolation(manifest, aliasNeutralAfterExport))
			.toContain('@pikacss/plugin-icons/node')
		expect(localIconAdapterViolation(manifest, aliasCustomAfterExport))
			.toBeUndefined()

		const identifierExport = `
import { icons } from '@pikacss/plugin-icons'
let engine = { plugins: [icons()] }
const config = { engine }
export default config
engine = { plugins: [] }
`
		expect(localIconAdapterViolation(manifest, identifierExport))
			.toContain('@pikacss/plugin-icons/node')
	})

	it('preserves array initializer snapshots through direct and defineConfig aliases', () => {
		const manifest = JSON.stringify({ devDependencies: { '@iconify-json/mdi': '^1.2.3' } })
		const directNeutral = `
import { icons } from '@pikacss/plugin-icons'
let engine = { plugins: [icons()] }
const entries = [{ engine }]
engine = { plugins: [] }
export default entries
`
		const directCustom = directNeutral.replace('let engine = { plugins: [icons()] }', 'let engine = { plugins: [] }')
		const defineNeutral = directNeutral.replace('export default entries', 'export default defineConfig(entries)')
		const defineCustom = directCustom.replace('export default entries', 'export default defineConfig(entries)')
		const directPostRebound = `
import { icons } from '@pikacss/plugin-icons'
let engine = { plugins: [] }
const entries = [{ engine }]
engine = { plugins: [icons()] }
export default entries
`
		const definePostRebound = `
import { icons } from '@pikacss/plugin-icons'
let engine = { plugins: [] }
const entries = [{ engine }]
engine = { plugins: [icons()] }
export default defineConfig(entries)
`
		const multiAlias = `
import { icons } from '@pikacss/plugin-icons'
let engine = { plugins: [icons()] }
const first = [{ engine }]
const second = first
engine = { plugins: [] }
export default second
`
		const shorthandNegative = `
import { icons } from '@pikacss/plugin-icons'
const engine = { plugins: [] }
const entries = [{ engine }]
export default defineConfig(entries)
`
		for (const config of [directNeutral, defineNeutral, multiAlias]) {
			expect(localIconAdapterViolation(manifest, config), config)
				.toContain('@pikacss/plugin-icons/node')
		}
		for (const config of [directCustom, defineCustom, directPostRebound, definePostRebound, shorthandNegative]) {
			expect(localIconAdapterViolation(manifest, config), config)
				.toBeUndefined()
		}
	})

	it('resolves invoked object methods while leaving unused methods inert', () => {
		const manifest = JSON.stringify({ devDependencies: { '@iconify-json/mdi': '^1.2.3' } })
		const active = `
import { icons } from '@pikacss/plugin-icons'
const factory = { make() { return icons() } }
export default { engine: { plugins: [factory.make()] } }
`
		const unused = `
import { icons } from '@pikacss/plugin-icons'
const custom = () => ({ name: 'custom' })
const factory = { make() { return icons() }, other() { return custom() } }
export default { engine: { plugins: [factory.other()] } }
`
		const computedMember = `
import { icons } from '@pikacss/plugin-icons'
const key = 'icons'
const pkg = { [key]: icons }
export default { engine: { plugins: [pkg[key]()] } }
`
		const computedMethod = `
import { icons } from '@pikacss/plugin-icons'
const key = 'make'
const factory = { [key]() { return icons() } }
export default { engine: { plugins: [factory[key]()] } }
`
		const computedNumericMember = `
import { icons } from '@pikacss/plugin-icons'
const key = 0
const pkg = { [key]: icons }
export default { engine: { plugins: [pkg[key]()] } }
`
		const computedCustomMethod = `
import { icons } from '@pikacss/plugin-icons'
const key = 'make'
const custom = () => ({ name: 'custom' })
const factory = { [key]() { return custom() } }
export default { engine: { plugins: [factory[key]()] } }
`
		const literalElement = `
import { icons } from '@pikacss/plugin-icons'
const pkg = { icons }
export default { engine: { plugins: [pkg['icons']()] } }
`
		const literalMethod = `
import { icons } from '@pikacss/plugin-icons'
const factory = { make() { return icons() } }
export default { engine: { plugins: [factory['make']()] } }
`
		expect(localIconAdapterViolation(manifest, active))
			.toContain('@pikacss/plugin-icons/node')
		expect(localIconAdapterViolation(manifest, unused))
			.toBeUndefined()
		expect(localIconAdapterViolation(manifest, computedMember))
			.toContain('@pikacss/plugin-icons/node')
		expect(localIconAdapterViolation(manifest, computedMethod))
			.toContain('@pikacss/plugin-icons/node')
		expect(localIconAdapterViolation(manifest, computedNumericMember))
			.toContain('@pikacss/plugin-icons/node')
		expect(localIconAdapterViolation(manifest, computedCustomMethod))
			.toBeUndefined()
		expect(localIconAdapterViolation(manifest, literalElement))
			.toContain('@pikacss/plugin-icons/node')
		expect(localIconAdapterViolation(manifest, literalMethod))
			.toContain('@pikacss/plugin-icons/node')
	})

	it('snapshots computed object keys and property values at initializer evaluation', () => {
		const manifest = JSON.stringify({ devDependencies: { '@iconify-json/mdi': '^1.2.3' } })
		const computedKeyNeutralThenRebound = `
import { icons } from '@pikacss/plugin-icons'
let key = 'icons'
const pkg = { [key]: icons }
key = 'other'
export default { engine: { plugins: [pkg.icons()] } }
`
		const computedKeyOtherThenIcons = `
import { icons } from '@pikacss/plugin-icons'
let key = 'other'
const pkg = { [key]: icons }
key = 'icons'
export default { engine: { plugins: [pkg.icons()] } }
`
		const neutralValueThenCustom = `
import { icons } from '@pikacss/plugin-icons'
const custom = () => ({ name: 'custom' })
let factory = icons
const pkg = { make: factory }
factory = custom
export default { engine: { plugins: [pkg.make()] } }
`
		const customValueThenNeutral = `
import { icons } from '@pikacss/plugin-icons'
const custom = () => ({ name: 'custom' })
let factory = custom
const pkg = { make: factory }
factory = icons
export default { engine: { plugins: [pkg.make()] } }
`
		expect(localIconAdapterViolation(manifest, computedKeyNeutralThenRebound))
			.toContain('@pikacss/plugin-icons/node')
		expect(localIconAdapterViolation(manifest, computedKeyOtherThenIcons))
			.toBeUndefined()
		expect(localIconAdapterViolation(manifest, neutralValueThenCustom))
			.toContain('@pikacss/plugin-icons/node')
		expect(localIconAdapterViolation(manifest, customValueThenNeutral))
			.toBeUndefined()
	})

	it('models reachable try, catch, and finally icon calls with overriding flow', () => {
		const manifest = JSON.stringify({ devDependencies: { '@iconify-json/mdi': '^1.2.3' } })
		const tryCatch = `
import { icons } from '@pikacss/plugin-icons'
function wrapped() {
  try { throw new Error('x') } catch { return icons() }
}
export default { engine: { plugins: [wrapped()] } }
`
		const finallyCall = `
import { icons } from '@pikacss/plugin-icons'
const custom = () => ({ name: 'custom' })
function wrapped() {
  try { return custom() } finally { icons() }
}
export default { engine: { plugins: [wrapped()] } }
`
		const tryReturn = `
import { icons } from '@pikacss/plugin-icons'
function wrapped() {
  try { return icons() } catch { return undefined }
}
export default { engine: { plugins: [wrapped()] } }
`
		const deadCatchAndFinally = `
import { icons } from '@pikacss/plugin-icons'
function wrapped() {
  try { return undefined } catch { icons() } finally { return undefined }
}
export default { engine: { plugins: [wrapped()] } }
`
		const shadowedCatchParameter = `
import { icons } from '@pikacss/plugin-icons'
const custom = () => ({ name: 'custom' })
function wrapped() {
  try { throw custom } catch (icons) { return icons() }
}
export default { engine: { plugins: [wrapped()] } }
`
		const thrownNeutralFactory = `
import { icons } from '@pikacss/plugin-icons'
function wrapped() {
  try { throw icons } catch (factory) { return factory() }
}
export default { engine: { plugins: [wrapped()] } }
`
		const multipleThrownFactories = `
import { icons } from '@pikacss/plugin-icons'
const custom = () => ({ name: 'custom' })
declare const pick: boolean
function wrapped() {
  try {
    if (pick) throw icons
    else throw custom
  } catch (factory) { return factory() }
}
export default { engine: { plugins: [wrapped()] } }
`
		const multipleCustomFactories = `
import { icons } from '@pikacss/plugin-icons'
const custom = () => ({ name: 'custom' })
declare const pick: boolean
function wrapped() {
  try {
    if (pick) throw custom
    else throw custom
  } catch (factory) { return factory() }
}
export default { engine: { plugins: [wrapped()] } }
`
		const unknownThrownFactory = `
import { icons } from '@pikacss/plugin-icons'
declare const mayThrow: () => void
function wrapped() {
  try { mayThrow() } catch (factory) { return factory() }
}
export default { engine: { plugins: [wrapped()] } }
`
		const knownNeutralAndUnknownThrow = `
import { icons } from '@pikacss/plugin-icons'
declare const pick: boolean
declare const mayThrow: () => void
function wrapped() {
  try {
    if (pick) throw icons
    else mayThrow()
  } catch (factory) { return factory() }
}
export default { engine: { plugins: [wrapped()] } }
`
		expect(localIconAdapterViolation(manifest, tryCatch))
			.toContain('@pikacss/plugin-icons/node')
		expect(localIconAdapterViolation(manifest, finallyCall))
			.toContain('@pikacss/plugin-icons/node')
		expect(localIconAdapterViolation(manifest, tryReturn))
			.toContain('@pikacss/plugin-icons/node')
		expect(localIconAdapterViolation(manifest, deadCatchAndFinally))
			.toBeUndefined()
		expect(localIconAdapterViolation(manifest, shadowedCatchParameter))
			.toBeUndefined()
		expect(localIconAdapterViolation(manifest, thrownNeutralFactory))
			.toContain('@pikacss/plugin-icons/node')
		expect(localIconAdapterViolation(manifest, multipleThrownFactories))
			.toContain('@pikacss/plugin-icons/node')
		expect(localIconAdapterViolation(manifest, multipleCustomFactories))
			.toBeUndefined()
		expect(localIconAdapterViolation(manifest, unknownThrownFactory))
			.toBeUndefined()
		expect(localIconAdapterViolation(manifest, knownNeutralAndUnknownThrow))
			.toContain('@pikacss/plugin-icons/node')
	})

	it('updates function-local factory assignments and preserves branch snapshots', () => {
		const manifest = JSON.stringify({ devDependencies: { '@iconify-json/mdi': '^1.2.3' } })
		const customToNeutral = `
import { icons } from '@pikacss/plugin-icons'
const custom = () => ({ name: 'custom' })
function wrapped() {
  let factory = custom
  factory = icons
  return factory()
}
export default { engine: { plugins: [wrapped()] } }
`
		const neutralToCustom = customToNeutral.replace('let factory = custom\n  factory = icons', 'let factory = icons\n  factory = custom')
		const aliases = `
import { icons } from '@pikacss/plugin-icons'
const custom = () => ({ name: 'custom' })
function wrapped() {
  let factory = custom
  const first = factory
  factory = icons
  const second = factory
  factory = custom
  return [first(), second()]
}
export default { engine: { plugins: [wrapped()] } }
`
		const knownBranch = `
import { icons } from '@pikacss/plugin-icons'
const custom = () => ({ name: 'custom' })
function wrapped() {
  let factory = custom
  if (true) factory = icons
  return factory()
}
export default { engine: { plugins: [wrapped()] } }
`
		const unknownBranch = `
import { icons } from '@pikacss/plugin-icons'
const custom = () => ({ name: 'custom' })
declare const pick: boolean
function wrapped() {
  let factory = custom
  if (pick) factory = icons
  return factory()
}
export default { engine: { plugins: [wrapped()] } }
`
		const sameUnknownBranches = unknownBranch
			.replace('if (pick) factory = icons', 'if (pick) factory = custom')
			.replace('return factory()', 'else factory = custom\n  return factory()')
		const updateAssignment = `
import { icons } from '@pikacss/plugin-icons'
const custom = () => ({ name: 'custom' })
function wrapped() {
  let factory = custom
  for (let index = 0; index < 1; index++, factory = icons) {}
  return factory()
}
export default { engine: { plugins: [wrapped()] } }
`
		expect(localIconAdapterViolation(manifest, customToNeutral))
			.toContain('@pikacss/plugin-icons/node')
		expect(localIconAdapterViolation(manifest, neutralToCustom))
			.toBeUndefined()
		expect(localIconAdapterViolation(manifest, aliases))
			.toContain('@pikacss/plugin-icons/node')
		expect(localIconAdapterViolation(manifest, knownBranch))
			.toContain('@pikacss/plugin-icons/node')
		expect(localIconAdapterViolation(manifest, unknownBranch))
			.toContain('@pikacss/plugin-icons/node')
		expect(localIconAdapterViolation(manifest, sameUnknownBranches))
			.toBeUndefined()
		expect(localIconAdapterViolation(manifest, updateAssignment))
			.toContain('@pikacss/plugin-icons/node')
	})

	it('isolates helper mutations in probed branches and preserves lexical owners', () => {
		const manifest = JSON.stringify({ devDependencies: { '@iconify-json/mdi': '^1.2.3' } })
		const wrap = (body: string): string => `import { icons } from '@pikacss/plugin-icons'
const custom = () => ({ name: 'custom' })
function wrapped() { ${body} }
export default { engine: { plugins: [wrapped()] } }`

		for (const body of [
			`declare const pick: boolean
let f = icons
function mutate() { f = custom }
pick && mutate()
return f()`,
			`declare const pick: boolean
let f = icons
function mutate() { f = custom }
if (pick) mutate()
return f()`,
		]) {
			expect(localIconAdapterViolation(manifest, wrap(body)), body)
				.toContain('@pikacss/plugin-icons/node')
		}

		const tryCatch = `function boom() { throw 1 }
let f = custom
try { f = boom() } catch { f = icons }
return f()`
		const tryFinally = `let f = custom
try { f = custom } finally { f = icons }
return f()`
		expect(localIconAdapterViolation(manifest, wrap(tryCatch)))
			.toContain('@pikacss/plugin-icons/node')
		expect(localIconAdapterViolation(manifest, wrap(tryFinally)))
			.toContain('@pikacss/plugin-icons/node')

		const shadowed = `let f = custom
const mutate = () => { f = icons }
{ let f = custom; mutate(); return f() }`
		const outer = `let f = custom
const mutate = () => { f = icons }
{ let f = custom; mutate() }
return f()`
		expect(localIconAdapterViolation(manifest, wrap(shadowed)))
			.toBeUndefined()
		expect(localIconAdapterViolation(manifest, wrap(outer)))
			.toContain('@pikacss/plugin-icons/node')
	})

	it('propagates bounded lexical state through control flow, closures, unions, and logical assignments', () => {
		const manifest = JSON.stringify({ devDependencies: { '@iconify-json/mdi': '^1.2.3' } })
		const wrap = (body: string): string => `import { icons } from '@pikacss/plugin-icons'\nconst custom = () => ({ name: 'custom' })\nfunction wrapped() { ${body} }\nexport default { engine: { plugins: [wrapped()] } }`
		const violationCases = [
			`declare const pick: 'a' | 'b'\nlet f = custom\nswitch (pick) { case 'a': f = icons; break; case 'b': f = custom; break }\nreturn f()`,
			`declare const pick: boolean\nlet f = custom\nwhile (pick) { f = icons; break }\nreturn f()`,
			`declare const pick: boolean\nlet f = custom\ndo { f = icons } while (pick)\nreturn f()`,
			`declare const values: string[]\nlet f = custom\nfor (const value of values) f = icons\nreturn f()`,
			`declare const values: Record<string, string>\nlet f = custom\nfor (const key in values) f = icons\nreturn f()`,
			`let f = custom\nreturn (f = icons, f())`,
			`let f = custom\ntry { f = icons; throw new Error('x') } catch { return f() }`,
			`declare const pick: boolean\nlet f = custom\ntry { if (pick) { f = icons; throw new Error('x') } else throw new Error('x') } catch { return f() }`,
			`declare const pick: boolean\nlet f = custom\nconst invoke = () => f()\nif (pick) f = icons\nreturn invoke()`,
			`const customObj = { run: custom }\nconst neutralObj = { run: icons }\nlet api = customObj\nif (pick) api = neutralObj\nreturn api.run()`,
			`const customObj = { run() { return custom() } }\nconst neutralObj = { run() { return icons() } }\nlet api = customObj\nif (pick) api = neutralObj\nreturn api.run()`,
			`let f = custom\nconst mutate = () => { f = icons }\nmutate()\nreturn f()`,
			`let f: typeof custom | undefined\nf ??= icons\nreturn f()`,
			`let f: typeof custom | undefined\nf ||= icons\nreturn f()`,
			`let f: typeof custom | undefined\nf &&= icons\nreturn f()`,
		]
		for (const body of violationCases) {
			const violation = localIconAdapterViolation(manifest, wrap(body))
			expect(violation)
				.toBeDefined()
		}

		const cleanCases = [
			`let f = custom\nswitch ('a') { case 'a': f = custom; break; default: f = custom }\nreturn f()`,
			`let f = custom\nwhile (false) { f = icons }\nreturn f()`,
			`let f = custom\ndo { f = custom } while (false)\nreturn f()`,
			`declare const values: string[]\nlet f = custom\nfor (const value of values) f = custom\nreturn f()`,
			`declare const values: Record<string, string>\nlet f = custom\nfor (const key in values) f = custom\nreturn f()`,
			`let f = custom\nreturn (f = custom, f())`,
			`let f = custom\ntry { f = custom; throw new Error('x') } catch { return f() }`,
			`let f = custom\nconst invoke = () => f()\nif (false) f = icons\nreturn invoke()`,
			`let f = custom\nconst snapshot = f\nif (pick) f = icons\nreturn snapshot()`,
			`const customObj = { run: custom }\nconst neutralObj = { run: custom }\nlet api = customObj\nif (pick) api = neutralObj\nreturn api.run()`,
			`const customObj = { run() { return custom() } }\nconst neutralObj = { run() { return custom() } }\nlet api = customObj\nif (pick) api = neutralObj\nreturn api.run()`,
			`let f = custom\nconst mutate = () => { f = custom }\nmutate()\nreturn f()`,
			`let f = custom\nf ||= icons\nreturn f()`,
			`let f = custom\nf &&= custom\nreturn f()`,
			`let f = custom\nf ??= custom\nreturn f()`,
			`let f = custom\ntry { return f } finally { f = icons }`,
		]
		for (const body of cleanCases) {
			expect(localIconAdapterViolation(manifest, wrap(body)))
				.toBeUndefined()
		}

		const shadowedMutator = wrap(`let f = custom\nconst mutate = () => { let f = custom; f = icons }\nmutate()\nreturn f()`)
		expect(localIconAdapterViolation(manifest, shadowedMutator))
			.toBeUndefined()

		const wrapReturned = (body: string): string => wrap(body)
			.replace('[wrapped()]', '[wrapped()()]')
		expect(localIconAdapterViolation(manifest, wrapReturned(`let f = custom\ntry { return f } finally { f = icons }`)))
			.toBeUndefined()
		const neutralFinally = wrapReturned(`let f = icons\ntry { return f } finally { f = custom }`)
		expect(localIconAdapterViolation(manifest, neutralFinally))
			.toContain('@pikacss/plugin-icons/node')
	})

	it('merges skip and execute paths for unknown logical assignment effects', () => {
		const manifest = JSON.stringify({ devDependencies: { '@iconify-json/mdi': '^1.2.3' } })
		const wrap = (body: string): string => `import { icons } from '@pikacss/plugin-icons'
const custom = () => ({ name: 'custom' })
function wrapped() { ${body} }
export default { engine: { plugins: [wrapped()] } }`
		const violationCases = [
			`declare const pick: boolean
let f = icons
pick && (f = custom)
return f()`,
			`declare const pick: boolean
let f = icons
pick || (f = custom)
return f()`,
			`declare const pick: boolean
let f = custom
pick && (f = icons)
return f()`,
			`declare const pick: boolean
let f = custom
pick || (f = icons)
return f()`,
		]
		for (const body of violationCases) {
			expect(localIconAdapterViolation(manifest, wrap(body)), body)
				.toContain('@pikacss/plugin-icons/node')
		}

		const cleanCases = [
			`declare const pick: boolean
let f = custom
pick && (f = custom)
return f()`,
			`declare const pick: boolean
let f = custom
pick || (f = custom)
return f()`,
			`let f = custom
false && (f = icons)
return f()`,
			`let f = custom
true || (f = icons)
return f()`,
		]
		for (const body of cleanCases) {
			expect(localIconAdapterViolation(manifest, wrap(body)), body)
				.toBeUndefined()
		}
	})

	it('keeps conditional and logical closure initializers live', () => {
		const manifest = JSON.stringify({ devDependencies: { '@iconify-json/mdi': '^1.2.3' } })
		const wrap = (body: string): string => `import { icons } from '@pikacss/plugin-icons'
const custom = () => ({ name: 'custom' })
function wrapped() { ${body} }
export default { engine: { plugins: [wrapped()()] } }`
		const live = `let f = custom
const invoke = true ? (() => f()) : (() => custom())
f = icons
return invoke`
		const unknown = `declare const pick: boolean
let f = custom
const invoke = pick ? (() => f()) : (() => custom())
f = icons
return invoke`
		const logical = `let f = custom
const invoke = true && (() => f())
f = icons
return invoke`
		const customOnly = `declare const pick: boolean
let f = custom
const invoke = pick ? (() => custom()) : (() => custom())
f = icons
return invoke`
		expect(localIconAdapterViolation(manifest, wrap(live)))
			.toContain('@pikacss/plugin-icons/node')
		expect(localIconAdapterViolation(manifest, wrap(unknown)))
			.toContain('@pikacss/plugin-icons/node')
		expect(localIconAdapterViolation(manifest, wrap(logical)))
			.toContain('@pikacss/plugin-icons/node')
		expect(localIconAdapterViolation(manifest, wrap(customOnly)))
			.toBeUndefined()
	})

	it('does not merge assignments into shadowed lexical bindings', () => {
		const manifest = JSON.stringify({ devDependencies: { '@iconify-json/mdi': '^1.2.3' } })
		const wrap = (body: string): string => `import { icons } from '@pikacss/plugin-icons'
const custom = () => ({ name: 'custom' })
function wrapped() { ${body} }
export default { engine: { plugins: [wrapped()] } }`
		const catchParameter = `let f = custom
try { throw 1 } catch (f) { f = icons }
return f()`
		const blockLocal = `let f = custom
{ let f = custom; f = icons }
return f()`
		expect(localIconAdapterViolation(manifest, wrap(catchParameter)))
			.toBeUndefined()
		expect(localIconAdapterViolation(manifest, wrap(blockLocal)))
			.toBeUndefined()
	})

	it('only commits assignments on the normal RHS path', () => {
		const manifest = JSON.stringify({ devDependencies: { '@iconify-json/mdi': '^1.2.3' } })
		const wrap = (body: string): string => `import { icons } from '@pikacss/plugin-icons'
const custom = () => ({ name: 'custom' })
function wrapped() { ${body} }
export default { engine: { plugins: [wrapped()] } }`
		const unknownRhs = `declare const pick: boolean
function maybe() { if (pick) throw 1; return icons }
let f = custom
try { f = maybe() } catch { return f() }
return custom()`
		const successfulRhs = unknownRhs.replace('return custom()', 'return f()')
		const definitelyThrowing = `function maybe() { throw 1 }
let f = custom
try { f = maybe() } catch { return f() }
return custom()`
		expect(localIconAdapterViolation(manifest, wrap(unknownRhs)))
			.toBeUndefined()
		expect(localIconAdapterViolation(manifest, wrap(successfulRhs)))
			.toContain('@pikacss/plugin-icons/node')
		expect(localIconAdapterViolation(manifest, wrap(definitelyThrowing)))
			.toBeUndefined()
	})

	it('bounds deeply nested catch states without losing neutral reachability', () => {
		const manifest = JSON.stringify({ devDependencies: { '@iconify-json/mdi': '^1.2.3' } })
		const nested = (depth: number, catchBody: string): string => {
			let inner = 'throw custom'
			for (let index = 0; index < depth; index++)
				inner = `try { ${inner} } catch (factory${index}) { ${catchBody} }`
			return `
import { icons } from '@pikacss/plugin-icons'
const custom = () => ({ name: 'custom' })
declare const pick: boolean
function wrapped() { try { ${inner} } catch (factory) { return factory() } }
export default { engine: { plugins: [wrapped()] } }
`
		}
		const runInBoundedChild = (config: string, expected: 'clean' | 'violation'): void => {
			const script = `import { localIconAdapterViolation } from "./scripts/ci/gates.ts"; const clean = localIconAdapterViolation(${JSON.stringify(manifest)}, ${JSON.stringify(config)}) === undefined; process.exit(clean === ${JSON.stringify(expected === 'clean')} ? 0 : 1)`
			execFileSync(process.execPath, ['--import', 'tsx', '-e', script], {
				cwd: workspaceRoot,
				env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=128' },
				maxBuffer: 1024 * 1024,
				timeout: 3000,
			})
		}
		expect(() => runInBoundedChild(nested(22, 'throw custom'), 'clean'))
			.not.toThrow()
		expect(() => runInBoundedChild(nested(22, 'if (pick) throw icons; else throw custom'), 'violation'))
			.not.toThrow()
	})

	it('keeps bounded numeric loops conservative for writes and static directions', () => {
		const manifest = JSON.stringify({ devDependencies: { '@iconify-json/mdi': '^1.2.3' } })
		const destructuringWrite = `
import { icons } from '@pikacss/plugin-icons'
function wrapped() {
  for (let i = 0; i < 1; i++) {
    ({ i } = { i: 2 })
    if (i) return icons()
  }
  return undefined
}
export default { engine: { plugins: [wrapped()] } }
`
		const initialFalse = `
import { icons } from '@pikacss/plugin-icons'
function wrapped() {
  for (let i = 0; i < 0; i++) { icons() }
  for (let i = 0; 0 > i; i++) { icons() }
  for (let i = 0; i === 1;) { icons() }
  for (let i = 0; 1 === i; i++) { icons() }
  return undefined
}
export default { engine: { plugins: [wrapped()] } }
`
		const reversedLive = `
import { icons } from '@pikacss/plugin-icons'
function wrapped() {
  for (let i = 0; 2 > i; i++) {
    if (i) return icons()
  }
  return undefined
}
export default { engine: { plugins: [wrapped()] } }
`
		const staticDecrements = `
import { icons } from '@pikacss/plugin-icons'
function wrapped() {
  for (let i = 0; i > -1; i--) { if (i) icons() }
  for (let i = 0; i > -1; i += -1) { if (i) icons() }
  for (let i = 0; i > -1; i -= 1) { if (i) icons() }
  return undefined
}
export default { engine: { plugins: [wrapped()] } }
`
		const predeclaredAssignment = `
import { icons } from '@pikacss/plugin-icons'
function wrapped() {
  let i = 0
  for (i = 0; i < 2; i++) {
    if (i) return icons()
  }
  return undefined
}
export default { engine: { plugins: [wrapped()] } }
`
		const predeclaredZeroIterations = predeclaredAssignment.replace('i < 2', 'i < 1')
		expect(localIconAdapterViolation(manifest, destructuringWrite))
			.toContain('@pikacss/plugin-icons/node')
		expect(localIconAdapterViolation(manifest, initialFalse))
			.toBeUndefined()
		expect(localIconAdapterViolation(manifest, reversedLive))
			.toContain('@pikacss/plugin-icons/node')
		expect(localIconAdapterViolation(manifest, staticDecrements))
			.toBeUndefined()
		expect(localIconAdapterViolation(manifest, predeclaredAssignment))
			.toContain('@pikacss/plugin-icons/node')
		expect(localIconAdapterViolation(manifest, predeclaredZeroIterations))
			.toBeUndefined()
	})

	it('leaves intentionally unsupported dynamic factory shapes unclassified', () => {
		const manifest = JSON.stringify({ devDependencies: { '@iconify-json/mdi': '^1.2.3' } })
		const config = `
import { icons } from '@pikacss/plugin-icons'
declare const chooseFactory: () => typeof icons
export default { engine: { plugins: [chooseFactory()] } }
`
		expect(localIconAdapterViolation(manifest, config))
			.toBeUndefined()
	})

	it('ignores an unused neutral icons import even when a local collection is installed', () => {
		expect(localIconAdapterViolation(
			JSON.stringify({ devDependencies: { '@iconify-json/mdi': '^1.2.3' } }),
			'import { icons } from \'@pikacss/plugin-icons\'\nexport default { engine: { plugins: [] } }',
		))
			.toBeUndefined()
	})

	it('does not confuse custom runtime plugins with the neutral icons factory', () => {
		const config = `
import { createIconsPlugin } from '@pikacss/plugin-icons'
export default { engine: { plugins: [createIconsPlugin({ load: async () => undefined })] } }
`
		expect(localIconAdapterViolation(
			JSON.stringify({ devDependencies: { '@iconify-json/mdi': '^1.2.3' } }),
			config,
		))
			.toBeUndefined()
	})

	it('accepts the Node adapter and active neutral configs that only use neutral capabilities', () => {
		expect(localIconAdapterViolation(
			JSON.stringify({ dependencies: { '@iconify-json/mdi': '^1.2.3' } }),
			'import { icons } from \'@pikacss/plugin-icons/node\'\nexport default { engine: { plugins: [icons()], icons: { autoInstall: true } } }',
		))
			.toBeUndefined()
		expect(localIconAdapterViolation(
			JSON.stringify({ dependencies: { '@pikacss/plugin-icons': '^1.0.0' } }),
			'import { icons } from \'@pikacss/plugin-icons\'\nexport default { engine: { plugins: [icons()], icons: { cdn: \'https://example.test/{collection}.json\' } } }',
		))
			.toBeUndefined()
	})

	it('keeps every tracked config requesting local icon capabilities on the Node adapter', () => {
		const violations: string[] = []
		const configs = globbySync([...LOCAL_ICON_CONFIG_GLOBS], {
			cwd: workspaceRoot,
			dot: true,
			ignore: ['**/node_modules/**', '**/dist/**'],
		})

		for (const configPath of configs) {
			let current = dirname(configPath)
			let manifestPath: string | undefined
			while (true) {
				const candidate = join(current, 'package.json')
				if (existsSync(join(workspaceRoot, candidate))) {
					manifestPath = candidate
					break
				}
				const parent = dirname(current)
				if (parent === current || current === '.')
					break
				current = parent
			}
			if (manifestPath == null)
				continue

			const violation = localIconAdapterViolation(
				readFileSync(join(workspaceRoot, manifestPath), 'utf8'),
				readFileSync(join(workspaceRoot, configPath), 'utf8'),
			)
			if (violation != null)
				violations.push(`${configPath}: ${violation}`)
		}

		expect(violations)
			.toEqual([])
	})

	it('bounds config discovery to supported config-shaped paths', () => {
		const configs = globbySync([...LOCAL_ICON_CONFIG_GLOBS], {
			cwd: workspaceRoot,
			dot: true,
			ignore: ['**/node_modules/**', '**/dist/**'],
		})
		expect(configs)
			.toContain('docs/.vitepress/pika.config.ts')
		expect(configs)
			.toContain('playground/src/templates/react-ts/pika.config.ts')
		expect(configs.some(path => path.endsWith('/vite.config.ts')))
			.toBe(false)
		expect(LOCAL_ICON_CONFIG_GLOBS.join('\n'))
			.toContain('cts')
		expect(LOCAL_ICON_CONFIG_GLOBS.join('\n'))
			.toContain('cjs')
		expect(LOCAL_ICON_CONFIG_GLOBS.join('\n'))
			.toContain('project')
	})
})

describe('isCommentOnlyDiff', () => {
	it('treats a JSDoc-only change as comment-only', () => {
		const diff = [
			'--- a/packages/core/src/engine.ts',
			'+++ b/packages/core/src/engine.ts',
			'@@ -10,0 +11,2 @@',
			'+/**',
			'+ * Renders preflights once per pass.',
			'+ */',
			'- * Old wording.',
		].join('\n')
		expect(isCommentOnlyDiff(diff))
			.toBe(true)
	})

	it('treats a real code change as code, even alongside comments', () => {
		const diff = [
			'--- a/packages/core/src/engine.ts',
			'+++ b/packages/core/src/engine.ts',
			'@@ -10 +10,2 @@',
			'+// bump the counter',
			'+count += 1',
		].join('\n')
		expect(isCommentOnlyDiff(diff))
			.toBe(false)
	})

	it('treats an empty diff as comment-only so renames do not demand tests', () => {
		expect(isCommentOnlyDiff(''))
			.toBe(true)
	})
})

describe('packageOfSourcePath', () => {
	it('extracts the package directory from a package source path', () => {
		expect(packageOfSourcePath('packages/plugin-icons/src/index.ts'))
			.toBe('plugin-icons')
	})

	it('ignores paths outside packages/<name>/src', () => {
		expect(packageOfSourcePath('docs/index.md'))
			.toBeUndefined()
		expect(packageOfSourcePath('packages/core/package.json'))
			.toBeUndefined()
	})
})

describe('packagesMissingTestChanges', () => {
	it('reports a package whose source changed with no test change', () => {
		const result = packagesMissingTestChanges([
			{ path: 'packages/core/src/engine.ts', commentOnly: false },
		])
		expect(result)
			.toEqual(['core'])
	})

	it('accepts a co-located test change in the same package', () => {
		const result = packagesMissingTestChanges([
			{ path: 'packages/core/src/engine.ts', commentOnly: false },
			{ path: 'packages/core/src/engine.test.ts', commentOnly: false },
		])
		expect(result)
			.toEqual([])
	})

	it('does not accept a test change in a different package', () => {
		const result = packagesMissingTestChanges([
			{ path: 'packages/core/src/engine.ts', commentOnly: false },
			{ path: 'packages/unplugin/src/index.test.ts', commentOnly: false },
		])
		expect(result)
			.toEqual(['core'])
	})

	it('ignores comment-only, generated, and .gen source changes', () => {
		const result = packagesMissingTestChanges([
			{ path: 'packages/core/src/engine.ts', commentOnly: true },
			{ path: 'packages/core/src/generated/csstype.ts', commentOnly: false },
			{ path: 'packages/integration/src/ctx.gen.ts', commentOnly: false },
		])
		expect(result)
			.toEqual([])
	})

	it('reports every affected package, sorted', () => {
		const result = packagesMissingTestChanges([
			{ path: 'packages/unplugin/src/index.ts', commentOnly: false },
			{ path: 'packages/core/src/engine.ts', commentOnly: false },
		])
		expect(result)
			.toEqual(['core', 'unplugin'])
	})
})

describe('hasWaiverLabel', () => {
	it('detects the waiver label in a comma-separated list', () => {
		expect(hasWaiverLabel('dependencies, no-test-needed'))
			.toBe(true)
	})

	it('rejects absent, empty, and partial matches', () => {
		expect(hasWaiverLabel(undefined))
			.toBe(false)
		expect(hasWaiverLabel(''))
			.toBe(false)
		expect(hasWaiverLabel('no-test-needed-really'))
			.toBe(false)
	})
})

describe('maintenance checker regressions', () => {
	it('preserves git diff output when --no-index reports changed files with exit 1 and stderr warnings', () => {
		const previous = {
			count: process.env.GIT_CONFIG_COUNT,
			key: process.env.GIT_CONFIG_KEY_0,
			value: process.env.GIT_CONFIG_VALUE_0,
		}
		process.env.GIT_CONFIG_COUNT = '1'
		process.env.GIT_CONFIG_KEY_0 = 'core.autocrlf'
		process.env.GIT_CONFIG_VALUE_0 = 'true'
		try {
			const stats = numstatAgainst('__old_translation_source__\n', 'index.md')
			expect(stats.added + stats.deleted)
				.toBeGreaterThan(0)
			expect(diffAgainst('__old_translation_source__\n', 'index.md'))
				.toContain('__old_translation_source__')
		}
		finally {
			for (const [key, value] of Object.entries({
				GIT_CONFIG_COUNT: previous.count,
				GIT_CONFIG_KEY_0: previous.key,
				GIT_CONFIG_VALUE_0: previous.value,
			})) {
				if (value === undefined)
					delete process.env[key]
				else
					process.env[key] = value
			}
		}
	})

	it('does not swallow genuine git errors from translation diffs', () => {
		expect(() => diffAgainst('__old_translation_source__\n', '__definitely_missing_translation_page__.md'))
			.toThrow()
	})

	it('flags docs relatedSources that no longer exist', () => {
		expect(relatedSourceIssues(['AGENTS.md']))
			.toEqual([])
		expect(relatedSourceIssues(['packages/integration/src/definitely-missing.ts']))
			.toEqual(['relatedSources target does not exist: packages/integration/src/definitely-missing.ts'])
	})

	it('keeps every declared overload while excluding the implementation signature', () => {
		const source = ts.createSourceFile(
			'a.ts',
			'function f(value: string): string; function f(value: number, radix?: number): string; function f(value: string | number): string { return String(value) }',
			ts.ScriptTarget.Latest,
			true,
			ts.ScriptKind.TS,
		)
		const declarations = source.statements.filter(ts.isFunctionDeclaration)
		const selected = selectFunctionApiDeclarations(declarations)
		expect(selected)
			.toHaveLength(2)
		expect(selected.map(declaration => declaration.parameters.map(parameter => parameter.name.getText())))
			.toEqual([['value'], ['value', 'radix']])
		expect(selected.every(declaration => declaration.body == null))
			.toBe(true)
	})

	it('recognizes member-level @internal tags for API-doc filtering', () => {
		expect(hasInternalJsDocTag([{ name: 'internal' }]))
			.toBe(true)
		expect(hasInternalJsDocTag([{ name: 'default' }]))
			.toBe(false)
	})

	it('excludes ECMAScript #private as well as private/protected TypeScript members from API docs', () => {
		const source = ts.createSourceFile(
			'a.ts',
			'class Example { #hidden = 1; private alsoHidden = 2; protected inherited = 3; public visible = 4 }',
			ts.ScriptTarget.Latest,
			true,
			ts.ScriptKind.TS,
		)
		const declaration = source.statements[0]
		expect(declaration != null && ts.isClassDeclaration(declaration))
			.toBe(true)
		const members = (declaration as ts.ClassDeclaration).members
		expect(members.map(isPrivateOrProtectedDeclaration))
			.toEqual([true, true, true, false])
	})
})
