import type {
	DirectiveNode,
	ElementNode,
	ExpressionNode,
	SimpleExpressionNode,
	TemplateChildNode,
} from '@vue/compiler-core'
import type { SFCBlock, SFCDescriptor } from '@vue/compiler-sfc'
import type { JsDialect } from '../compiler/parse'
import type { FnConfig } from '../fnConfig'
import type { AnalyzedModule, FrameworkProcessor, MacroCall, ProcessorOptions } from './types'
import * as t from '@babel/types'
import { analyzeJs } from '../compiler/analyze'
import { PikaTransformError } from '../compiler/errors'
import { parseJsExpression } from '../compiler/parse'
import { dialectForExtension } from './js'

// @vue/compiler-core NodeTypes values (the enum itself is not re-exported by
// @vue/compiler-sfc, and importing it at runtime would defeat the lazy load).
const NODE_ELEMENT = 1
const NODE_SIMPLE_EXPRESSION = 4
const NODE_INTERPOLATION = 5
const NODE_DIRECTIVE = 7

interface TemplateWalkContext {
	id: string
	dialect: JsDialect
	fnConfig: FnConfig
	calls: MacroCall[]
	/** Multiset of names shadowed by enclosing v-for aliases / slot props. */
	shadowed: Map<string, number>
}

function containsFnName(source: string, fnConfig: FnConfig): boolean {
	// The base name is the only root, so a
	// plain substring check is a sound fast filter.
	return source.includes(fnConfig.fnName)
}

/**
 * Reads the quote character of a directive's attribute value from the
 * directive's own raw source (`:class="..."` → `"`), replacing the legacy
 * backward-scanning heuristic with an AST-anchored lookup.
 */
function attributeQuote(dir: DirectiveNode): '"' | '\'' | null {
	const source = dir.loc.source
	const eq = source.indexOf('=')
	if (eq === -1) {
		return null
	}
	let i = eq + 1
	while (i < source.length && /\s/.test(source[i]!)) {
		i++
	}
	const char = source[i]
	return char === '"' || char === '\'' ? char : null
}

/**
 * Collects the binding names a pattern source introduces (v-for alias,
 * slot-props destructuring), via a Babel parse of the pattern as an arrow
 * function parameter.
 */
function patternNamesFromSource(source: string, ctx: TemplateWalkContext, loc: { line: number, column: number } | null): string[] {
	// A pattern can only shadow a root when the root's text appears in it.
	if (!containsFnName(source, ctx.fnConfig)) {
		return []
	}
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
	if (exp == null || exp.type !== NODE_SIMPLE_EXPRESSION) {
		return []
	}
	return patternNamesFromSource(exp.loc.source, ctx, expressionLoc(exp))
}

function analyzeTemplateExpression(exp: ExpressionNode, dir: DirectiveNode | null, ctx: TemplateWalkContext): void {
	if (exp.type !== NODE_SIMPLE_EXPRESSION) {
		return
	}
	const source = exp.loc.source
	if (!containsFnName(source, ctx.fnConfig)) {
		return
	}
	const excludedRoots = new Set<string>()
	for (const [name, count] of ctx.shadowed) {
		if (count > 0 && ctx.fnConfig.roots.has(name)) {
			excludedRoots.add(name)
		}
	}
	// The emitted literal must use the opposite quote of the enclosing
	// attribute value; interpolations and unquoted values default to single.
	const quote = dir != null && attributeQuote(dir) === '\'' ? '"' : '\''
	ctx.calls.push(...analyzeJs(source, ctx.id, ctx.dialect, ctx.fnConfig, {
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
	if (exp == null || exp.type !== NODE_SIMPLE_EXPRESSION) {
		return []
	}
	const match = V_FOR_DELIMITER_RE.exec(exp.loc.source)
	if (match == null) {
		return []
	}
	const alias = exp.loc.source.slice(0, match.index)
	const sourceExp = exp.loc.source.slice(match.index + match[0].length)
	if (containsFnName(sourceExp, ctx.fnConfig)) {
		throw new PikaTransformError({
			id: ctx.id,
			stage: 'parse',
			loc: expressionLoc(exp),
			message: `Unsupported v-for expression referencing "${ctx.fnConfig.fnName}" in its source: "${exp.loc.source}"`,
		})
	}
	return patternNamesFromSource(alias, ctx, expressionLoc(exp))
}

function walkElement(node: ElementNode, ctx: TemplateWalkContext): void {
	const introduced: string[] = []
	for (const prop of node.props) {
		if (prop.type !== NODE_DIRECTIVE) {
			continue
		}
		if (prop.name === 'for') {
			introduced.push(...analyzeVForDirective(prop, ctx))
		}
		else if (prop.name === 'slot') {
			introduced.push(...patternNames(prop.exp, ctx))
		}
	}

	// v-for aliases and slot props are visible on the element's own other
	// directives and its whole subtree.
	for (const name of introduced) {
		ctx.shadowed.set(name, (ctx.shadowed.get(name) ?? 0) + 1)
	}

	for (const prop of node.props) {
		if (prop.type !== NODE_DIRECTIVE || prop.exp == null || prop.name === 'for' || prop.name === 'slot') {
			continue
		}
		analyzeTemplateExpression(prop.exp, prop, ctx)
	}
	walkChildren(node.children, ctx)

	for (const name of introduced) {
		const count = ctx.shadowed.get(name)! - 1
		if (count === 0) {
			ctx.shadowed.delete(name)
		}
		else {
			ctx.shadowed.set(name, count)
		}
	}
}

function walkChildren(children: TemplateChildNode[], ctx: TemplateWalkContext): void {
	for (const child of children) {
		if (child.type === NODE_ELEMENT) {
			walkElement(child, ctx)
		}
		else if (child.type === NODE_INTERPOLATION) {
			analyzeTemplateExpression(child.content, null, ctx)
		}
	}
}

function analyzeScriptBlock(block: SFCBlock, id: string, fnConfig: FnConfig): MacroCall[] {
	if (!containsFnName(block.content, fnConfig)) {
		return []
	}
	return analyzeJs(block.content, id, dialectForExtension(block.lang ?? 'js'), fnConfig, {
		offsets: {
			startIndex: block.loc.start.offset,
			startLine: block.loc.start.line,
			startColumn: block.loc.start.column - 1,
		},
	})
}

/**
 * Collects the macro-root names that `<script>` / `<script setup>` expose to the
 * template, so a user-defined binding (e.g. `const pika = ...`) is treated as a
 * shadow rather than a PikaCSS macro. Uses `@vue/compiler-sfc` binding metadata,
 * which mirrors Vue's own template-scope resolution (setup bindings, imports,
 * props, Options-API returns).
 *
 * @remarks
 * Gated on a script block actually mentioning a root name — the compileScript
 * pass is skipped entirely for the common case where `pika()` appears only in
 * the template. A compileScript failure conservatively yields no shadow (the
 * underlying script error surfaces through the normal transform path).
 */
function collectScriptExposedRoots(
	descriptor: SFCDescriptor,
	id: string,
	fnConfig: FnConfig,
	compileScript: typeof import('@vue/compiler-sfc')['compileScript'],
): string[] {
	const { script, scriptSetup } = descriptor
	if (script == null && scriptSetup == null) {
		return []
	}
	const mentionsRoot
		= (script != null && containsFnName(script.content, fnConfig))
			|| (scriptSetup != null && containsFnName(scriptSetup.content, fnConfig))
	if (!mentionsRoot) {
		return []
	}
	let bindings: Record<string, unknown> | undefined
	try {
		bindings = compileScript(descriptor, { id }).bindings
	}
	catch {
		return []
	}
	return Object.keys(bindings ?? {})
		.filter(name => fnConfig.roots.has(name))
}

/**
 * The Vue SFC processor.
 *
 * @remarks
 * Parses the SFC with `@vue/compiler-sfc` (lazily imported so non-Vue projects
 * never load it), runs the JS/TS compiler over `<script>`/`<script setup>`
 * with block offsets applied, and walks the template AST analyzing
 * interpolations and directive expressions. Node positions in the template AST
 * are absolute into the SFC source, so all returned ranges address the
 * original `.vue` file directly. Template-scope shadowing (`v-for` aliases,
 * `v-slot` props) excludes shadowed roots within the affected subtree.
 */
export const vueProcessor: FrameworkProcessor = {
	name: 'vue',
	async analyze(code: string, id: string, options: ProcessorOptions): Promise<AnalyzedModule> {
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

		const { fnConfig } = options
		const calls: MacroCall[] = []

		for (const block of [descriptor.script, descriptor.scriptSetup]) {
			if (block != null) {
				calls.push(...analyzeScriptBlock(block, id, fnConfig))
			}
		}

		const template = descriptor.template
		if (template != null) {
			if (template.lang != null && template.lang !== 'html') {
				if (containsFnName(template.content, fnConfig)) {
					throw new PikaTransformError({
						id,
						stage: 'parse',
						message: `Vue templates with lang="${template.lang}" are not supported by the PikaCSS transform`,
					})
				}
			}
			else if (template.ast != null && containsFnName(template.content, fnConfig)) {
				const scriptLang = descriptor.scriptSetup?.lang ?? descriptor.script?.lang
				// Seed the template shadow set with script-exposed bindings so a
				// user-defined `pika` in <script setup> is not mistaken for a macro.
				const shadowed = new Map<string, number>()
				for (const name of collectScriptExposedRoots(descriptor, id, fnConfig, compileScript)) {
					shadowed.set(name, (shadowed.get(name) ?? 0) + 1)
				}
				walkChildren(template.ast.children, {
					id,
					dialect: dialectForExtension(scriptLang ?? 'js'),
					fnConfig,
					calls,
					shadowed,
				})
			}
		}

		calls.sort((a, b) => a.start - b.start)
		return { id, code, calls }
	},
}
