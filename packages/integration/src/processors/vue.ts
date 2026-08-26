import type {
	DirectiveNode,
	ElementNode,
	ExpressionNode,
	SimpleExpressionNode,
	TemplateChildNode,
} from '@vue/compiler-core'
import type { SFCBlock, SFCDescriptor } from '@vue/compiler-sfc'
import type { JsDialect } from '../compiler/parse'
import type {
	AnalyzedModule,
	AnalyzedProjectModule,
	FrameworkProcessor,
	MacroCall,
	ProcessorOptions,
	ProcessorProjectOptions,
} from './types'
import * as t from '@babel/types'
import { analyzeJsProject } from '../compiler/analyze'
import { PikaTransformError } from '../compiler/errors'
import { parseJsExpression } from '../compiler/parse'
import { dialectForExtension } from './js'

// @vue/compiler-core NodeTypes values (the enum itself is not re-exported by
// @vue/compiler-sfc, and importing it at runtime would defeat the lazy load).
const NODE_ELEMENT = 1
const NODE_SIMPLE_EXPRESSION = 4
const NODE_INTERPOLATION = 5
const NODE_DIRECTIVE = 7

interface RootConfig {
	fnNames: readonly string[]
	roots: ReadonlySet<string>
}

interface TemplateWalkContext {
	id: string
	dialect: JsDialect
	rootConfig: RootConfig
	callsByRoot: Map<string, MacroCall[]>
	/** Multiset of names shadowed by enclosing v-for aliases / slot props. */
	shadowed: Map<string, number>
}

function createRootConfig(fnNames: readonly string[]): RootConfig {
	return { fnNames, roots: new Set(fnNames) }
}

function containsAnyRoot(source: string, rootConfig: RootConfig): boolean {
	return rootConfig.fnNames.some(fnName => source.includes(fnName))
}

function appendGroupedCalls(target: Map<string, MacroCall[]>, grouped: ReadonlyMap<string, readonly MacroCall[]>): void {
	for (const [fnName, calls] of grouped) {
		target.get(fnName)
			?.push(...calls)
	}
}

/**
 * Reads the quote character of a directive's attribute value from the
 * directive's own raw source (`:class="..."` → `"`), replacing the legacy
 * backward-scanning heuristic with an AST-anchored lookup.
 */
function attributeQuote(dir: DirectiveNode): '"' | '\'' | null {
	const source = dir.loc.source
	const eq = source.indexOf('=')
	if (eq === -1)
		return null
	let i = eq + 1
	while (i < source.length && /\s/.test(source[i]!))
		i++
	const char = source[i]
	return char === '"' || char === '\'' ? char : null
}

/**
 * Collects the binding names a pattern source introduces (v-for alias,
 * slot-props destructuring), via a Babel parse of the pattern as an arrow
 * function parameter.
 */
function patternNamesFromSource(source: string, ctx: TemplateWalkContext, loc: { line: number, column: number } | null): string[] {
	// A pattern can only shadow a configured root when one root's text appears.
	if (!containsAnyRoot(source, ctx.rootConfig))
		return []
	const trimmed = source.trim()
	const wrapped = trimmed.startsWith('(') && trimmed.endsWith(')')
		? `${trimmed} => 0`
		: `(${trimmed}) => 0`
	let params: t.ArrowFunctionExpression['params']
	try {
		params = (parseJsExpression(wrapped, ctx.dialect) as t.ArrowFunctionExpression).params
	}
	catch (error: any) {
		throw new PikaTransformError({
			id: ctx.id,
			stage: 'parse',
			loc,
			message: `Failed to parse template binding pattern "${trimmed}": ${error?.message ?? error}`,
			cause: error,
		})
	}
	return params.flatMap(param => Object.keys(t.getBindingIdentifiers(param)))
}

function expressionLoc(exp: SimpleExpressionNode): { line: number, column: number } {
	return { line: exp.loc.start.line, column: exp.loc.start.column - 1 }
}

function patternNames(exp: ExpressionNode | undefined, ctx: TemplateWalkContext): string[] {
	if (exp == null || exp.type !== NODE_SIMPLE_EXPRESSION)
		return []
	return patternNamesFromSource(exp.loc.source, ctx, expressionLoc(exp))
}

function analyzeTemplateExpression(exp: ExpressionNode, dir: DirectiveNode | null, ctx: TemplateWalkContext): void {
	if (exp.type !== NODE_SIMPLE_EXPRESSION)
		return
	const source = exp.loc.source
	if (!containsAnyRoot(source, ctx.rootConfig))
		return
	const excludedRoots = new Set<string>()
	for (const [name, count] of ctx.shadowed) {
		if (count > 0 && ctx.rootConfig.roots.has(name))
			excludedRoots.add(name)
	}
	// The emitted literal must use the opposite quote of the enclosing
	// attribute value; interpolations and unquoted values default to single.
	const quote = dir != null && attributeQuote(dir) === '\'' ? '"' : '\''
	appendGroupedCalls(ctx.callsByRoot, analyzeJsProject(source, ctx.id, ctx.dialect, ctx.rootConfig.fnNames, {
		offsets: {
			startIndex: exp.loc.start.offset,
			startLine: exp.loc.start.line,
			// Vue positions are 1-based; Babel's startColumn is 0-based.
			startColumn: exp.loc.start.column - 1,
		},
		quote,
		excludedRoots: excludedRoots.size > 0 ? excludedRoots : undefined,
		// v-on values may be statement sequences; everything else is a single
		// expression (where `{ ... }` must parse as an object literal).
		parseMode: dir?.name === 'on' ? 'program' : 'expression',
	}))
}

/** Matches the first `in`/`of` delimiter of a raw `v-for` expression. */
const V_FOR_DELIMITER_RE = /\s(?:in|of)\s/

function analyzeVForDirective(dir: DirectiveNode, ctx: TemplateWalkContext): string[] {
	const result = dir.forParseResult
	if (result != null) {
		// The iterated source expression evaluates in the OUTER scope; analyze
		// it before the aliases take effect.
		analyzeTemplateExpression(result.source, dir, ctx)
		return [result.value, result.key, result.index]
			.flatMap(node => patternNames(node ?? undefined, ctx))
	}

	// Fallback for parser versions that do not attach forParseResult: split
	// the raw expression and Babel-parse the alias side as a binding pattern.
	const exp = dir.exp
	if (exp == null || exp.type !== NODE_SIMPLE_EXPRESSION)
		return []
	const match = V_FOR_DELIMITER_RE.exec(exp.loc.source)
	if (match == null)
		return []
	const alias = exp.loc.source.slice(0, match.index)
	const sourceExp = exp.loc.source.slice(match.index + match[0].length)
	const referencedRoot = ctx.rootConfig.fnNames.find(fnName => sourceExp.includes(fnName))
	if (referencedRoot != null) {
		throw new PikaTransformError({
			id: ctx.id,
			stage: 'parse',
			loc: expressionLoc(exp),
			message: `Unsupported v-for expression referencing "${referencedRoot}" in its source: "${exp.loc.source}"`,
		})
	}
	return patternNamesFromSource(alias, ctx, expressionLoc(exp))
}

function walkElement(node: ElementNode, ctx: TemplateWalkContext): void {
	const introduced: string[] = []
	for (const prop of node.props) {
		if (prop.type !== NODE_DIRECTIVE)
			continue
		if (prop.name === 'for')
			introduced.push(...analyzeVForDirective(prop, ctx))
		else if (prop.name === 'slot')
			introduced.push(...patternNames(prop.exp, ctx))
	}

	// v-for aliases and slot props are visible on the element's own other
	// directives and its whole subtree.
	for (const name of introduced)
		ctx.shadowed.set(name, (ctx.shadowed.get(name) ?? 0) + 1)

	for (const prop of node.props) {
		if (prop.type !== NODE_DIRECTIVE || prop.exp == null || prop.name === 'for' || prop.name === 'slot')
			continue
		analyzeTemplateExpression(prop.exp, prop, ctx)
	}
	walkChildren(node.children, ctx)

	for (const name of introduced) {
		const count = ctx.shadowed.get(name)! - 1
		if (count === 0)
			ctx.shadowed.delete(name)
		else
			ctx.shadowed.set(name, count)
	}
}

function walkChildren(children: TemplateChildNode[], ctx: TemplateWalkContext): void {
	for (const child of children) {
		if (child.type === NODE_ELEMENT)
			walkElement(child, ctx)
		else if (child.type === NODE_INTERPOLATION)
			analyzeTemplateExpression(child.content, null, ctx)
	}
}

function analyzeScriptBlock(block: SFCBlock, id: string, rootConfig: RootConfig, callsByRoot: Map<string, MacroCall[]>): void {
	if (!containsAnyRoot(block.content, rootConfig))
		return
	appendGroupedCalls(callsByRoot, analyzeJsProject(
		block.content,
		id,
		dialectForExtension(block.lang ?? 'js'),
		rootConfig.fnNames,
		{
			offsets: {
				startIndex: block.loc.start.offset,
				startLine: block.loc.start.line,
				startColumn: block.loc.start.column - 1,
			},
		},
	))
}

/**
 * Collects configured macro-root names that `<script>` / `<script setup>` expose
 * to the template so user-defined bindings are treated as shadows. Uses Vue's
 * own compileScript binding metadata.
 */
function collectScriptExposedRoots(
	descriptor: SFCDescriptor,
	id: string,
	rootConfig: RootConfig,
	compileScript: typeof import('@vue/compiler-sfc')['compileScript'],
): string[] {
	const { script, scriptSetup } = descriptor
	if (script == null && scriptSetup == null)
		return []
	const mentionsRoot
		= (script != null && containsAnyRoot(script.content, rootConfig))
			|| (scriptSetup != null && containsAnyRoot(scriptSetup.content, rootConfig))
	if (!mentionsRoot)
		return []
	let bindings: Record<string, unknown> | undefined
	try {
		bindings = compileScript(descriptor, { id }).bindings
	}
	catch {
		return []
	}
	return Object.keys(bindings ?? {})
		.filter(name => rootConfig.roots.has(name))
}

async function analyzeVueProject(code: string, id: string, fnNames: readonly string[]): Promise<AnalyzedProjectModule> {
	const { parse, compileScript } = await import('@vue/compiler-sfc')
	const { descriptor, errors } = parse(code, { filename: id })
	if (errors.length > 0) {
		const first = errors[0] as Error & { loc?: { start: { line: number, column: number } } }
		throw new PikaTransformError({
			id,
			stage: 'parse',
			loc: first.loc == null ? null : { line: first.loc.start.line, column: first.loc.start.column },
			message: `Failed to parse Vue SFC: ${first.message}`,
			cause: first,
		})
	}

	const rootConfig = createRootConfig(fnNames)
	const callsByRoot = new Map<string, MacroCall[]>(fnNames.map(fnName => [fnName, []]))
	for (const block of [descriptor.script, descriptor.scriptSetup]) {
		if (block != null)
			analyzeScriptBlock(block, id, rootConfig, callsByRoot)
	}

	const template = descriptor.template
	if (template != null) {
		if (template.lang != null && template.lang !== 'html') {
			if (containsAnyRoot(template.content, rootConfig)) {
				throw new PikaTransformError({
					id,
					stage: 'parse',
					message: `Vue templates with lang="${template.lang}" are not supported by the PikaCSS transform`,
				})
			}
		}
		else if (template.ast != null && containsAnyRoot(template.content, rootConfig)) {
			const scriptLang = descriptor.scriptSetup?.lang ?? descriptor.script?.lang
			const shadowed = new Map<string, number>()
			for (const name of collectScriptExposedRoots(descriptor, id, rootConfig, compileScript))
				shadowed.set(name, (shadowed.get(name) ?? 0) + 1)
			walkChildren(template.ast.children, {
				id,
				dialect: dialectForExtension(scriptLang ?? 'js'),
				rootConfig,
				callsByRoot,
				shadowed,
			})
		}
	}

	const modules = new Map<string, AnalyzedModule>()
	for (const fnName of fnNames) {
		const calls = callsByRoot.get(fnName) ?? []
		calls.sort((a, b) => a.start - b.start)
		modules.set(fnName, { fnName, id, code, calls })
	}
	return { id, code, modules }
}

/**
 * The Vue SFC processor.
 *
 * @remarks
 * Project analysis parses the SFC once, analyzes each JS/template expression
 * once for all configured roots, and groups calls back to their owning entry.
 * Single-root `analyze` delegates to the same implementation.
 */
export const vueProcessor: FrameworkProcessor = {
	name: 'vue',
	async analyze(code: string, id: string, options: ProcessorOptions): Promise<AnalyzedModule> {
		const fnName = options.fnConfig.fnName
		const project = await analyzeVueProject(code, id, [fnName])
		return project.modules.get(fnName)!
	},
	analyzeProject(code: string, id: string, options: ProcessorProjectOptions): Promise<AnalyzedProjectModule> {
		return analyzeVueProject(code, id, options.fnNames)
	},
}
