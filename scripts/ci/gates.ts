import ts from 'typescript'

/**
 * Pure logic for the pull-request gates. Kept separate from `pr-gates.ts` so it
 * can be unit tested without a git repository.
 *
 * These gates encode the rules from AGENTS.md that a contributor who never read
 * AGENTS.md would otherwise break. CI carries no LLM reviewer, so anything
 * expressible as a script belongs here rather than in prose.
 */

/** A path that must never be hand-edited, with the command that regenerates it. */
export interface ForbiddenPathRule {
	/** Human-readable reason, used in the failure message. */
	reason: string
	/** What to run instead of editing by hand, when a generator owns the file. */
	remedy: string
	/** Returns true when `path` is covered by this rule. */
	matches: (path: string) => boolean
}

export const FORBIDDEN_PATH_RULES: ForbiddenPathRule[] = [
	// Tracked generated outputs (docs/api/*.md, packages/core/src/generated/**)
	// are deliberately NOT listed here: their invariant is "committed bytes
	// equal generator output", which the CI codegen-drift step enforces by
	// re-running the generators and requiring a clean tree. A path ban here
	// would also reject legitimate source-driven regeneration.
	{
		reason: 'build-time output of the PikaCSS engine',
		remedy: 'let the build regenerate it; never commit it',
		matches: path => /(?:^|\/)pika\.gen\.[^/]+$/.test(path),
	},
]

/** The docs example harness whose pipeline shape is protected by invariant, not by byte-freeze. */
export const EXAMPLE_HARNESS_PATH = 'docs/.examples/_utils/pika-example.ts'

/**
 * The example harness must keep driving examples through the real Integration
 * transform pipeline via the repository-private inline-config test seam.
 * Mechanical/type-driven maintenance is allowed; replacing the pipeline with
 * direct `createEngine`/`engine.use()` execution is not, because that bypasses
 * compiler extraction/rewrite and silently invalidates every docs example.
 */
export function exampleHarnessViolations(content: string): string[] {
	const violations: string[] = []
	if (!/import\s+\{[^}]*\bcreateInlineIntegrationTestContext\b[^}]*\}\s+from\s+'@pikacss\/integration\/testing'/.test(content))
		violations.push('must use the repository-private Integration inline-config test harness')
	if (!content.includes('ctx.transform('))
		violations.push('must route example source through the context transform pipeline (`ctx.transform(...)`)')
	if (/\bcreateEngine\s*\(/.test(content))
		violations.push('must not construct an engine directly with `createEngine(...)`')
	if (/\bengine\.use\s*\(/.test(content))
		violations.push('must not resolve styles directly with `engine.use(...)`')
	return violations
}

const LOCAL_ICON_DEPENDENCY_FIELDS = ['dependencies', 'devDependencies', 'optionalDependencies'] as const
const NODE_ONLY_ICON_OPTIONS = ['autoInstall', 'cwd'] as const
const CONFIG_EXTENSIONS = '{ts,mts,cts,js,mjs,cjs}'

/**
 * Config-shaped paths covered by the static local-icon gate.
 *
 * The host auto-discovers only `pika.config.{ts,mts,js,mjs}`, while an
 * explicitly selected config may use any host-supported extension, including
 * `.cts` and `.cjs`. The remaining patterns are the bounded config names used
 * by this repository's integration/examples (`config/pika.*`,
 * `config/project.*`, `pika.custom.*` and the two example suffixes). Arbitrary
 * `config: 'some/path.ts'` values
 * supplied by an external project cannot be discovered from this checkout
 * without treating every source file as a possible config, so they are an
 * intentional limitation of this path-based CI gate.
 */
export const LOCAL_ICON_CONFIG_GLOBS = Object.freeze([
	`**/pika.config.${CONFIG_EXTENSIONS}`,
	`**/{config,configs}/pika.${CONFIG_EXTENSIONS}`,
	`**/{config,configs}/project.${CONFIG_EXTENSIONS}`,
	`**/{pika.custom,pikacss.config,custom.config}.${CONFIG_EXTENSIONS}`,
	`**/*.{setup,config}.example.${CONFIG_EXTENSIONS}`,
])

function directPropertyName(node: ts.PropertyName): string | undefined {
	if (ts.isIdentifier(node) || ts.isStringLiteral(node) || ts.isNumericLiteral(node))
		return node.text
	return undefined
}

interface VariableBinding {
	readonly initializer: ts.Expression
	readonly variables: ReadonlyMap<string, VariableBinding>
}

type VariableBindings = ReadonlyMap<string, VariableBinding>

interface ResolvedStaticExpression {
	readonly expression: ts.Expression
	readonly variables: VariableBindings
}

function staticPropertyKey(
	expression: ts.Expression,
	variables: VariableBindings,
	seen = new Set<string>(),
): string | undefined {
	const current = unwrapExpression(expression)
	if (ts.isStringLiteralLike(current) || ts.isNumericLiteral(current))
		return current.text
	if (!ts.isIdentifier(current) || seen.has(current.text))
		return undefined
	const binding = variables.get(current.text)
	if (binding == null)
		return undefined
	const nextSeen = new Set(seen)
	nextSeen.add(current.text)
	return staticPropertyKey(binding.initializer, binding.variables, nextSeen)
}

function resolvePropertyName(
	node: ts.PropertyName,
	variables: VariableBindings,
): string | undefined {
	const direct = directPropertyName(node)
	if (direct != null)
		return direct
	return ts.isComputedPropertyName(node)
		? staticPropertyKey(node.expression, variables)
		: undefined
}

function unwrapExpression(expression: ts.Expression): ts.Expression {
	let current = expression
	while (ts.isParenthesizedExpression(current)
		|| ts.isAsExpression(current)
		|| ts.isSatisfiesExpression(current)
		|| ts.isTypeAssertionExpression(current)) {
		current = current.expression
	}
	return current
}

function assignTopLevelVariable(
	variables: Map<string, VariableBinding>,
	target: ts.Expression,
	value: ts.Expression | undefined,
): void {
	const current = unwrapExpression(target)
	if (ts.isIdentifier(current)) {
		if (value == null)
			variables.delete(current.text)
		else
			variables.set(current.text, { initializer: value, variables: new Map(variables) })
		return
	}
	if (ts.isArrayLiteralExpression(current) || ts.isObjectLiteralExpression(current)) {
		const children = ts.isArrayLiteralExpression(current) ? current.elements : current.properties
		for (const child of children) {
			if (ts.isSpreadAssignment(child))
				assignTopLevelVariable(variables, child.expression, undefined)
			else if (ts.isPropertyAssignment(child))
				assignTopLevelVariable(variables, child.initializer, undefined)
			else if (ts.isShorthandPropertyAssignment(child))
				assignTopLevelVariable(variables, child.name, undefined)
			else if (ts.isExpression(child))
				assignTopLevelVariable(variables, child, undefined)
		}
	}
}

function collectVariableInitializers(
	variables: Map<string, VariableBinding>,
	statement: ts.Statement,
): void {
	if (ts.isExpressionStatement(statement)
		&& ts.isBinaryExpression(statement.expression)
		&& isAssignmentOperator(statement.expression.operatorToken.kind)) {
		assignTopLevelVariable(
			variables,
			statement.expression.left,
			statement.expression.operatorToken.kind === ts.SyntaxKind.EqualsToken
				? statement.expression.right
				: undefined,
		)
		return
	}
	if (!ts.isVariableStatement(statement))
		return
	for (const declaration of statement.declarationList.declarations) {
		if (declaration.initializer == null)
			continue
		if (ts.isIdentifier(declaration.name)) {
			variables.set(declaration.name.text, { initializer: declaration.initializer, variables: new Map(variables) })
			continue
		}
		if (!ts.isObjectBindingPattern(declaration.name))
			continue
		for (const element of declaration.name.elements) {
			if (!ts.isBindingElement(element) || !ts.isIdentifier(element.name) || element.dotDotDotToken != null)
				continue
			const propertyName = element.propertyName ?? element.name
			if (ts.isIdentifier(propertyName) || ts.isStringLiteral(propertyName) || ts.isNumericLiteral(propertyName)) {
				variables.set(element.name.text, {
					initializer: ts.factory.createPropertyAccessExpression(declaration.initializer, propertyName.text),
					variables: new Map(variables),
				})
			}
		}
	}
}

function resolveObjectProperty(
	expression: ts.Expression | undefined,
	propertyName: string,
	variables: VariableBindings,
	seen = new Set<string>(),
): ts.Expression | undefined {
	if (expression == null)
		return undefined
	const current = unwrapExpression(expression)
	if (ts.isPropertyAccessExpression(current) && current.name.text === propertyName)
		return resolveObjectProperty(current.expression, propertyName, variables, seen)
	if (ts.isElementAccessExpression(current)
		&& current.argumentExpression != null
		&& ts.isStringLiteralLike(current.argumentExpression)
		&& current.argumentExpression.text === propertyName) {
		return resolveObjectProperty(current.expression, propertyName, variables, seen)
	}
	if (ts.isIdentifier(current)) {
		if (seen.has(current.text))
			return undefined
		const binding = variables.get(current.text)
		if (binding == null)
			return undefined
		const nextSeen = new Set(seen)
		nextSeen.add(current.text)
		return resolveObjectProperty(binding.initializer, propertyName, binding.variables, nextSeen)
	}
	if (!ts.isObjectLiteralExpression(current))
		return undefined

	let resolved: ts.Expression | undefined
	for (const property of current.properties) {
		if (ts.isSpreadAssignment(property)) {
			const spreadValue = resolveObjectProperty(property.expression, propertyName, variables, new Set(seen))
			if (spreadValue != null)
				resolved = spreadValue
			continue
		}
		if (resolvePropertyName(property.name, variables) !== propertyName)
			continue
		if (ts.isPropertyAssignment(property))
			resolved = property.initializer
		else if (ts.isShorthandPropertyAssignment(property))
			resolved = property.name
	}
	return resolved
}

interface ResolvedObjectPropertyValues {
	readonly values: ResolvedStaticExpression[]
	/** True when every possible value defines the requested property. */
	readonly definitelyDefines: boolean
	/** True when at least one possible value defines the requested property. */
	readonly possiblyDefines: boolean
}

function resolveObjectPropertyValueResult(
	expression: ts.Expression | undefined,
	propertyName: string,
	variables: VariableBindings,
	seen = new Set<string>(),
	unknownMayDefine = false,
): ResolvedObjectPropertyValues {
	if (expression == null)
		return { values: [], definitelyDefines: false, possiblyDefines: false }
	const current = unwrapExpression(expression)
	if ((ts.isPropertyAccessExpression(current) && current.name.text === propertyName)
		|| (ts.isElementAccessExpression(current)
			&& current.argumentExpression != null
			&& ts.isStringLiteralLike(current.argumentExpression)
			&& current.argumentExpression.text === propertyName)) {
		return resolveObjectPropertyValueResult(current.expression, propertyName, variables, seen, unknownMayDefine)
	}
	if (ts.isIdentifier(current)) {
		if (seen.has(current.text))
			return { values: [], definitelyDefines: false, possiblyDefines: unknownMayDefine }
		const binding = variables.get(current.text)
		if (binding == null)
			return { values: [], definitelyDefines: false, possiblyDefines: unknownMayDefine }
		const nextSeen = new Set(seen)
		nextSeen.add(current.text)
		return resolveObjectPropertyValueResult(binding.initializer, propertyName, binding.variables, nextSeen, unknownMayDefine)
	}
	if (ts.isConditionalExpression(current)) {
		const condition = staticallyKnownBoolean(current.condition, variables)
		if (condition === true)
			return resolveObjectPropertyValueResult(current.whenTrue, propertyName, variables, seen, unknownMayDefine)
		if (condition === false)
			return resolveObjectPropertyValueResult(current.whenFalse, propertyName, variables, seen, unknownMayDefine)
		const whenTrue = resolveObjectPropertyValueResult(current.whenTrue, propertyName, variables, new Set(seen), unknownMayDefine)
		const whenFalse = resolveObjectPropertyValueResult(current.whenFalse, propertyName, variables, new Set(seen), unknownMayDefine)
		return {
			values: [...whenTrue.values, ...whenFalse.values],
			definitelyDefines: whenTrue.definitelyDefines && whenFalse.definitelyDefines,
			possiblyDefines: whenTrue.possiblyDefines || whenFalse.possiblyDefines,
		}
	}
	if (ts.isBinaryExpression(current)) {
		const operator = current.operatorToken.kind
		if (operator === ts.SyntaxKind.BarBarToken || operator === ts.SyntaxKind.AmpersandAmpersandToken || operator === ts.SyntaxKind.QuestionQuestionToken) {
			const leftValue = operator === ts.SyntaxKind.QuestionQuestionToken
				? staticallyKnownNullish(current.left, variables)
				: staticallyKnownBoolean(current.left, variables)
			if (leftValue === true)
				return resolveObjectPropertyValueResult(operator === ts.SyntaxKind.BarBarToken ? current.left : current.right, propertyName, variables, seen, unknownMayDefine)
			if (leftValue === false)
				return resolveObjectPropertyValueResult(operator === ts.SyntaxKind.BarBarToken ? current.right : current.left, propertyName, variables, seen, unknownMayDefine)
			const left = resolveObjectPropertyValueResult(current.left, propertyName, variables, new Set(seen), unknownMayDefine)
			const right = resolveObjectPropertyValueResult(current.right, propertyName, variables, new Set(seen), unknownMayDefine)
			return {
				values: [...left.values, ...right.values],
				definitelyDefines: left.definitelyDefines && right.definitelyDefines,
				possiblyDefines: left.possiblyDefines || right.possiblyDefines,
			}
		}
	}
	if (!ts.isObjectLiteralExpression(current))
		return { values: [], definitelyDefines: false, possiblyDefines: unknownMayDefine }

	let resolved: ResolvedStaticExpression[] = []
	let definitelyDefines = false
	let possiblyDefines = false
	for (const property of current.properties) {
		if (ts.isSpreadAssignment(property)) {
			const spread = resolveObjectPropertyValueResult(property.expression, propertyName, variables, new Set(seen), true)
			if (spread.definitelyDefines)
				resolved = spread.values
			else if (spread.possiblyDefines)
				resolved.push(...spread.values)
			if (spread.definitelyDefines) {
				definitelyDefines = true
				possiblyDefines = true
			}
			else if (spread.possiblyDefines) {
				definitelyDefines = false
				possiblyDefines = true
			}
			continue
		}
		const resolvedName = resolvePropertyName(property.name, variables)
		if (resolvedName == null) {
			possiblyDefines = true
			if (ts.isPropertyAssignment(property))
				resolved.push({ expression: property.initializer, variables })
			else if (ts.isShorthandPropertyAssignment(property))
				resolved.push({ expression: property.name, variables })
			definitelyDefines = false
			continue
		}
		if (resolvedName !== propertyName)
			continue
		if (ts.isPropertyAssignment(property))
			resolved = [{ expression: property.initializer, variables }]
		else if (ts.isShorthandPropertyAssignment(property))
			resolved = [{ expression: property.name, variables }]
		definitelyDefines = true
		possiblyDefines = true
	}
	return { values: resolved, definitelyDefines, possiblyDefines }
}

interface IconAnalysisContext {
	readonly variables: VariableBindings
	readonly rootEnvironment: LexicalEnvironment
	budgetExceeded: boolean
}

interface LexicalEnvironment {
	readonly parent?: LexicalEnvironment
	readonly bindings: Map<string, LexicalBinding>
	readonly bindingOwners: Map<string, LexicalEnvironment>
	readonly isolated: boolean
	functionScope: LexicalEnvironment
}

interface LexicalBinding {
	readonly kind: 'unknown' | 'initializer' | 'function' | 'neutralFactory' | 'neutralNamespace' | 'union'
	readonly initializer?: ts.Expression
	readonly declaration?: ts.FunctionLikeDeclaration
	readonly environment: LexicalEnvironment
	readonly initializerEnvironment?: LexicalEnvironment
	readonly alternatives?: readonly LexicalBinding[]
}

interface ResolvedExpression {
	readonly expression: ts.Expression
	readonly environment: LexicalEnvironment
}

interface FunctionCandidate {
	readonly declaration: ts.FunctionLikeDeclaration
	readonly environment: LexicalEnvironment
}

function newLexicalEnvironment(parent?: LexicalEnvironment, isolated = false): LexicalEnvironment {
	const environment = {
		parent,
		bindings: new Map<string, LexicalBinding>(),
		bindingOwners: new Map<string, LexicalEnvironment>(),
		isolated,
		functionScope: undefined as unknown as LexicalEnvironment,
	}
	environment.functionScope = parent?.functionScope ?? environment
	return environment
}

function newFunctionEnvironment(closure: LexicalEnvironment): LexicalEnvironment {
	const environment = newLexicalEnvironment(closure)
	environment.functionScope = environment
	return environment
}

function snapshotEnvironment(environment: LexicalEnvironment): LexicalEnvironment {
	const snapshot = newLexicalEnvironment(environment.parent == null ? undefined : snapshotEnvironment(environment.parent))
	for (const [name, binding] of environment.bindings) {
		setEnvironmentBinding(snapshot, name, binding, environment.bindingOwners.get(name) ?? environment)
	}
	return snapshot
}

const MAX_RESOLVED_FLOW_VALUES = 64
const objectIds = new WeakMap<object, number>()
let nextObjectId = 1

function objectId(value: object): number {
	const existing = objectIds.get(value)
	if (existing != null)
		return existing
	const id = nextObjectId++
	objectIds.set(value, id)
	return id
}

function bindingAlternatives(binding: LexicalBinding): readonly LexicalBinding[] {
	return binding.kind === 'union'
		? binding.alternatives ?? []
		: [binding]
}

function resolvedExpressionKey(value: ResolvedExpression): string {
	const bindings: number[] = []
	const visit = (node: ts.Node): void => {
		if (ts.isIdentifier(node)) {
			const parent = node.parent
			const isPropertyName = (ts.isPropertyAccessExpression(parent) && parent.name === node)
				|| (ts.isPropertyAssignment(parent) && parent.name === node)
				|| (ts.isMethodDeclaration(parent) && parent.name === node)
				|| (ts.isVariableDeclaration(parent) && parent.name === node)
				|| (ts.isParameter(parent) && parent.name === node)
				|| (ts.isFunctionDeclaration(parent) && parent.name === node)
			if (!isPropertyName) {
				const binding = lexicalBinding(value.environment, node.text)
				if (binding != null)
					bindings.push(objectId(binding))
			}
		}
		if (ts.isFunctionExpression(node) || ts.isArrowFunction(node) || ts.isClassExpression(node))
			return
		ts.forEachChild(node, visit)
	}
	visit(value.expression)
	bindings.sort((left, right) => left - right)
	return `${objectId(value.expression)}:${bindings.join(',')}`
}

function boundResolvedExpressions(
	values: readonly ResolvedExpression[],
	context: IconAnalysisContext,
): ResolvedExpression[] {
	const result: ResolvedExpression[] = []
	const seen = new Set<string>()
	for (const value of values) {
		const key = resolvedExpressionKey(value)
		if (seen.has(key))
			continue
		if (result.length >= MAX_RESOLVED_FLOW_VALUES) {
			context.budgetExceeded = true
			break
		}
		seen.add(key)
		result.push(value)
	}
	return result
}

function collectBindingNames(name: ts.BindingName, names: string[]): void {
	if (ts.isIdentifier(name)) {
		names.push(name.text)
		return
	}
	for (const element of name.elements) {
		if (ts.isBindingElement(element))
			collectBindingNames(element.name, names)
	}
}

function setUnknownBindings(environment: LexicalEnvironment, name: ts.BindingName): void {
	const names: string[] = []
	collectBindingNames(name, names)
	for (const bindingName of names)
		setEnvironmentBinding(environment, bindingName, { kind: 'unknown', environment })
}

function setEnvironmentBinding(
	environment: LexicalEnvironment,
	name: string,
	binding: LexicalBinding,
	owner = environment,
): void {
	environment.bindings.set(name, binding)
	environment.bindingOwners.set(name, owner)
}

function invalidateRootBindings(environment: LexicalEnvironment, target: ts.Expression): void {
	const current = unwrapExpression(target)
	if (ts.isIdentifier(current)) {
		setEnvironmentBinding(environment, current.text, { kind: 'unknown', environment })
		return
	}
	if (ts.isArrayLiteralExpression(current)) {
		for (const element of current.elements) {
			if (ts.isExpression(element))
				invalidateRootBindings(environment, element)
		}
		return
	}
	if (ts.isObjectLiteralExpression(current)) {
		for (const property of current.properties) {
			if (ts.isSpreadAssignment(property))
				invalidateRootBindings(environment, property.expression)
			else if (ts.isPropertyAssignment(property))
				invalidateRootBindings(environment, property.initializer)
			else if (ts.isShorthandPropertyAssignment(property))
				invalidateRootBindings(environment, property.name)
		}
	}
}

function setInitializerBinding(
	environment: LexicalEnvironment,
	name: ts.BindingName,
	initializer: ts.Expression | undefined,
	initializerEnvironment = environment,
): void {
	if (initializer == null) {
		setUnknownBindings(environment, name)
		return
	}
	if (ts.isIdentifier(name)) {
		setEnvironmentBinding(environment, name.text, {
			kind: 'initializer',
			initializer,
			environment,
			initializerEnvironment: isLexicalClosureExpression(initializer)
				? initializerEnvironment
				: snapshotEnvironment(initializerEnvironment),
		}, environment)
		return
	}
	if (ts.isArrayBindingPattern(name)) {
		for (let index = 0; index < name.elements.length; index++) {
			const element = name.elements[index]
			if (element == null || !ts.isBindingElement(element) || element.dotDotDotToken != null)
				continue
			setInitializerBinding(
				environment,
				element.name,
				ts.factory.createElementAccessExpression(initializer, ts.factory.createNumericLiteral(index)),
				initializerEnvironment,
			)
		}
		return
	}
	for (const element of name.elements) {
		if (!ts.isBindingElement(element) || element.dotDotDotToken != null)
			continue
		const propertyName = element.propertyName ?? element.name
		if (!ts.isIdentifier(propertyName) && !ts.isStringLiteral(propertyName) && !ts.isNumericLiteral(propertyName)) {
			continue
		}
		setInitializerBinding(
			environment,
			element.name,
			ts.factory.createPropertyAccessExpression(initializer, propertyName.text),
			initializerEnvironment,
		)
	}
}

function bindingOwner(environment: LexicalEnvironment, name: string, binding: LexicalBinding): LexicalEnvironment | undefined {
	let current: LexicalEnvironment | undefined = environment
	while (current != null) {
		if (current.bindings.get(name) === binding)
			return current.bindingOwners.get(name) ?? current
		current = current.parent
	}
	return undefined
}

function unionBindings(
	bindings: readonly LexicalBinding[],
	environment: LexicalEnvironment,
	context: IconAnalysisContext,
): LexicalBinding {
	const alternatives: LexicalBinding[] = []
	const seen = new Set<LexicalBinding>()
	for (const binding of bindings) {
		for (const alternative of bindingAlternatives(binding)) {
			if (alternatives.length >= MAX_RESOLVED_FLOW_VALUES) {
				context.budgetExceeded = true
				break
			}
			if (!seen.has(alternative)) {
				seen.add(alternative)
				alternatives.push(alternative)
			}
		}
	}
	const first = alternatives[0]
	if (first != null && alternatives.length === 1)
		return first
	return { kind: 'union', alternatives, environment }
}

function bindingFromAssignment(
	environment: LexicalEnvironment,
	value: ts.Expression | undefined,
	valueEnvironment: LexicalEnvironment,
): LexicalBinding {
	return value == null
		? { kind: 'unknown', environment }
		: {
				kind: 'initializer',
				initializer: value,
				environment,
				initializerEnvironment: isLexicalClosureExpression(value)
					? valueEnvironment
					: snapshotEnvironment(valueEnvironment),
			}
}

function isLexicalClosureExpression(expression: ts.Expression): boolean {
	const current = unwrapExpression(expression)
	if (ts.isArrowFunction(current) || ts.isFunctionExpression(current))
		return true
	if (ts.isConditionalExpression(current)) {
		return isLexicalClosureExpression(current.whenTrue)
			|| isLexicalClosureExpression(current.whenFalse)
	}
	if (ts.isBinaryExpression(current)
		&& (current.operatorToken.kind === ts.SyntaxKind.BarBarToken
			|| current.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken
			|| current.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken)) {
		return isLexicalClosureExpression(current.left)
			|| isLexicalClosureExpression(current.right)
	}
	return false
}

interface AssignmentEffect {
	readonly name: string
	readonly binding: LexicalBinding
	readonly owner: LexicalEnvironment
}

interface AssignmentEffects {
	readonly assignments?: ReadonlyMap<string, LexicalBinding>
	readonly assignmentOwners?: ReadonlyMap<string, LexicalEnvironment>
	readonly thrownAssignments?: ReadonlyMap<string, LexicalBinding>
	readonly thrownAssignmentOwners?: ReadonlyMap<string, LexicalEnvironment>
	readonly mayThrow?: boolean
}

function assignLexicalIdentifier(
	environment: LexicalEnvironment,
	target: ts.Expression,
	value: ts.Expression | undefined,
	valueEnvironment: LexicalEnvironment,
): AssignmentEffect | undefined {
	const current = unwrapExpression(target)
	if (!ts.isIdentifier(current))
		return undefined
	const existing = lexicalBinding(environment, current.text)
	if (existing == null)
		return undefined
	const binding = bindingFromAssignment(environment, value, valueEnvironment)
	const owner = bindingOwner(environment, current.text, existing) ?? environment
	setEnvironmentBinding(environment, current.text, binding, owner)
	return { name: current.text, binding, owner }
}

function bindingInitializerEnvironment(binding: LexicalBinding): LexicalEnvironment {
	return binding.initializerEnvironment ?? binding.environment
}

function lexicalEnvironmentFromVariables(
	variables: VariableBindings,
	parent: LexicalEnvironment,
	cache = new Map<VariableBindings, LexicalEnvironment>(),
): LexicalEnvironment {
	const cached = cache.get(variables)
	if (cached != null)
		return cached
	const environment = newLexicalEnvironment(parent)
	cache.set(variables, environment)
	for (const [name, binding] of variables) {
		setEnvironmentBinding(environment, name, {
			kind: 'initializer',
			initializer: binding.initializer,
			environment,
			initializerEnvironment: lexicalEnvironmentFromVariables(binding.variables, parent, cache),
		})
	}
	return environment
}

function lexicalBinding(environment: LexicalEnvironment, name: string): LexicalBinding | undefined {
	let current: LexicalEnvironment | undefined = environment
	while (current != null) {
		const binding = current.bindings.get(name)
		if (binding != null)
			return binding
		current = current.parent
	}
	return undefined
}

function createRootEnvironment(
	source: ts.SourceFile,
	neutralIconBindings: ReadonlySet<string>,
	neutralIconNamespaces: ReadonlySet<string>,
	throughStatement = source.statements.length - 1,
	variableSnapshot?: VariableBindings,
): LexicalEnvironment {
	const environment = newLexicalEnvironment()
	for (let statementIndex = 0; statementIndex < source.statements.length; statementIndex++) {
		const statement = source.statements[statementIndex]
		if (statement == null)
			continue
		if (ts.isImportDeclaration(statement)
			&& ts.isStringLiteral(statement.moduleSpecifier)
			&& statement.moduleSpecifier.text === '@pikacss/plugin-icons') {
			const bindings = statement.importClause?.namedBindings
			if (bindings != null && ts.isNamedImports(bindings)) {
				for (const element of bindings.elements) {
					const name = element.name.text
					if (neutralIconBindings.has(name))
						setEnvironmentBinding(environment, name, { kind: 'neutralFactory', environment })
				}
			}
			else if (bindings != null && ts.isNamespaceImport(bindings)) {
				const name = bindings.name.text
				if (neutralIconNamespaces.has(name))
					setEnvironmentBinding(environment, name, { kind: 'neutralNamespace', environment })
			}
			continue
		}
		if (ts.isImportEqualsDeclaration(statement)
			&& ts.isExternalModuleReference(statement.moduleReference)
			&& ts.isStringLiteralLike(statement.moduleReference.expression)
			&& statement.moduleReference.expression.text === '@pikacss/plugin-icons') {
			setEnvironmentBinding(environment, statement.name.text, { kind: 'neutralNamespace', environment })
			continue
		}
		if (statementIndex > throughStatement
			&& !ts.isFunctionDeclaration(statement)) {
			continue
		}
		if (ts.isVariableStatement(statement)) {
			for (const declaration of statement.declarationList.declarations)
				setInitializerBinding(environment, declaration.name, declaration.initializer)
			continue
		}
		if (ts.isExpressionStatement(statement)
			&& ts.isBinaryExpression(statement.expression)
			&& isAssignmentOperator(statement.expression.operatorToken.kind)) {
			const assignment = statement.expression
			if (assignment.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isIdentifier(assignment.left))
				setInitializerBinding(environment, assignment.left, assignment.right)
			else
				invalidateRootBindings(environment, assignment.left)
			continue
		}
		if (ts.isFunctionDeclaration(statement) && statement.name != null) {
			setEnvironmentBinding(environment, statement.name.text, {
				kind: 'function',
				declaration: statement,
				environment,
			})
		}
	}
	if (variableSnapshot != null) {
		const snapshotCache = new Map<VariableBindings, LexicalEnvironment>()
		for (const [name, binding] of variableSnapshot) {
			setEnvironmentBinding(environment, name, {
				kind: 'initializer',
				initializer: binding.initializer,
				environment,
				initializerEnvironment: lexicalEnvironmentFromVariables(binding.variables, environment, snapshotCache),
			})
		}
	}
	return environment
}

function isNeutralRequire(expression: ts.Expression, nodeEntry: '' | '/node', environment: LexicalEnvironment): boolean {
	const current = unwrapExpression(expression)
	const argument = ts.isCallExpression(current) ? current.arguments[0] : undefined
	return ts.isCallExpression(current)
		&& ts.isIdentifier(current.expression)
		&& current.expression.text === 'require'
		&& lexicalBinding(environment, 'require') == null
		&& current.arguments.length === 1
		&& argument != null
		&& ts.isStringLiteralLike(argument)
		&& argument.text === `@pikacss/plugin-icons${nodeEntry}`
}

function isStaticallyKnownObject(expression: ts.Expression, variables: VariableBindings, seen = new Set<string>()): boolean {
	const current = unwrapExpression(expression)
	if (ts.isIdentifier(current)) {
		if (current.text === 'undefined' || seen.has(current.text))
			return current.text === 'undefined'
		const binding = variables.get(current.text)
		if (binding == null)
			return false
		const nextSeen = new Set(seen)
		nextSeen.add(current.text)
		return isStaticallyKnownObject(binding.initializer, binding.variables, nextSeen)
	}
	if (!ts.isObjectLiteralExpression(current))
		return false
	return current.properties.every((property) => {
		if (!ts.isSpreadAssignment(property))
			return resolvePropertyName(property.name, variables) != null
		return isStaticallyKnownObject(property.expression, variables, new Set(seen))
	})
}

function resolveVariableExpression(
	expression: ts.Expression,
	variables: VariableBindings,
	seen = new Set<string>(),
): ResolvedStaticExpression {
	let current = unwrapExpression(expression)
	while (ts.isIdentifier(current)) {
		if (seen.has(current.text))
			break
		const binding = variables.get(current.text)
		if (binding == null)
			break
		seen.add(current.text)
		current = unwrapExpression(binding.initializer)
		variables = binding.variables
	}
	return { expression: current, variables }
}

function staticallyKnownBoolean(
	expression: ts.Expression,
	variables: VariableBindings,
	seen = new Set<string>(),
): boolean | undefined {
	const current = unwrapExpression(expression)
	if (current.kind === ts.SyntaxKind.TrueKeyword)
		return true
	if (current.kind === ts.SyntaxKind.FalseKeyword || current.kind === ts.SyntaxKind.NullKeyword)
		return false
	if (ts.isIdentifier(current)) {
		if (current.text === 'undefined' || seen.has(current.text))
			return current.text === 'undefined' ? false : undefined
		const binding = variables.get(current.text)
		if (binding == null)
			return undefined
		const nextSeen = new Set(seen)
		nextSeen.add(current.text)
		return staticallyKnownBoolean(binding.initializer, binding.variables, nextSeen)
	}
	if (ts.isPrefixUnaryExpression(current) && current.operator === ts.SyntaxKind.ExclamationToken) {
		const value = staticallyKnownBoolean(current.operand, variables, seen)
		return value == null ? undefined : !value
	}
	if (ts.isArrowFunction(current)
		|| ts.isFunctionExpression(current)
		|| ts.isObjectLiteralExpression(current)
		|| ts.isArrayLiteralExpression(current)
		|| ts.isClassExpression(current)) {
		return true
	}
	if (ts.isStringLiteralLike(current))
		return current.text.length > 0
	if (ts.isNumericLiteral(current))
		return Number(current.text) !== 0
	return undefined
}

function staticallyKnownNullish(
	expression: ts.Expression,
	variables: VariableBindings,
	seen = new Set<string>(),
): boolean | undefined {
	const current = unwrapExpression(expression)
	if (current.kind === ts.SyntaxKind.NullKeyword)
		return true
	if (ts.isIdentifier(current)) {
		if (current.text === 'undefined' || seen.has(current.text))
			return current.text === 'undefined' ? true : undefined
		const binding = variables.get(current.text)
		if (binding == null)
			return undefined
		const nextSeen = new Set(seen)
		nextSeen.add(current.text)
		return staticallyKnownNullish(binding.initializer, binding.variables, nextSeen)
	}
	if (ts.isVoidExpression(current))
		return true
	if (current.kind === ts.SyntaxKind.TrueKeyword
		|| current.kind === ts.SyntaxKind.FalseKeyword
		|| ts.isStringLiteralLike(current)
		|| ts.isNumericLiteral(current)
		|| ts.isArrowFunction(current)
		|| ts.isFunctionExpression(current)
		|| ts.isObjectLiteralExpression(current)
		|| ts.isArrayLiteralExpression(current)
		|| ts.isClassExpression(current)) {
		return false
	}
	return undefined
}

function lexicalBoolean(
	expression: ts.Expression,
	environment: LexicalEnvironment,
	context: IconAnalysisContext,
	seen = new Set<LexicalBinding>(),
): boolean | undefined {
	const current = unwrapExpression(expression)
	if (ts.isIdentifier(current)) {
		const binding = lexicalBinding(environment, current.text)
		if (binding == null || seen.has(binding))
			return staticallyKnownBoolean(current, context.variables)
		if (binding.kind !== 'initializer' || binding.initializer == null)
			return staticallyKnownBoolean(current, context.variables)
		const nextSeen = new Set(seen)
		nextSeen.add(binding)
		return lexicalBoolean(binding.initializer, bindingInitializerEnvironment(binding), context, nextSeen)
	}
	return staticallyKnownBoolean(current, context.variables)
}

function lexicalNullish(
	expression: ts.Expression,
	environment: LexicalEnvironment,
	context: IconAnalysisContext,
	seen = new Set<LexicalBinding>(),
): boolean | undefined {
	const current = unwrapExpression(expression)
	if (ts.isIdentifier(current)) {
		const binding = lexicalBinding(environment, current.text)
		if (binding == null || seen.has(binding))
			return staticallyKnownNullish(current, context.variables)
		if (binding.kind !== 'initializer' || binding.initializer == null)
			return staticallyKnownNullish(current, context.variables)
		const nextSeen = new Set(seen)
		nextSeen.add(binding)
		return lexicalNullish(binding.initializer, bindingInitializerEnvironment(binding), context, nextSeen)
	}
	return staticallyKnownNullish(current, context.variables)
}

function resolveLexicalObjectPropertyValues(
	expression: ts.Expression | undefined,
	propertyName: string,
	environment: LexicalEnvironment,
	context: IconAnalysisContext,
	seen = new Set<LexicalBinding>(),
): ResolvedExpression[] {
	if (expression == null)
		return []
	const current = unwrapExpression(expression)
	if (ts.isPropertyAccessExpression(current) && current.name.text === propertyName)
		return resolveLexicalObjectPropertyValues(current.expression, propertyName, environment, context, seen)
	if (ts.isElementAccessExpression(current)
		&& current.argumentExpression != null) {
		const memberName = lexicalStaticPropertyKey(current.argumentExpression, environment, context)
		if (memberName == null)
			return []
		if (memberName === propertyName)
			return resolveLexicalObjectPropertyValues(current.expression, propertyName, environment, context, seen)
		const members = resolveLexicalObjectPropertyValues(current.expression, memberName, environment, context, seen)
		return members.flatMap(member => resolveLexicalObjectPropertyValues(member.expression, propertyName, member.environment, context, seen))
	}
	if (ts.isIdentifier(current)) {
		const binding = lexicalBinding(environment, current.text)
		if (binding == null || seen.has(binding))
			return []
		if (binding.kind === 'union') {
			const nextSeen = new Set(seen)
			nextSeen.add(binding)
			return bindingAlternatives(binding)
				.flatMap(alternative =>
					resolveLexicalObjectPropertyValues(
						current,
						propertyName,
						{ ...environment, bindings: new Map([[current.text, alternative]]) },
						context,
						nextSeen,
					))
		}
		if (binding.kind !== 'initializer' || binding.initializer == null)
			return []
		const nextSeen = new Set(seen)
		nextSeen.add(binding)
		return resolveLexicalObjectPropertyValues(binding.initializer, propertyName, bindingInitializerEnvironment(binding), context, nextSeen)
	}
	if (ts.isArrayLiteralExpression(current)) {
		const index = Number(propertyName)
		const element = Number.isInteger(index) ? current.elements[index] : undefined
		return element != null && ts.isExpression(element)
			? [{ expression: element, environment }]
			: []
	}
	if (!ts.isObjectLiteralExpression(current))
		return []

	let resolved: ResolvedExpression[] = []
	for (const property of current.properties) {
		if (ts.isSpreadAssignment(property)) {
			const spreadValues = resolveLexicalObjectPropertyValues(property.expression, propertyName, environment, context, new Set(seen))
			if (spreadValues.length > 0)
				resolved = spreadValues
			continue
		}
		if (lexicalPropertyName(property.name, environment, context) !== propertyName)
			continue
		if (ts.isPropertyAssignment(property))
			resolved = [{ expression: property.initializer, environment }]
		else if (ts.isShorthandPropertyAssignment(property))
			resolved = [{ expression: property.name, environment }]
	}
	return resolved
}

function lexicalStaticPropertyKey(
	expression: ts.Expression,
	environment: LexicalEnvironment,
	context: IconAnalysisContext,
	seen = new Set<LexicalBinding>(),
): string | undefined {
	const current = unwrapExpression(expression)
	if (ts.isStringLiteralLike(current) || ts.isNumericLiteral(current))
		return current.text
	if (!ts.isIdentifier(current))
		return undefined
	const binding = lexicalBinding(environment, current.text)
	if (binding == null)
		return staticPropertyKey(current, context.variables)
	if (binding.kind !== 'initializer' || binding.initializer == null || seen.has(binding))
		return undefined
	const nextSeen = new Set(seen)
	nextSeen.add(binding)
	return lexicalStaticPropertyKey(binding.initializer, bindingInitializerEnvironment(binding), context, nextSeen)
}

function lexicalPropertyName(
	node: ts.PropertyName,
	environment: LexicalEnvironment,
	context: IconAnalysisContext,
): string | undefined {
	const direct = directPropertyName(node)
	return direct ?? (ts.isComputedPropertyName(node)
		? lexicalStaticPropertyKey(node.expression, environment, context)
		: undefined)
}

function isNeutralNamespaceReference(
	expression: ts.Expression,
	environment: LexicalEnvironment,
	seen = new Set<LexicalBinding>(),
): boolean {
	const current = unwrapExpression(expression)
	if (isNeutralRequire(current, '', environment))
		return true
	if (!ts.isIdentifier(current))
		return false
	const binding = lexicalBinding(environment, current.text)
	if (binding == null || seen.has(binding))
		return false
	if (binding.kind === 'neutralNamespace')
		return true
	if (binding.kind !== 'initializer' || binding.initializer == null)
		return false
	const nextSeen = new Set(seen)
	nextSeen.add(binding)
	return isNeutralNamespaceReference(binding.initializer, bindingInitializerEnvironment(binding), nextSeen)
}

function resolveMemberLexicalValues(
	expression: ts.Expression,
	environment: LexicalEnvironment,
	context: IconAnalysisContext,
): ResolvedExpression[] {
	const current = unwrapExpression(expression)
	if (ts.isPropertyAccessExpression(current))
		return resolveLexicalObjectPropertyValues(current.expression, current.name.text, environment, context)
	if (ts.isElementAccessExpression(current)
		&& current.argumentExpression != null) {
		const propertyName = lexicalStaticPropertyKey(current.argumentExpression, environment, context)
		return propertyName == null
			? []
			: resolveLexicalObjectPropertyValues(current.expression, propertyName, environment, context)
	}
	return []
}

function resolveLexicalObjectMethods(
	expression: ts.Expression,
	propertyName: string,
	environment: LexicalEnvironment,
	context: IconAnalysisContext,
	seen = new Set<LexicalBinding>(),
): FunctionCandidate[] {
	const current = unwrapExpression(expression)
	if (ts.isIdentifier(current)) {
		const binding = lexicalBinding(environment, current.text)
		if (binding == null || seen.has(binding))
			return []
		if (binding.kind === 'union') {
			const nextSeen = new Set(seen)
			nextSeen.add(binding)
			return bindingAlternatives(binding)
				.flatMap(alternative => resolveLexicalObjectMethods(
					current,
					propertyName,
					{ ...environment, bindings: new Map([[current.text, alternative]]) },
					context,
					nextSeen,
				))
		}
		if (binding.kind !== 'initializer' || binding.initializer == null)
			return []
		const nextSeen = new Set(seen)
		nextSeen.add(binding)
		return resolveLexicalObjectMethods(binding.initializer, propertyName, bindingInitializerEnvironment(binding), context, nextSeen)
	}
	if (!ts.isObjectLiteralExpression(current))
		return []
	for (let index = current.properties.length - 1; index >= 0; index--) {
		const property = current.properties[index]
		if (property == null)
			continue
		if (ts.isSpreadAssignment(property)) {
			const methods = resolveLexicalObjectMethods(property.expression, propertyName, environment, context, new Set(seen))
			if (methods.length > 0)
				return methods
			continue
		}
		if (lexicalPropertyName(property.name, environment, context) !== propertyName)
			continue
		if (ts.isMethodDeclaration(property))
			return [{ declaration: property, environment }]
		return []
	}
	return []
}

function resolveFunctionCandidates(
	expression: ts.Expression,
	environment: LexicalEnvironment,
	context: IconAnalysisContext,
	seen = new Set<LexicalBinding>(),
	callStack: ReadonlySet<ts.FunctionLikeDeclaration> = new Set(),
): FunctionCandidate[] {
	const current = unwrapExpression(expression)
	if (ts.isIdentifier(current)) {
		const binding = lexicalBinding(environment, current.text)
		if (binding == null || seen.has(binding))
			return []
		if (binding.kind === 'union') {
			return bindingAlternatives(binding)
				.flatMap(alternative => resolveFunctionCandidates(current, { ...environment, bindings: new Map([[current.text, alternative]]) }, context, new Set(seen), callStack))
		}
		const nextSeen = new Set(seen)
		nextSeen.add(binding)
		if (binding.kind === 'function' && binding.declaration != null)
			return [{ declaration: binding.declaration, environment: binding.environment }]
		if (binding.kind === 'initializer' && binding.initializer != null)
			return resolveFunctionCandidates(binding.initializer, bindingInitializerEnvironment(binding), context, nextSeen, callStack)
		return []
	}
	if (ts.isArrowFunction(current) || ts.isFunctionExpression(current))
		return [{ declaration: current, environment }]
	if (ts.isCallExpression(current)) {
		return resolveStaticCallResults(current, environment, context, callStack)
			.flatMap(result => resolveFunctionCandidates(result.expression, result.environment, context, new Set(seen), callStack))
	}
	if (ts.isBinaryExpression(current)
		&& (current.operatorToken.kind === ts.SyntaxKind.CommaToken
			|| isAssignmentOperator(current.operatorToken.kind))) {
		return resolveFunctionCandidates(current.right, environment, context, seen, callStack)
	}
	if (ts.isConditionalExpression(current)) {
		const condition = lexicalBoolean(current.condition, environment, context)
		if (condition === true)
			return resolveFunctionCandidates(current.whenTrue, environment, context, seen, callStack)
		if (condition === false)
			return resolveFunctionCandidates(current.whenFalse, environment, context, seen, callStack)
		return [
			...resolveFunctionCandidates(current.whenTrue, environment, context, new Set(seen), callStack),
			...resolveFunctionCandidates(current.whenFalse, environment, context, new Set(seen), callStack),
		]
	}
	if (ts.isBinaryExpression(current)) {
		const operator = current.operatorToken.kind
		if (operator === ts.SyntaxKind.BarBarToken || operator === ts.SyntaxKind.AmpersandAmpersandToken || operator === ts.SyntaxKind.QuestionQuestionToken) {
			const leftValue = operator === ts.SyntaxKind.QuestionQuestionToken
				? lexicalNullish(current.left, environment, context)
				: lexicalBoolean(current.left, environment, context)
			if (leftValue === true) {
				return operator === ts.SyntaxKind.BarBarToken
					? resolveFunctionCandidates(current.left, environment, context, seen, callStack)
					: resolveFunctionCandidates(current.right, environment, context, seen, callStack)
			}
			if (leftValue === false) {
				return operator === ts.SyntaxKind.BarBarToken
					? resolveFunctionCandidates(current.right, environment, context, seen, callStack)
					: resolveFunctionCandidates(current.left, environment, context, seen, callStack)
			}
			return [
				...resolveFunctionCandidates(current.left, environment, context, new Set(seen), callStack),
				...resolveFunctionCandidates(current.right, environment, context, new Set(seen), callStack),
			]
		}
	}
	if (ts.isPropertyAccessExpression(current)) {
		const methods = resolveLexicalObjectMethods(current.expression, current.name.text, environment, context)
		if (methods.length > 0)
			return methods
	}
	if (ts.isElementAccessExpression(current)
		&& current.argumentExpression != null) {
		const propertyName = lexicalStaticPropertyKey(current.argumentExpression, environment, context)
		const methods = propertyName == null
			? []
			: resolveLexicalObjectMethods(current.expression, propertyName, environment, context)
		if (methods.length > 0)
			return methods
	}
	const memberValues = resolveMemberLexicalValues(current, environment, context)
	return memberValues.flatMap(memberValue => resolveFunctionCandidates(memberValue.expression, memberValue.environment, context, seen, callStack))
}

function isNeutralFactoryReference(
	expression: ts.Expression,
	environment: LexicalEnvironment,
	context: IconAnalysisContext,
	seen = new Set<LexicalBinding>(),
	callStack: ReadonlySet<ts.FunctionLikeDeclaration> = new Set(),
): boolean {
	const current = unwrapExpression(expression)
	if (ts.isIdentifier(current)) {
		const binding = lexicalBinding(environment, current.text)
		if (binding == null || seen.has(binding))
			return false
		if (binding.kind === 'union') {
			const nextSeen = new Set(seen)
			nextSeen.add(binding)
			return bindingAlternatives(binding)
				.some(alternative => isNeutralFactoryReference(current, { ...environment, bindings: new Map([[current.text, alternative]]) }, context, nextSeen, callStack))
		}
		if (binding.kind === 'neutralFactory')
			return true
		if (binding.kind === 'initializer' && binding.initializer != null) {
			const nextSeen = new Set(seen)
			nextSeen.add(binding)
			return isNeutralFactoryReference(binding.initializer, bindingInitializerEnvironment(binding), context, nextSeen, callStack)
		}
		return false
	}
	// Function values are resolved and invoked separately so call arguments can
	// be bound to parameters before the body is analyzed.
	if (ts.isCallExpression(current)) {
		return resolveStaticCallResults(current, environment, context, callStack)
			.some(result => isNeutralFactoryReference(result.expression, result.environment, context, new Set(seen), callStack))
	}
	if (ts.isBinaryExpression(current)
		&& (current.operatorToken.kind === ts.SyntaxKind.CommaToken
			|| isAssignmentOperator(current.operatorToken.kind))) {
		return isNeutralFactoryReference(current.right, environment, context, seen, callStack)
	}

	if (ts.isConditionalExpression(current)) {
		const condition = lexicalBoolean(current.condition, environment, context)
		if (condition === true)
			return isNeutralFactoryReference(current.whenTrue, environment, context, seen, callStack)
		if (condition === false)
			return isNeutralFactoryReference(current.whenFalse, environment, context, seen, callStack)
		return isNeutralFactoryReference(current.whenTrue, environment, context, new Set(seen), callStack)
			|| isNeutralFactoryReference(current.whenFalse, environment, context, new Set(seen), callStack)
	}

	if (ts.isBinaryExpression(current)) {
		const operator = current.operatorToken.kind
		if (operator === ts.SyntaxKind.BarBarToken || operator === ts.SyntaxKind.AmpersandAmpersandToken || operator === ts.SyntaxKind.QuestionQuestionToken) {
			const truthiness = operator === ts.SyntaxKind.QuestionQuestionToken
				? lexicalNullish(current.left, environment, context)
				: lexicalBoolean(current.left, environment, context)
			if (truthiness === true) {
				return operator === ts.SyntaxKind.BarBarToken
					? isNeutralFactoryReference(current.left, environment, context, seen, callStack)
					: isNeutralFactoryReference(current.right, environment, context, seen, callStack)
			}
			if (truthiness === false) {
				return operator === ts.SyntaxKind.BarBarToken
					? isNeutralFactoryReference(current.right, environment, context, seen, callStack)
					: isNeutralFactoryReference(current.left, environment, context, seen, callStack)
			}
			return isNeutralFactoryReference(current.left, environment, context, new Set(seen), callStack)
				|| isNeutralFactoryReference(current.right, environment, context, new Set(seen), callStack)
		}
	}

	if (ts.isPropertyAccessExpression(current)
		&& current.name.text === 'icons'
		&& isNeutralNamespaceReference(current.expression, environment)) {
		return true
	}
	if (ts.isElementAccessExpression(current)
		&& current.argumentExpression != null
		&& lexicalStaticPropertyKey(current.argumentExpression, environment, context) === 'icons'
		&& isNeutralNamespaceReference(current.expression, environment)) {
		return true
	}
	return resolveMemberLexicalValues(current, environment, context)
		.some(memberValue => isNeutralFactoryReference(memberValue.expression, memberValue.environment, context, seen, callStack))
}

function populateFunctionEnvironment(environment: LexicalEnvironment, statements: readonly ts.Statement[]): void {
	const visit = (node: ts.Node): void => {
		if (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node))
			return
		if (ts.isVariableDeclarationList(node) && (node.flags & (ts.NodeFlags.Let | ts.NodeFlags.Const)) === 0) {
			for (const declaration of node.declarations)
				setUnknownBindings(environment, declaration.name)
		}
		ts.forEachChild(node, visit)
	}
	for (const statement of statements)
		visit(statement)
}

function populateBlockEnvironment(environment: LexicalEnvironment, statements: readonly ts.Statement[]): void {
	for (const statement of statements) {
		if (ts.isVariableStatement(statement)) {
			if ((statement.declarationList.flags & (ts.NodeFlags.Let | ts.NodeFlags.Const)) !== 0) {
				for (const declaration of statement.declarationList.declarations)
					setUnknownBindings(environment, declaration.name)
			}
		}
		else if (ts.isFunctionDeclaration(statement) && statement.name != null) {
			setEnvironmentBinding(environment, statement.name.text, {
				kind: 'function',
				declaration: statement,
				environment,
			})
		}
	}
}

interface StatementFlow {
	readonly foundNeutral: boolean
	readonly fallsThrough: boolean
	readonly environment?: LexicalEnvironment
	readonly assignments?: ReadonlyMap<string, LexicalBinding>
	readonly assignmentOwners?: ReadonlyMap<string, LexicalEnvironment>
	readonly thrownAssignments?: ReadonlyMap<string, LexicalBinding>
	readonly thrownAssignmentOwners?: ReadonlyMap<string, LexicalEnvironment>
	readonly returnValues?: readonly ResolvedExpression[]
	readonly thrownValues?: readonly ResolvedExpression[]
	readonly breaks?: boolean
	readonly continues?: boolean
	readonly throws?: boolean
	readonly mayThrow?: boolean
}

type StaticSwitchValue = boolean | number | string | null | undefined
const UNRESOLVED_SWITCH_VALUE = Symbol('unresolved')

function staticSwitchValue(
	expression: ts.Expression,
	variables: VariableBindings,
	seen = new Set<string>(),
): StaticSwitchValue | typeof UNRESOLVED_SWITCH_VALUE {
	const current = unwrapExpression(expression)
	if (current.kind === ts.SyntaxKind.TrueKeyword)
		return true
	if (current.kind === ts.SyntaxKind.FalseKeyword)
		return false
	if (current.kind === ts.SyntaxKind.NullKeyword)
		return null
	if (ts.isStringLiteralLike(current))
		return current.text
	if (ts.isNumericLiteral(current))
		return Number(current.text)
	if (ts.isIdentifier(current)) {
		if (current.text === 'undefined')
			return undefined
		if (seen.has(current.text))
			return UNRESOLVED_SWITCH_VALUE
		const binding = variables.get(current.text)
		if (binding == null)
			return UNRESOLVED_SWITCH_VALUE
		const nextSeen = new Set(seen)
		nextSeen.add(current.text)
		return staticSwitchValue(binding.initializer, binding.variables, nextSeen)
	}
	return UNRESOLVED_SWITCH_VALUE
}

function lexicalSwitchValue(
	expression: ts.Expression,
	environment: LexicalEnvironment,
	context: IconAnalysisContext,
	seen = new Set<LexicalBinding>(),
): StaticSwitchValue | typeof UNRESOLVED_SWITCH_VALUE {
	const current = unwrapExpression(expression)
	if (ts.isIdentifier(current)) {
		const binding = lexicalBinding(environment, current.text)
		if (binding != null && !seen.has(binding)) {
			if (binding.kind === 'initializer' && binding.initializer != null) {
				const nextSeen = new Set(seen)
				nextSeen.add(binding)
				return lexicalSwitchValue(binding.initializer, bindingInitializerEnvironment(binding), context, nextSeen)
			}
			return UNRESOLVED_SWITCH_VALUE
		}
	}
	return staticSwitchValue(current, context.variables)
}

interface StaticNumericLoop {
	readonly name: string
	readonly initial: number
	readonly step: number
	readonly operator: ts.SyntaxKind
	readonly bound: number
}

interface StaticNumericComparison {
	readonly name: string
	readonly initial: number
	readonly operator: ts.SyntaxKind
	readonly bound: number
}

function simpleNumericLoopAssignment(statement: ts.ForStatement): ts.BinaryExpression | undefined {
	if (statement.initializer == null || ts.isVariableDeclarationList(statement.initializer))
		return undefined
	const initializer = unwrapExpression(statement.initializer)
	return ts.isBinaryExpression(initializer)
		&& initializer.operatorToken.kind === ts.SyntaxKind.EqualsToken
		&& ts.isIdentifier(initializer.left)
		? initializer
		: undefined
}

function staticNumericValue(
	expression: ts.Expression,
	environment: LexicalEnvironment,
	context: IconAnalysisContext,
): number | undefined {
	const current = unwrapExpression(expression)
	if (ts.isPrefixUnaryExpression(current)
		&& (current.operator === ts.SyntaxKind.PlusToken || current.operator === ts.SyntaxKind.MinusToken)) {
		const operand = staticNumericValue(current.operand, environment, context)
		if (operand != null)
			return current.operator === ts.SyntaxKind.MinusToken ? -operand : operand
	}
	const value = lexicalSwitchValue(expression, environment, context)
	return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function normalizeNumericComparison(operator: ts.SyntaxKind, targetOnLeft: boolean): ts.SyntaxKind {
	if (targetOnLeft)
		return operator
	switch (operator) {
		case ts.SyntaxKind.LessThanToken:
			return ts.SyntaxKind.GreaterThanToken
		case ts.SyntaxKind.LessThanEqualsToken:
			return ts.SyntaxKind.GreaterThanEqualsToken
		case ts.SyntaxKind.GreaterThanToken:
			return ts.SyntaxKind.LessThanToken
		case ts.SyntaxKind.GreaterThanEqualsToken:
			return ts.SyntaxKind.LessThanEqualsToken
		default:
			return operator
	}
}

function numericConditionHolds(loop: StaticNumericComparison | StaticNumericLoop, value: number): boolean | undefined {
	switch (loop.operator) {
		case ts.SyntaxKind.LessThanToken:
			return value < loop.bound
		case ts.SyntaxKind.LessThanEqualsToken:
			return value <= loop.bound
		case ts.SyntaxKind.GreaterThanToken:
			return value > loop.bound
		case ts.SyntaxKind.GreaterThanEqualsToken:
			return value >= loop.bound
		case ts.SyntaxKind.EqualsEqualsToken:
		case ts.SyntaxKind.EqualsEqualsEqualsToken:
			return value === loop.bound
		case ts.SyntaxKind.ExclamationEqualsToken:
		case ts.SyntaxKind.ExclamationEqualsEqualsToken:
			return value !== loop.bound
		default:
			return undefined
	}
}

function isAssignmentOperator(kind: ts.SyntaxKind): boolean {
	return kind >= ts.SyntaxKind.FirstAssignment && kind <= ts.SyntaxKind.LastAssignment
}

function assignmentTargetWritesIdentifier(target: ts.Expression, name: string): boolean {
	const current = unwrapExpression(target)
	if (ts.isIdentifier(current))
		return current.text === name
	if (ts.isBinaryExpression(current) && isAssignmentOperator(current.operatorToken.kind))
		return assignmentTargetWritesIdentifier(current.left, name)
	if (ts.isArrayLiteralExpression(current))
		return current.elements.some(element => ts.isExpression(element) && assignmentTargetWritesIdentifier(element, name))
	if (ts.isObjectLiteralExpression(current)) {
		return current.properties.some((property) => {
			if (ts.isSpreadAssignment(property))
				return assignmentTargetWritesIdentifier(property.expression, name)
			if (ts.isPropertyAssignment(property))
				return assignmentTargetWritesIdentifier(property.initializer, name)
			if (ts.isShorthandPropertyAssignment(property))
				return assignmentTargetWritesIdentifier(property.name, name)
			return false
		})
	}
	return false
}

function statementWritesIdentifier(statement: ts.Statement, name: string): boolean {
	let writes = false
	const visit = (node: ts.Node): void => {
		if (writes)
			return
		if (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node))
			return
		if (ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) {
			const operand = unwrapExpression(node.operand)
			if ((node.operator === ts.SyntaxKind.PlusPlusToken || node.operator === ts.SyntaxKind.MinusMinusToken)
				&& ts.isIdentifier(operand)
				&& operand.text === name) {
				writes = true
				return
			}
		}
		if (ts.isBinaryExpression(node)
			&& isAssignmentOperator(node.operatorToken.kind)
			&& assignmentTargetWritesIdentifier(node.left, name)) {
			writes = true
			return
		}
		ts.forEachChild(node, visit)
	}
	visit(statement)
	return writes
}

function staticNumericComparison(
	statement: ts.ForStatement,
	environment: LexicalEnvironment,
	context: IconAnalysisContext,
): StaticNumericComparison | undefined {
	if (statement.initializer == null || statement.condition == null)
		return undefined
	let name = ''
	let initialExpression: ts.Expression | undefined
	if (ts.isVariableDeclarationList(statement.initializer)) {
		if (statement.initializer.declarations.length !== 1)
			return undefined
		const declaration = statement.initializer.declarations[0]
		if (declaration == null || !ts.isIdentifier(declaration.name) || declaration.initializer == null)
			return undefined
		name = declaration.name.text
		initialExpression = declaration.initializer
	}
	else {
		const assignment = simpleNumericLoopAssignment(statement)
		if (assignment == null || !ts.isIdentifier(assignment.left))
			return undefined
		name = assignment.left.text
		initialExpression = assignment.right
	}
	const initial = staticNumericValue(initialExpression, environment, context)
	if (initial == null)
		return undefined
	const condition = unwrapExpression(statement.condition)
	if (!ts.isBinaryExpression(condition))
		return undefined
	let targetOnLeft = false
	let boundExpression: ts.Expression | undefined
	const left = condition.left
	const right = condition.right
	if (ts.isIdentifier(left) && left.text === name) {
		targetOnLeft = true
		boundExpression = right
	}
	else if (ts.isIdentifier(right) && right.text === name) {
		boundExpression = left
	}
	if (boundExpression == null)
		return undefined
	const bound = staticNumericValue(boundExpression, environment, context)
	if (bound == null)
		return undefined
	return {
		name,
		initial,
		operator: normalizeNumericComparison(condition.operatorToken.kind, targetOnLeft),
		bound,
	}
}

function staticNumericLoop(
	statement: ts.ForStatement,
	environment: LexicalEnvironment,
	context: IconAnalysisContext,
): StaticNumericLoop | undefined {
	const comparison = staticNumericComparison(statement, environment, context)
	if (comparison == null || statement.incrementor == null)
		return undefined
	const incrementor = unwrapExpression(statement.incrementor)
	let step: number | undefined
	const incrementOperand = (ts.isPrefixUnaryExpression(incrementor) || ts.isPostfixUnaryExpression(incrementor))
		? unwrapExpression(incrementor.operand)
		: undefined
	if ((ts.isPrefixUnaryExpression(incrementor) || ts.isPostfixUnaryExpression(incrementor))
		&& incrementOperand != null
		&& ts.isIdentifier(incrementOperand)
		&& incrementOperand.text === comparison.name) {
		if (incrementor.operator === ts.SyntaxKind.PlusPlusToken)
			step = 1
		else if (incrementor.operator === ts.SyntaxKind.MinusMinusToken)
			step = -1
	}
	else if (ts.isBinaryExpression(incrementor)) {
		const incrementLeft = unwrapExpression(incrementor.left)
		if (!ts.isIdentifier(incrementLeft) || incrementLeft.text !== comparison.name)
			return undefined
		const amount = staticNumericValue(incrementor.right, environment, context)
		if (amount != null && incrementor.operatorToken.kind === ts.SyntaxKind.PlusEqualsToken)
			step = amount
		else if (amount != null && incrementor.operatorToken.kind === ts.SyntaxKind.MinusEqualsToken)
			step = -amount
	}
	if (step == null || !Number.isFinite(step))
		return undefined
	return {
		name: comparison.name,
		initial: comparison.initial,
		step,
		operator: comparison.operator,
		bound: comparison.bound,
	}
}

function staticNumericLoopCondition(
	statement: ts.ForStatement,
	environment: LexicalEnvironment,
	context: IconAnalysisContext,
): boolean | undefined {
	const comparison = staticNumericComparison(statement, environment, context)
	return comparison == null ? undefined : numericConditionHolds(comparison, comparison.initial)
}

function staticNumericLoopContinuation(
	statement: ts.ForStatement,
	environment: LexicalEnvironment,
	context: IconAnalysisContext,
	body: ts.Statement,
): boolean | undefined {
	const loop = staticNumericLoop(statement, environment, context)
	if (loop == null)
		return undefined
	if (statementWritesIdentifier(body, loop.name))
		return undefined
	return numericConditionHolds(loop, loop.initial + loop.step)
}

function isDefinitelyEmptyLoopCollection(
	expression: ts.Expression,
	environment: LexicalEnvironment,
	forIn: boolean,
	seen = new Set<LexicalBinding>(),
): boolean {
	const current = unwrapExpression(expression)
	if (forIn && ts.isObjectLiteralExpression(current))
		return current.properties.length === 0
	if (!forIn && ts.isArrayLiteralExpression(current))
		return current.elements.length === 0
	if (!ts.isIdentifier(current))
		return false
	const binding = lexicalBinding(environment, current.text)
	if (binding == null || binding.kind !== 'initializer' || binding.initializer == null || seen.has(binding))
		return false
	const nextSeen = new Set(seen)
	nextSeen.add(binding)
	return isDefinitelyEmptyLoopCollection(binding.initializer, bindingInitializerEnvironment(binding), forIn, nextSeen)
}

function switchCaseMatches(
	discriminant: StaticSwitchValue,
	expression: ts.Expression | undefined,
	environment: LexicalEnvironment,
	context: IconAnalysisContext,
): boolean {
	if (expression == null)
		return false
	const value = lexicalSwitchValue(expression, environment, context)
	return value !== UNRESOLVED_SWITCH_VALUE && value === discriminant
}

function executeSwitchClauses(
	clauses: readonly ts.CaseOrDefaultClause[],
	environment: LexicalEnvironment,
	context: IconAnalysisContext,
	callStack: ReadonlySet<ts.FunctionLikeDeclaration>,
): StatementFlow {
	let foundNeutral = false
	let returnValues: ResolvedExpression[] = []
	let thrownValues: ResolvedExpression[] = []
	let assignments = new Map<string, LexicalBinding>()
	let assignmentOwners = new Map<string, LexicalEnvironment>()
	let thrownAssignments = new Map<string, LexicalBinding>()
	let thrownAssignmentOwners = new Map<string, LexicalEnvironment>()
	let mayThrow = false
	for (const clause of clauses) {
		const result = executeStatements(clause.statements, environment, context, callStack)
		foundNeutral = foundNeutral || result.foundNeutral
		returnValues = boundResolvedExpressions([...returnValues, ...(result.returnValues ?? [])], context)
		thrownValues = boundResolvedExpressions([...thrownValues, ...(result.thrownValues ?? [])], context)
		assignments = assignmentMap(assignments, result.assignments)
		assignmentOwners = assignmentMap(assignmentOwners, result.assignmentOwners)
		thrownAssignments = assignmentMap(thrownAssignments, result.thrownAssignments)
		thrownAssignmentOwners = assignmentMap(thrownAssignmentOwners, result.thrownAssignmentOwners)
		mayThrow = mayThrow || result.mayThrow === true
		if (result.breaks) {
			if (!result.fallsThrough)
				return { foundNeutral, fallsThrough: true, assignments, assignmentOwners, thrownAssignments, thrownAssignmentOwners, returnValues, thrownValues, mayThrow }
			continue
		}
		if (result.continues)
			return { foundNeutral, fallsThrough: false, assignments, assignmentOwners, thrownAssignments, thrownAssignmentOwners, returnValues, thrownValues, continues: true, mayThrow }
		if (!result.fallsThrough)
			return { foundNeutral, fallsThrough: false, assignments, assignmentOwners, thrownAssignments, thrownAssignmentOwners, returnValues, thrownValues, throws: result.throws, mayThrow }
	}
	return { foundNeutral, fallsThrough: true, assignments, assignmentOwners, thrownAssignments, thrownAssignmentOwners, returnValues, thrownValues, mayThrow }
}

function executeVariableDeclarationList(
	declarationList: ts.VariableDeclarationList,
	environment: LexicalEnvironment,
	context: IconAnalysisContext,
	callStack: ReadonlySet<ts.FunctionLikeDeclaration>,
): AssignmentEffects & { foundNeutral: boolean } {
	let result: AssignmentEffects & { foundNeutral: boolean } = { foundNeutral: false }
	for (const declaration of declarationList.declarations) {
		if (declaration.initializer != null)
			result = sequenceAssignmentEffects(result, executeExpressionEffects(declaration.initializer, environment, context, callStack))
		const bindingEnvironment = (declarationList.flags & (ts.NodeFlags.Let | ts.NodeFlags.Const)) === 0
			? environment.functionScope
			: environment
		if (declaration.initializer != null)
			setInitializerBinding(bindingEnvironment, declaration.name, declaration.initializer, environment)
	}
	return result
}

function setLoopTargetUnknown(target: ts.ForInitializer | ts.Expression, environment: LexicalEnvironment): void {
	if (ts.isVariableDeclarationList(target)) {
		for (const declaration of target.declarations)
			setUnknownBindings(environment, declaration.name)
		return
	}
	if (ts.isIdentifier(target))
		setEnvironmentBinding(environment, target.text, { kind: 'unknown', environment })
}

function executeBranch(
	statement: ts.Statement,
	environment: LexicalEnvironment,
	context: IconAnalysisContext,
	callStack: ReadonlySet<ts.FunctionLikeDeclaration>,
): StatementFlow {
	const branchEnvironment = newLexicalEnvironment(environment, true)
	if (ts.isBlock(statement))
		return executeStatements(statement.statements, newLexicalEnvironment(branchEnvironment), context, callStack)
	return executeStatements([statement], branchEnvironment, context, callStack)
}

function mergePathAssignments(
	environment: LexicalEnvironment,
	paths: readonly StatementFlow[],
	context: IconAnalysisContext,
	writeEnvironment = environment,
): Map<string, LexicalBinding> {
	const names = new Set<string>()
	for (const path of paths) {
		for (const name of path.assignments?.keys() ?? [])
			names.add(name)
	}
	const previous = new Map<string, LexicalBinding>()
	for (const name of names) {
		const binding = lexicalBinding(environment, name)
		if (binding != null)
			previous.set(name, binding)
	}
	const merged = new Map<string, LexicalBinding>()
	for (const name of names) {
		const original = previous.get(name)
		if (original == null)
			continue
		const originalOwner = bindingOwner(environment, name, original)
		const values = paths.map(path => path.assignments?.has(name)
			&& path.assignmentOwners?.get(name) === originalOwner
			? path.assignments.get(name)!
			: original)
		const binding = unionBindings(values, environment, context)
		const owner = writeEnvironment === environment ? originalOwner : writeEnvironment
		setEnvironmentBinding(writeEnvironment === environment ? (owner ?? writeEnvironment) : writeEnvironment, name, binding, owner ?? writeEnvironment)
		merged.set(name, binding)
	}
	return merged
}

function assignmentOwnersFor(
	environment: LexicalEnvironment,
	assignments: ReadonlyMap<string, LexicalBinding> | undefined,
): Map<string, LexicalEnvironment> {
	const owners = new Map<string, LexicalEnvironment>()
	for (const name of assignments?.keys() ?? []) {
		const binding = lexicalBinding(environment, name)
		if (binding != null)
			owners.set(name, bindingOwner(environment, name, binding) ?? environment)
	}
	return owners
}

function seedAssignments(
	environment: LexicalEnvironment,
	assignments: ReadonlyMap<string, LexicalBinding> | undefined,
	owners?: ReadonlyMap<string, LexicalEnvironment>,
): void {
	for (const [name, binding] of assignments ?? [])
		setEnvironmentBinding(environment, name, binding, owners?.get(name) ?? environment)
}

function mergeExitAssignments(
	environment: LexicalEnvironment,
	paths: readonly StatementFlow[],
	context: IconAnalysisContext,
): AssignmentEffects {
	const target = newLexicalEnvironment(environment)
	const assignments = mergePathAssignments(environment, paths, context, target)
	return { assignments, assignmentOwners: assignmentOwnersFor(target, assignments) }
}

function withIncomingAssignments(
	flow: StatementFlow,
	incoming: ReadonlyMap<string, LexicalBinding> | undefined,
	incomingOwners: ReadonlyMap<string, LexicalEnvironment> | undefined,
): StatementFlow {
	if (incoming == null || incoming.size === 0)
		return flow
	const assignments = assignmentMap(incoming, flow.assignments)
	return {
		...flow,
		assignments,
		assignmentOwners: assignmentMap(incomingOwners, flow.assignmentOwners),
	}
}

function assignmentMap<T>(...maps: readonly (ReadonlyMap<string, T> | undefined)[]): Map<string, T> {
	const result = new Map<string, T>()
	for (const map of maps) {
		if (map == null)
			continue
		for (const [name, binding] of map)
			result.set(name, binding)
	}
	return result
}

function sequenceAssignmentEffects(
	left: AssignmentEffects & { foundNeutral: boolean },
	right: AssignmentEffects & { foundNeutral: boolean },
): AssignmentEffects & { foundNeutral: boolean } {
	const assignments = assignmentMap(left.assignments, right.assignments)
	const assignmentOwners = assignmentMap(left.assignmentOwners, right.assignmentOwners)
	const thrownAssignments = assignmentMap(
		left.thrownAssignments,
		left.assignments,
		right.thrownAssignments,
	)
	const thrownAssignmentOwners = assignmentMap(
		left.thrownAssignmentOwners,
		left.assignmentOwners,
		right.thrownAssignmentOwners,
	)
	return {
		foundNeutral: left.foundNeutral || right.foundNeutral,
		assignments,
		assignmentOwners,
		thrownAssignments,
		thrownAssignmentOwners,
		mayThrow: left.mayThrow === true || right.mayThrow === true,
	}
}

function executeExpressionEffects(
	expression: ts.Expression | undefined,
	environment: LexicalEnvironment,
	context: IconAnalysisContext,
	callStack: ReadonlySet<ts.FunctionLikeDeclaration>,
): AssignmentEffects & { foundNeutral: boolean } {
	if (expression == null)
		return { foundNeutral: false }
	const current = unwrapExpression(expression)
	if (ts.isBinaryExpression(current)
		&& (current.operatorToken.kind === ts.SyntaxKind.CommaToken
			|| isAssignmentOperator(current.operatorToken.kind))) {
		return executeAssignmentExpression(current, environment, context, callStack)
	}
	if (ts.isIdentifier(current)) {
		return {
			foundNeutral: expressionCallsNeutralIcons(current, environment, context, new Set(), callStack),
		}
	}
	if (ts.isCallExpression(current)) {
		const callee = executeExpressionEffects(current.expression, environment, context, callStack)
		const calleeEnvironment = snapshotEnvironment(environment)
		let result: AssignmentEffects & { foundNeutral: boolean } = callee
		for (const argument of current.arguments)
			result = sequenceAssignmentEffects(result, executeExpressionEffects(argument, environment, context, callStack))
		const callEffects = callCallsNeutralIcons(current, calleeEnvironment, context, callStack, environment, environment)
		return {
			...sequenceAssignmentEffects(result, callEffects),
			foundNeutral: result.foundNeutral || callEffects.foundNeutral,
			mayThrow: true,
		}
	}
	if (ts.isConditionalExpression(current)) {
		const condition = executeExpressionEffects(current.condition, environment, context, callStack)
		const known = lexicalBoolean(current.condition, environment, context)
		if (known === true)
			return sequenceAssignmentEffects(condition, executeExpressionEffects(current.whenTrue, environment, context, callStack))
		if (known === false)
			return sequenceAssignmentEffects(condition, executeExpressionEffects(current.whenFalse, environment, context, callStack))
		const branches = [current.whenTrue, current.whenFalse].map((branch) => {
			const branchEnvironment = newLexicalEnvironment(environment, true)
			return executeExpressionEffects(branch, branchEnvironment, context, callStack)
		})
		const names = new Set<string>()
		for (const branch of branches) {
			for (const name of branch.assignments?.keys() ?? [])
				names.add(name)
		}
		const assignments = new Map<string, LexicalBinding>()
		const assignmentOwners = new Map<string, LexicalEnvironment>()
		for (const name of names) {
			const original = lexicalBinding(environment, name)
			const owner = original == null ? undefined : bindingOwner(environment, name, original)
			const values = branches
				.filter(branch => branch.assignments?.has(name)
					&& branch.assignmentOwners?.get(name) === owner)
				.map(branch => branch.assignments!.get(name)!)
			if (original == null || owner == null || values.length === 0)
				continue
			const merged = unionBindings([original, ...values], owner, context)
			setEnvironmentBinding(owner, name, merged, owner)
			assignments.set(name, merged)
			assignmentOwners.set(name, owner)
		}
		const branchNeutral = branches.some(branch => branch.foundNeutral)
		return {
			...sequenceAssignmentEffects(condition, {
				foundNeutral: branchNeutral,
				assignments,
				assignmentOwners,
				thrownAssignments: assignmentMap(...branches.map(branch => branch.thrownAssignments)),
				thrownAssignmentOwners: assignmentMap(...branches.map(branch => branch.thrownAssignmentOwners)),
				mayThrow: branches.some(branch => branch.mayThrow === true),
			}),
		}
	}
	if (ts.isBinaryExpression(current)
		&& (current.operatorToken.kind === ts.SyntaxKind.BarBarToken
			|| current.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken
			|| current.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken)) {
		const left = executeExpressionEffects(current.left, environment, context, callStack)
		const leftValue = current.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken
			? lexicalNullish(current.left, environment, context)
			: lexicalBoolean(current.left, environment, context)
		if ((current.operatorToken.kind === ts.SyntaxKind.BarBarToken && leftValue === true)
			|| (current.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken && leftValue === false)
			|| (current.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken && leftValue === false)) {
			return left
		}
		if ((current.operatorToken.kind === ts.SyntaxKind.BarBarToken && leftValue === false)
			|| (current.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken && leftValue === true)
			|| (current.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken && leftValue === true)) {
			return sequenceAssignmentEffects(left, executeExpressionEffects(current.right, environment, context, callStack))
		}
		const rightEnvironment = newLexicalEnvironment(environment, true)
		const right = executeExpressionEffects(current.right, rightEnvironment, context, callStack)
		const assignments = mergePathAssignments(environment, [
			{ foundNeutral: false, fallsThrough: true },
			{ ...right, fallsThrough: true },
		], context)
		return sequenceAssignmentEffects(left, {
			foundNeutral: right.foundNeutral,
			assignments,
			assignmentOwners: assignmentOwnersFor(environment, assignments),
			thrownAssignments: right.thrownAssignments,
			thrownAssignmentOwners: right.thrownAssignmentOwners,
			mayThrow: right.mayThrow,
		})
	}
	if (ts.isArrowFunction(current) || ts.isFunctionExpression(current) || ts.isClassExpression(current))
		return { foundNeutral: false }
	let result: AssignmentEffects & { foundNeutral: boolean } = { foundNeutral: false }
	ts.forEachChild(current, (child) => {
		if (ts.isExpression(child))
			result = sequenceAssignmentEffects(result, executeExpressionEffects(child, environment, context, callStack))
	})
	return result
}

function executeAssignmentExpression(
	expression: ts.Expression,
	environment: LexicalEnvironment,
	context: IconAnalysisContext,
	callStack: ReadonlySet<ts.FunctionLikeDeclaration>,
): AssignmentEffects & { foundNeutral: boolean } {
	const current = unwrapExpression(expression)
	if (ts.isBinaryExpression(current) && current.operatorToken.kind === ts.SyntaxKind.CommaToken) {
		const left = executeAssignmentExpression(current.left, environment, context, callStack)
		const right = executeAssignmentExpression(current.right, environment, context, callStack)
		return sequenceAssignmentEffects(left, right)
	}
	if (!ts.isBinaryExpression(current) || !isAssignmentOperator(current.operatorToken.kind))
		return executeExpressionEffects(expression, environment, context, callStack)

	const operator = current.operatorToken.kind
	const left = unwrapExpression(current.left)
	const currentValue = ts.isIdentifier(left)
		? lexicalBinding(environment, left.text)
		: undefined
	const truthiness = operator === ts.SyntaxKind.QuestionQuestionEqualsToken
		? lexicalNullish(current.left, environment, context)
		: operator === ts.SyntaxKind.BarBarEqualsToken || operator === ts.SyntaxKind.AmpersandAmpersandEqualsToken
			? lexicalBoolean(current.left, environment, context)
			: undefined
	const shouldWrite = operator === ts.SyntaxKind.EqualsToken
		|| (operator === ts.SyntaxKind.QuestionQuestionEqualsToken && truthiness !== false)
		|| (operator === ts.SyntaxKind.BarBarEqualsToken && truthiness !== true)
		|| (operator === ts.SyntaxKind.AmpersandAmpersandEqualsToken && truthiness !== false)
	const rightEffects = shouldWrite
		? executeExpressionEffects(current.right, environment, context, callStack)
		: { foundNeutral: false }
	const foundNeutral = rightEffects.foundNeutral
	if (!shouldWrite)
		return rightEffects

	let binding: LexicalBinding | undefined
	if (operator === ts.SyntaxKind.EqualsToken || truthiness === true || truthiness === false) {
		binding = bindingFromAssignment(environment, current.right, environment)
		if (operator !== ts.SyntaxKind.EqualsToken) {
			const usesRight = (operator === ts.SyntaxKind.QuestionQuestionEqualsToken && truthiness === true)
				|| (operator === ts.SyntaxKind.BarBarEqualsToken && truthiness === false)
				|| (operator === ts.SyntaxKind.AmpersandAmpersandEqualsToken && truthiness === true)
			if (!usesRight)
				return { foundNeutral: false }
		}
	}
	else {
		binding = unionBindings([
			currentValue ?? { kind: 'unknown', environment },
			bindingFromAssignment(environment, current.right, environment),
		], environment, context)
	}
	const assignment = assignLexicalIdentifier(environment, current.left, undefined, environment)
	if (assignment == null)
		return rightEffects
	setEnvironmentBinding(environment, assignment.name, binding ?? assignment.binding, assignment.owner)
	const assignedBinding = binding ?? assignment.binding
	const assignments = assignmentMap(rightEffects.assignments, new Map([[assignment.name, assignedBinding]]))
	const assignmentOwners = assignmentMap(rightEffects.assignmentOwners, new Map([[assignment.name, assignment.owner]]))
	const thrownAssignments = new Map(rightEffects.thrownAssignments ?? [])
	const thrownAssignmentOwners = new Map(rightEffects.thrownAssignmentOwners ?? [])
	if (rightEffects.mayThrow === true && !thrownAssignments.has(assignment.name)) {
		const original = currentValue
		if (original != null) {
			thrownAssignments.set(assignment.name, original)
			thrownAssignmentOwners.set(assignment.name, assignment.owner)
		}
	}
	return {
		foundNeutral,
		assignments,
		assignmentOwners,
		thrownAssignments,
		thrownAssignmentOwners,
		mayThrow: rightEffects.mayThrow,
	}
}

function executeStatement(
	statement: ts.Statement,
	environment: LexicalEnvironment,
	context: IconAnalysisContext,
	callStack: ReadonlySet<ts.FunctionLikeDeclaration>,
): StatementFlow {
	if (ts.isFunctionDeclaration(statement))
		return { foundNeutral: false, fallsThrough: true }
	if (ts.isBreakStatement(statement))
		return { foundNeutral: false, fallsThrough: false, breaks: true }
	if (ts.isContinueStatement(statement))
		return { foundNeutral: false, fallsThrough: false, continues: true }
	if (ts.isVariableStatement(statement)) {
		const declarationResult = executeVariableDeclarationList(statement.declarationList, environment, context, callStack)
		return {
			foundNeutral: declarationResult.foundNeutral,
			fallsThrough: true,
			assignments: declarationResult.assignments,
			assignmentOwners: declarationResult.assignmentOwners,
			thrownAssignments: declarationResult.thrownAssignments,
			thrownAssignmentOwners: declarationResult.thrownAssignmentOwners,
			mayThrow: declarationResult.mayThrow === true,
		}
	}
	if (ts.isExpressionStatement(statement)
		&& ts.isBinaryExpression(statement.expression)
		&& isAssignmentOperator(statement.expression.operatorToken.kind)) {
		const result = executeAssignmentExpression(statement.expression, environment, context, callStack)
		return {
			foundNeutral: result.foundNeutral,
			fallsThrough: true,
			assignments: result.assignments,
			assignmentOwners: result.assignmentOwners,
			thrownAssignments: result.thrownAssignments,
			thrownAssignmentOwners: result.thrownAssignmentOwners,
			mayThrow: result.mayThrow === true,
		}
	}
	if (ts.isReturnStatement(statement) || ts.isThrowStatement(statement)) {
		const expression = executeExpressionEffects(statement.expression, environment, context, callStack)
		return {
			foundNeutral: expression.foundNeutral,
			fallsThrough: false,
			throws: ts.isThrowStatement(statement),
			mayThrow: ts.isThrowStatement(statement) || expression.mayThrow === true,
			assignments: expression.assignments,
			assignmentOwners: expression.assignmentOwners,
			thrownAssignments: ts.isThrowStatement(statement)
				? assignmentMap(expression.assignments, expression.thrownAssignments)
				: expression.thrownAssignments,
			thrownAssignmentOwners: ts.isThrowStatement(statement)
				? assignmentMap(expression.assignmentOwners, expression.thrownAssignmentOwners)
				: expression.thrownAssignmentOwners,
			returnValues: ts.isReturnStatement(statement) && statement.expression != null
				? [{ expression: statement.expression, environment: snapshotEnvironment(environment) }]
				: [],
			thrownValues: ts.isThrowStatement(statement) && statement.expression != null
				? [{ expression: statement.expression, environment: snapshotEnvironment(environment) }]
				: [],
		}
	}
	if (ts.isBlock(statement))
		return executeStatements(statement.statements, newLexicalEnvironment(environment), context, callStack)
	if (ts.isIfStatement(statement)) {
		const conditionFound = executeExpressionEffects(statement.expression, environment, context, callStack).foundNeutral
		const condition = lexicalBoolean(statement.expression, environment, context)
		if (condition === true) {
			const branch = executeBranch(statement.thenStatement, environment, context, callStack)
			const assignments = branch.fallsThrough ? mergePathAssignments(environment, [branch], context) : new Map<string, LexicalBinding>()
			return {
				foundNeutral: conditionFound || branch.foundNeutral,
				fallsThrough: branch.fallsThrough,
				returnValues: branch.returnValues,
				thrownValues: branch.thrownValues,
				breaks: branch.breaks,
				continues: branch.continues,
				throws: branch.throws,
				mayThrow: conditionFound || branch.mayThrow,
				assignments,
				assignmentOwners: assignmentOwnersFor(environment, assignments),
				thrownAssignments: branch.thrownAssignments,
				thrownAssignmentOwners: branch.thrownAssignmentOwners,
			}
		}
		if (condition === false) {
			if (statement.elseStatement == null)
				return { foundNeutral: conditionFound, fallsThrough: true }
			const branch = executeBranch(statement.elseStatement, environment, context, callStack)
			const assignments = branch.fallsThrough ? mergePathAssignments(environment, [branch], context) : new Map<string, LexicalBinding>()
			return {
				foundNeutral: conditionFound || branch.foundNeutral,
				fallsThrough: branch.fallsThrough,
				returnValues: branch.returnValues,
				thrownValues: branch.thrownValues,
				breaks: branch.breaks,
				continues: branch.continues,
				throws: branch.throws,
				mayThrow: conditionFound || branch.mayThrow,
				assignments,
				assignmentOwners: assignmentOwnersFor(environment, assignments),
				thrownAssignments: branch.thrownAssignments,
				thrownAssignmentOwners: branch.thrownAssignmentOwners,
			}
		}
		const thenBranch = executeBranch(statement.thenStatement, environment, context, callStack)
		const elseBranch = statement.elseStatement == null
			? { foundNeutral: false, fallsThrough: true }
			: executeBranch(statement.elseStatement, environment, context, callStack)
		const paths = [thenBranch, elseBranch].filter(branch => branch.fallsThrough)
		const assignments = mergePathAssignments(environment, paths, context)
		const thrownPaths = [thenBranch, elseBranch]
			.filter(branch => branch.throws === true || (branch.thrownAssignments?.size ?? 0) > 0)
		const thrown = mergeExitAssignments(environment, thrownPaths.map(branch => ({
			...branch,
			assignments: branch.thrownAssignments,
			assignmentOwners: branch.thrownAssignmentOwners,
		})), context)
		return {
			foundNeutral: conditionFound || thenBranch.foundNeutral || elseBranch.foundNeutral,
			fallsThrough: thenBranch.fallsThrough || elseBranch.fallsThrough,
			returnValues: boundResolvedExpressions([
				...(thenBranch.returnValues ?? []),
				...(elseBranch.returnValues ?? []),
			], context),
			thrownValues: boundResolvedExpressions([
				...(thenBranch.thrownValues ?? []),
				...(elseBranch.thrownValues ?? []),
			], context),
			breaks: thenBranch.breaks === true || elseBranch.breaks === true,
			continues: thenBranch.continues === true || elseBranch.continues === true,
			throws: thenBranch.throws === true || elseBranch.throws === true,
			mayThrow: conditionFound || thenBranch.mayThrow === true || elseBranch.mayThrow === true,
			assignments,
			assignmentOwners: assignmentOwnersFor(environment, assignments),
			thrownAssignments: thrown.assignments,
			thrownAssignmentOwners: thrown.assignmentOwners,
		}
	}
	if (ts.isTryStatement(statement)) {
		const tryResult = executeBranch(statement.tryBlock, environment, context, callStack)
		let foundNeutral = tryResult.foundNeutral
		let result: StatementFlow = tryResult
		if (statement.catchClause != null && (tryResult.mayThrow === true || tryResult.throws === true)) {
			const thrownValues = boundResolvedExpressions(tryResult.thrownValues ?? [], context)
			const thrownState = tryResult.thrownAssignments
			const thrownStateOwners = tryResult.thrownAssignmentOwners
			const catchResults = (thrownValues.length > 0 ? thrownValues : [undefined]).map((thrownValue) => {
				const catchEnvironment = newLexicalEnvironment(environment)
				seedAssignments(catchEnvironment, thrownState, thrownStateOwners)
				if (statement.catchClause?.variableDeclaration != null) {
					if (thrownValue != null)
						setInitializerBinding(catchEnvironment, statement.catchClause.variableDeclaration.name, thrownValue.expression, thrownValue.environment)
					else
						setUnknownBindings(catchEnvironment, statement.catchClause.variableDeclaration.name)
				}
				const catchResult = executeBranch(statement.catchClause!.block, catchEnvironment, context, callStack)
				return withIncomingAssignments(catchResult, thrownState, thrownStateOwners)
			})
			foundNeutral = foundNeutral || catchResults.some(catchResult => catchResult.foundNeutral)
			const paths = [tryResult, ...catchResults].filter(path => path.fallsThrough)
			const assignments = mergePathAssignments(environment, paths, context)
			const thrownPaths = catchResults
				.filter(catchResult => catchResult.throws === true || (catchResult.thrownAssignments?.size ?? 0) > 0)
				.map(catchResult => ({
					...catchResult,
					assignments: catchResult.thrownAssignments,
					assignmentOwners: catchResult.thrownAssignmentOwners,
				}))
			const thrown = mergeExitAssignments(environment, thrownPaths, context)
			result = {
				foundNeutral: foundNeutral || context.budgetExceeded,
				fallsThrough: paths.length > 0,
				assignments,
				assignmentOwners: assignmentOwnersFor(environment, assignments),
				returnValues: boundResolvedExpressions([
					...(tryResult.returnValues ?? []),
					...catchResults.flatMap(catchResult => catchResult.returnValues ?? []),
				], context),
				thrownValues: boundResolvedExpressions(catchResults.flatMap(catchResult => catchResult.thrownValues ?? []), context),
				thrownAssignments: thrown.assignments,
				thrownAssignmentOwners: thrown.assignmentOwners,
				breaks: tryResult.breaks === true || catchResults.some(catchResult => catchResult.breaks === true),
				continues: tryResult.continues === true || catchResults.some(catchResult => catchResult.continues === true),
				throws: catchResults.some(catchResult => catchResult.throws === true),
				mayThrow: catchResults.some(catchResult => catchResult.mayThrow === true),
			}
		}
		else if (tryResult.fallsThrough) {
			const assignments = mergePathAssignments(environment, [tryResult], context)
			result = { ...tryResult, assignments, assignmentOwners: assignmentOwnersFor(environment, assignments) }
		}
		if (statement.finallyBlock == null)
			return result
		const finallyEnvironment = newLexicalEnvironment(environment)
		seedAssignments(
			finallyEnvironment,
			assignmentMap(result.assignments, result.thrownAssignments),
			assignmentMap(result.assignmentOwners, result.thrownAssignmentOwners),
		)
		const finallyResult = executeBranch(statement.finallyBlock, finallyEnvironment, context, callStack)
		if (!finallyResult.fallsThrough) {
			return {
				foundNeutral: result.foundNeutral || finallyResult.foundNeutral,
				fallsThrough: false,
				returnValues: finallyResult.returnValues,
				thrownValues: finallyResult.thrownValues,
				thrownAssignments: finallyResult.thrownAssignments,
				thrownAssignmentOwners: finallyResult.thrownAssignmentOwners,
				breaks: finallyResult.breaks,
				continues: finallyResult.continues,
				throws: finallyResult.throws,
				mayThrow: result.mayThrow === true || finallyResult.mayThrow === true,
			}
		}
		const finallyAssignments = mergePathAssignments(environment, [finallyResult], context)
		return {
			foundNeutral: result.foundNeutral || finallyResult.foundNeutral || context.budgetExceeded,
			fallsThrough: result.fallsThrough,
			assignments: assignmentMap(result.assignments, finallyAssignments),
			assignmentOwners: assignmentOwnersFor(environment, assignmentMap(result.assignments, finallyAssignments)),
			thrownAssignments: assignmentMap(result.thrownAssignments, finallyAssignments),
			thrownAssignmentOwners: assignmentOwnersFor(environment, assignmentMap(result.thrownAssignments, finallyAssignments)),
			returnValues: boundResolvedExpressions(result.returnValues ?? [], context),
			thrownValues: boundResolvedExpressions(result.thrownValues ?? [], context),
			breaks: result.breaks,
			continues: result.continues,
			throws: result.throws,
			mayThrow: result.mayThrow === true || finallyResult.mayThrow === true,
		}
	}
	if (ts.isSwitchStatement(statement)) {
		const discriminantFound = executeExpressionEffects(statement.expression, environment, context, callStack).foundNeutral
		const clauses = statement.caseBlock.clauses
		const switchEnvironment = newLexicalEnvironment(newLexicalEnvironment(environment, true))
		const discriminant = lexicalSwitchValue(statement.expression, switchEnvironment, context)
		if (discriminant === UNRESOLVED_SWITCH_VALUE) {
			const caseFound = clauses.some(clause => ts.isCaseClause(clause)
				&& executeExpressionEffects(clause.expression, environment, context, callStack).foundNeutral)
			let foundNeutral = discriminantFound || caseFound
			let continues = false
			let returnValues: ResolvedExpression[] = []
			let thrownValues: ResolvedExpression[] = []
			const paths: StatementFlow[] = []
			const thrownPaths: StatementFlow[] = []
			for (let index = 0; index < clauses.length; index++) {
				const result = executeSwitchClauses(
					clauses.slice(index),
					newLexicalEnvironment(newLexicalEnvironment(environment, true)),
					context,
					callStack,
				)
				foundNeutral = foundNeutral || result.foundNeutral
				continues = continues || result.continues === true
				returnValues = boundResolvedExpressions([...returnValues, ...(result.returnValues ?? [])], context)
				thrownValues = boundResolvedExpressions([...thrownValues, ...(result.thrownValues ?? [])], context)
				if (result.fallsThrough)
					paths.push(result)
				if (result.throws === true || (result.thrownAssignments?.size ?? 0) > 0) {
					thrownPaths.push({
						...result,
						assignments: result.thrownAssignments,
						assignmentOwners: result.thrownAssignmentOwners,
					})
				}
			}
			const assignments = mergePathAssignments(environment, paths, context)
			const thrown = mergeExitAssignments(environment, thrownPaths, context)
			return {
				foundNeutral,
				fallsThrough: paths.length > 0,
				assignments,
				assignmentOwners: assignmentOwnersFor(environment, assignments),
				returnValues,
				thrownValues,
				thrownAssignments: thrown.assignments,
				thrownAssignmentOwners: thrown.assignmentOwners,
				continues,
			}
		}
		let caseFound = false
		let matchIndex = -1
		for (let index = 0; index < clauses.length; index++) {
			const clause = clauses[index]
			if (clause == null)
				continue
			if (!ts.isCaseClause(clause))
				continue
			caseFound = executeExpressionEffects(clause.expression, environment, context, callStack).foundNeutral || caseFound
			if (switchCaseMatches(discriminant, clause.expression, switchEnvironment, context)) {
				matchIndex = index
				break
			}
		}
		const startIndex = matchIndex >= 0 ? matchIndex : clauses.findIndex(ts.isDefaultClause)
		if (startIndex < 0)
			return { foundNeutral: discriminantFound || caseFound, fallsThrough: true }
		const result = executeSwitchClauses(clauses.slice(startIndex), switchEnvironment, context, callStack)
		const assignments = result.fallsThrough ? mergePathAssignments(environment, [result], context) : new Map<string, LexicalBinding>()
		return {
			foundNeutral: discriminantFound || caseFound || result.foundNeutral,
			fallsThrough: result.fallsThrough,
			assignments,
			assignmentOwners: assignmentOwnersFor(environment, assignments),
			returnValues: result.returnValues,
			thrownValues: result.thrownValues,
			thrownAssignments: result.thrownAssignments,
			thrownAssignmentOwners: result.thrownAssignmentOwners,
			continues: result.continues,
			throws: result.throws,
			mayThrow: result.mayThrow,
		}
	}
	if (ts.isWhileStatement(statement)) {
		const conditionFound = executeExpressionEffects(statement.expression, environment, context, callStack).foundNeutral
		const condition = lexicalBoolean(statement.expression, environment, context)
		if (condition === false)
			return { foundNeutral: conditionFound, fallsThrough: true }
		const body = executeBranch(statement.statement, environment, context, callStack)
		const paths: StatementFlow[] = []
		if (condition !== true)
			paths.push({ foundNeutral: false, fallsThrough: true })
		if (body.breaks === true || (condition !== true && body.fallsThrough))
			paths.push(body)
		const assignments = mergePathAssignments(environment, paths, context)
		return {
			foundNeutral: conditionFound || body.foundNeutral,
			fallsThrough: body.breaks === true || condition !== true,
			returnValues: body.returnValues,
			thrownValues: body.thrownValues,
			assignments,
			assignmentOwners: assignmentOwnersFor(environment, assignments),
			thrownAssignments: body.thrownAssignments,
			thrownAssignmentOwners: body.thrownAssignmentOwners,
			mayThrow: conditionFound || body.mayThrow === true,
		}
	}
	if (ts.isForStatement(statement)) {
		let foundNeutral = false
		if (statement.initializer != null) {
			if (ts.isVariableDeclarationList(statement.initializer)) {
				foundNeutral = executeVariableDeclarationList(statement.initializer, environment, context, callStack).foundNeutral
			}
			else {
				foundNeutral = executeAssignmentExpression(statement.initializer, environment, context, callStack).foundNeutral
			}
		}
		if (statement.condition != null) {
			foundNeutral = executeExpressionEffects(statement.condition, environment, context, callStack).foundNeutral || foundNeutral
			const initialCondition = staticNumericLoopCondition(statement, environment, context)
			if (lexicalBoolean(statement.condition, environment, context) === false || initialCondition === false)
				return { foundNeutral, fallsThrough: true }
		}
		const condition = statement.condition == null
			? true
			: lexicalBoolean(statement.condition, environment, context)
		const body = executeBranch(statement.statement, environment, context, callStack)
		const canReachLoopContinuation = body.fallsThrough || body.continues === true
		if (canReachLoopContinuation && statement.incrementor != null)
			foundNeutral = executeAssignmentExpression(statement.incrementor, environment, context, callStack).foundNeutral || foundNeutral
		let laterBody: StatementFlow | undefined
		const canReachLaterIteration = staticNumericLoopContinuation(statement, environment, context, statement.statement)
		if (canReachLoopContinuation && condition !== false && canReachLaterIteration !== false) {
			const laterIterationEnvironment = newLexicalEnvironment(environment)
			const assignment = simpleNumericLoopAssignment(statement)
			const loop = staticNumericLoop(statement, environment, context)
			if (assignment != null && ts.isIdentifier(assignment.left) && loop != null)
				assignLexicalIdentifier(laterIterationEnvironment, assignment.left, ts.factory.createNumericLiteral(String(loop.initial + loop.step)), laterIterationEnvironment)
			else if (statement.initializer != null)
				setLoopTargetUnknown(statement.initializer, laterIterationEnvironment)
			laterBody = executeBranch(statement.statement, laterIterationEnvironment, context, callStack)
		}
		const effectiveBody = laterBody ?? body
		const paths: StatementFlow[] = []
		if (condition !== true)
			paths.push({ foundNeutral: false, fallsThrough: true })
		if (effectiveBody.breaks === true || (condition !== true && effectiveBody.fallsThrough))
			paths.push(effectiveBody)
		const assignments = mergePathAssignments(environment, paths, context)
		return {
			foundNeutral: foundNeutral || body.foundNeutral || (laterBody?.foundNeutral ?? false),
			fallsThrough: effectiveBody.breaks === true || condition !== true,
			returnValues: boundResolvedExpressions([...(body.returnValues ?? []), ...(laterBody?.returnValues ?? [])], context),
			thrownValues: boundResolvedExpressions([...(body.thrownValues ?? []), ...(laterBody?.thrownValues ?? [])], context),
			assignments,
			assignmentOwners: assignmentOwnersFor(environment, assignments),
			thrownAssignments: body.thrownAssignments,
			thrownAssignmentOwners: body.thrownAssignmentOwners,
			mayThrow: body.mayThrow === true || laterBody?.mayThrow === true,
		}
	}
	if (ts.isDoStatement(statement)) {
		const body = executeBranch(statement.statement, environment, context, callStack)
		const canReachLoopContinuation = body.fallsThrough || body.continues === true
		if (!canReachLoopContinuation) {
			const assignments = body.breaks === true ? mergePathAssignments(environment, [body], context) : undefined
			return {
				foundNeutral: body.foundNeutral,
				fallsThrough: body.breaks === true,
				returnValues: body.returnValues,
				assignments,
				assignmentOwners: assignments == null ? undefined : assignmentOwnersFor(environment, assignments),
				thrownAssignments: body.thrownAssignments,
				thrownAssignmentOwners: body.thrownAssignmentOwners,
				breaks: body.breaks,
			}
		}
		const conditionFound = executeExpressionEffects(statement.expression, environment, context, callStack).foundNeutral
		const condition = lexicalBoolean(statement.expression, environment, context)
		let laterBody: StatementFlow | undefined
		if (canReachLoopContinuation && condition !== false)
			laterBody = executeBranch(statement.statement, newLexicalEnvironment(environment), context, callStack)
		const effectiveBody = laterBody ?? body
		const paths: StatementFlow[] = [{ foundNeutral: false, fallsThrough: true }]
		if (effectiveBody.breaks === true || effectiveBody.fallsThrough)
			paths.push(effectiveBody)
		const assignments = mergePathAssignments(environment, paths, context)
		return {
			foundNeutral: conditionFound || body.foundNeutral || (laterBody?.foundNeutral ?? false),
			fallsThrough: effectiveBody.breaks === true || condition !== true,
			returnValues: boundResolvedExpressions([...(body.returnValues ?? []), ...(laterBody?.returnValues ?? [])], context),
			thrownValues: boundResolvedExpressions([...(body.thrownValues ?? []), ...(laterBody?.thrownValues ?? [])], context),
			assignments,
			assignmentOwners: assignmentOwnersFor(environment, assignments),
			thrownAssignments: body.thrownAssignments,
			thrownAssignmentOwners: body.thrownAssignmentOwners,
			mayThrow: conditionFound || body.mayThrow === true || laterBody?.mayThrow === true,
		}
	}
	if (ts.isForOfStatement(statement) || ts.isForInStatement(statement)) {
		const iterableFound = executeExpressionEffects(statement.expression, environment, context, callStack).foundNeutral
		const forIn = ts.isForInStatement(statement)
		if (isDefinitelyEmptyLoopCollection(statement.expression, environment, forIn))
			return { foundNeutral: iterableFound, fallsThrough: true }
		const loopEnvironment = newLexicalEnvironment(environment)
		setLoopTargetUnknown(statement.initializer, loopEnvironment)
		const body = executeBranch(statement.statement, loopEnvironment, context, callStack)
		const paths: StatementFlow[] = [{ foundNeutral: false, fallsThrough: true }]
		if (body.breaks === true || body.fallsThrough || body.continues === true)
			paths.push(body)
		const assignments = mergePathAssignments(environment, paths, context)
		return {
			foundNeutral: iterableFound || body.foundNeutral,
			fallsThrough: body.breaks === true || body.fallsThrough || body.continues === true,
			returnValues: body.returnValues,
			thrownValues: body.thrownValues,
			assignments,
			assignmentOwners: assignmentOwnersFor(environment, assignments),
			thrownAssignments: body.thrownAssignments,
			thrownAssignmentOwners: body.thrownAssignmentOwners,
			mayThrow: iterableFound || body.mayThrow === true,
		}
	}
	if (ts.isExpressionStatement(statement)) {
		const assignment = executeExpressionEffects(statement.expression, environment, context, callStack)
		return {
			foundNeutral: assignment.foundNeutral,
			fallsThrough: true,
			assignments: assignment.assignments,
			assignmentOwners: assignment.assignmentOwners,
			thrownAssignments: assignment.thrownAssignments,
			thrownAssignmentOwners: assignment.thrownAssignmentOwners,
			mayThrow: assignment.mayThrow === true,
		}
	}
	return { foundNeutral: false, fallsThrough: true }
}

function executeStatements(
	statements: readonly ts.Statement[],
	environment: LexicalEnvironment,
	context: IconAnalysisContext,
	callStack: ReadonlySet<ts.FunctionLikeDeclaration>,
): StatementFlow {
	populateBlockEnvironment(environment, statements)
	let foundNeutral = false
	let returnValues: ResolvedExpression[] = []
	let thrownValues: ResolvedExpression[] = []
	let assignments = new Map<string, LexicalBinding>()
	let assignmentOwners = new Map<string, LexicalEnvironment>()
	let thrownAssignments = new Map<string, LexicalBinding>()
	let thrownAssignmentOwners = new Map<string, LexicalEnvironment>()
	let mayThrow = false
	let breaks = false
	let continues = false
	for (const statement of statements) {
		const result = executeStatement(statement, environment, context, callStack)
		foundNeutral = foundNeutral || result.foundNeutral
		returnValues = boundResolvedExpressions([...returnValues, ...(result.returnValues ?? [])], context)
		thrownValues = boundResolvedExpressions([...thrownValues, ...(result.thrownValues ?? [])], context)
		assignments = assignmentMap(assignments, result.assignments)
		assignmentOwners = assignmentMap(assignmentOwners, result.assignmentOwners)
		mayThrow = mayThrow || result.mayThrow === true
		if (result.mayThrow === true && result.fallsThrough) {
			const possible = result.thrownAssignments ?? assignments
			thrownAssignments = assignmentMap(thrownAssignments, possible)
			thrownAssignmentOwners = assignmentMap(thrownAssignmentOwners, result.thrownAssignmentOwners ?? assignmentOwners)
		}
		breaks = breaks || result.breaks === true
		continues = continues || result.continues === true
		if (!result.fallsThrough) {
			const exitAssignments = result.throws
				? assignmentMap(assignments, result.thrownAssignments)
				: new Map(assignments)
			const exitOwners = result.throws
				? assignmentMap(assignmentOwners, result.thrownAssignmentOwners)
				: new Map(assignmentOwners)
			return {
				foundNeutral: foundNeutral || context.budgetExceeded,
				fallsThrough: false,
				environment,
				assignments: exitAssignments,
				assignmentOwners: exitOwners,
				thrownAssignments: result.throws ? exitAssignments : result.thrownAssignments,
				thrownAssignmentOwners: result.throws ? exitOwners : result.thrownAssignmentOwners,
				returnValues,
				thrownValues,
				breaks,
				continues,
				throws: result.throws,
				mayThrow,
			}
		}
	}
	return {
		foundNeutral: foundNeutral || context.budgetExceeded,
		fallsThrough: true,
		environment,
		assignments,
		assignmentOwners,
		thrownAssignments,
		thrownAssignmentOwners,
		returnValues,
		thrownValues,
		breaks,
		continues,
		mayThrow,
	}
}

function executeFunction(
	declaration: ts.FunctionLikeDeclaration,
	closure: LexicalEnvironment,
	context: IconAnalysisContext,
	argumentsList: readonly ResolvedExpression[] | undefined,
	callStack: ReadonlySet<ts.FunctionLikeDeclaration>,
): StatementFlow {
	if (callStack.has(declaration) || declaration.body == null)
		return { foundNeutral: false, fallsThrough: true, returnValues: [] }
	const functionEnvironment = newFunctionEnvironment(closure)
	if (declaration.name != null && ts.isIdentifier(declaration.name)) {
		setEnvironmentBinding(functionEnvironment, declaration.name.text, {
			kind: 'function',
			declaration,
			environment: functionEnvironment,
		})
	}
	for (let index = 0; index < declaration.parameters.length; index++) {
		const parameter = declaration.parameters[index]
		if (parameter == null)
			continue
		const argument = argumentsList?.[index]
		if (argument != null)
			setInitializerBinding(functionEnvironment, parameter.name, argument.expression, argument.environment)
		else
			setInitializerBinding(functionEnvironment, parameter.name, parameter.initializer)
	}
	const nextCallStack = new Set(callStack)
	nextCallStack.add(declaration)
	if (!ts.isBlock(declaration.body)) {
		const expression = executeExpressionEffects(declaration.body, functionEnvironment, context, nextCallStack)
		return {
			foundNeutral: expression.foundNeutral,
			fallsThrough: false,
			mayThrow: expression.mayThrow === true,
			assignments: expression.assignments,
			assignmentOwners: expression.assignmentOwners,
			thrownAssignments: expression.thrownAssignments,
			thrownAssignmentOwners: expression.thrownAssignmentOwners,
			returnValues: [{ expression: declaration.body, environment: snapshotEnvironment(functionEnvironment) }],
		}
	}
	populateFunctionEnvironment(functionEnvironment, declaration.body.statements)
	const execution = executeStatements(declaration.body.statements, newLexicalEnvironment(functionEnvironment), context, nextCallStack)
	const capturedAssignments = new Map<string, LexicalBinding>()
	const capturedOwners = new Map<string, LexicalEnvironment>()
	for (const [name, binding] of execution.assignments ?? []) {
		const owner = execution.assignmentOwners?.get(name)
		if (owner == null || isWithinEnvironment(owner, functionEnvironment))
			continue
		capturedAssignments.set(name, binding)
		capturedOwners.set(name, owner)
	}
	return {
		...execution,
		assignments: capturedAssignments,
		assignmentOwners: capturedOwners,
	}
}

function isWithinEnvironment(environment: LexicalEnvironment, ancestor: LexicalEnvironment): boolean {
	let current: LexicalEnvironment | undefined = environment
	while (current != null) {
		if (current === ancestor)
			return true
		current = current.parent
	}
	return false
}

function applyCapturedAssignments(
	environment: LexicalEnvironment,
	executions: readonly StatementFlow[],
	context: IconAnalysisContext,
): AssignmentEffects {
	const byName = new Map<string, Map<LexicalEnvironment, LexicalBinding[]>>()
	for (const execution of executions) {
		for (const [name, binding] of execution.assignments ?? []) {
			const owner = execution.assignmentOwners?.get(name)
			if (owner == null)
				continue
			const owners = byName.get(name) ?? new Map<LexicalEnvironment, LexicalBinding[]>()
			const values = owners.get(owner) ?? []
			values.push(binding)
			owners.set(owner, values)
			byName.set(name, owners)
		}
	}
	const assignments = new Map<string, LexicalBinding>()
	const assignmentOwners = new Map<string, LexicalEnvironment>()
	for (const [name, owners] of byName) {
		for (const [owner, values] of owners) {
			const current = lexicalBinding(environment, name)
			const currentOwner = current == null ? undefined : bindingOwner(environment, name, current)
			if (current == null || (currentOwner !== owner && !isWithinEnvironment(environment, owner)))
				continue
			const original = owner.bindings.get(name) ?? (currentOwner === owner ? current : undefined)
			if (original == null)
				continue
			const binding = unionBindings(
				values.length < executions.length ? [original, ...values] : values,
				owner,
				context,
			)
			const target = nearestIsolatedEnvironment(environment) ?? owner
			setEnvironmentBinding(
				target === owner || (target !== owner && isWithinEnvironment(owner, target))
					? owner
					: target,
				name,
				binding,
				owner,
			)
			assignments.set(name, binding)
			assignmentOwners.set(name, owner)
		}
	}
	return { assignments, assignmentOwners }
}

function nearestIsolatedEnvironment(environment: LexicalEnvironment): LexicalEnvironment | undefined {
	let current: LexicalEnvironment | undefined = environment
	while (current != null) {
		if (current.isolated)
			return current
		current = current.parent
	}
	return undefined
}

function resolveStaticCallResults(
	call: ts.CallExpression,
	environment: LexicalEnvironment,
	context: IconAnalysisContext,
	callStack: ReadonlySet<ts.FunctionLikeDeclaration>,
): ResolvedExpression[] {
	const argumentsList = call.arguments.map(expression => ({ expression, environment }))
	const results: ResolvedExpression[] = []
	const executions: StatementFlow[] = []
	for (const candidate of resolveFunctionCandidates(call.expression, environment, context, new Set(), callStack)) {
		const execution = executeFunction(candidate.declaration, candidate.environment, context, argumentsList, callStack)
		executions.push(execution)
		const nestedCallStack = new Set(callStack)
		nestedCallStack.add(candidate.declaration)
		for (const result of execution.returnValues ?? []) {
			const returnedExpression = unwrapReturnedExpression(result.expression)
			if (ts.isCallExpression(returnedExpression)) {
				const nestedResults = resolveStaticCallResults(returnedExpression, result.environment, context, nestedCallStack)
				if (nestedResults.length > 0) {
					results.push(...nestedResults)
					continue
				}
				continue
			}
			results.push({ expression: returnedExpression, environment: result.environment })
		}
	}
	applyCapturedAssignments(environment, executions, context)
	return results
}

function unwrapReturnedExpression(expression: ts.Expression): ts.Expression {
	const current = unwrapExpression(expression)
	if (!ts.isBinaryExpression(current))
		return current
	if (current.operatorToken.kind === ts.SyntaxKind.CommaToken
		|| isAssignmentOperator(current.operatorToken.kind)) {
		return unwrapReturnedExpression(current.right)
	}
	return current
}

function callCallsNeutralIcons(
	call: ts.CallExpression,
	environment: LexicalEnvironment,
	context: IconAnalysisContext,
	callStack: ReadonlySet<ts.FunctionLikeDeclaration>,
	argumentsEnvironment = environment,
	commitEnvironment = environment,
): AssignmentEffects & { foundNeutral: boolean } {
	if (isNeutralFactoryReference(call.expression, environment, context, new Set(), callStack))
		return { foundNeutral: true }
	const argumentsList = call.arguments.map(expression => ({ expression, environment: argumentsEnvironment }))
	const executions: StatementFlow[] = []
	let foundNeutral = false
	for (const candidate of resolveFunctionCandidates(call.expression, environment, context)) {
		const execution = executeFunction(candidate.declaration, candidate.environment, context, argumentsList, callStack)
		executions.push(execution)
		foundNeutral = foundNeutral || execution.foundNeutral
	}
	return {
		...applyCapturedAssignments(commitEnvironment, executions, context),
		foundNeutral,
	}
}

function expressionCallsNeutralIcons(
	expression: ts.Expression | undefined,
	environment: LexicalEnvironment,
	context: IconAnalysisContext,
	seen: Set<LexicalBinding>,
	callStack: ReadonlySet<ts.FunctionLikeDeclaration>,
): boolean {
	if (context.budgetExceeded)
		return true
	if (expression == null)
		return false
	const current = unwrapExpression(expression)
	if (ts.isIdentifier(current)) {
		const binding = lexicalBinding(environment, current.text)
		if (binding == null || seen.has(binding))
			return false
		if (binding.kind === 'union') {
			const nextSeen = new Set(seen)
			nextSeen.add(binding)
			return bindingAlternatives(binding)
				.some(alternative => expressionCallsNeutralIcons(current, { ...environment, bindings: new Map([[current.text, alternative]]) }, context, nextSeen, callStack))
		}
		if (binding.kind !== 'initializer' || binding.initializer == null)
			return false
		const nextSeen = new Set(seen)
		nextSeen.add(binding)
		return expressionCallsNeutralIcons(binding.initializer, bindingInitializerEnvironment(binding), context, nextSeen, callStack)
	}
	if (ts.isCallExpression(current)) {
		if (callCallsNeutralIcons(current, environment, context, callStack).foundNeutral)
			return true
		if (context.budgetExceeded)
			return true
		return current.arguments.some(argument => expressionCallsNeutralIcons(argument, environment, context, new Set(seen), callStack))
	}
	// A function value is inert until a statically resolved call invokes it.
	if (ts.isArrowFunction(current) || ts.isFunctionExpression(current) || ts.isClassExpression(current))
		return false
	if (ts.isConditionalExpression(current)) {
		const condition = lexicalBoolean(current.condition, environment, context)
		if (condition === true)
			return expressionCallsNeutralIcons(current.whenTrue, environment, context, seen, callStack)
		if (condition === false)
			return expressionCallsNeutralIcons(current.whenFalse, environment, context, seen, callStack)
		return expressionCallsNeutralIcons(current.whenTrue, environment, context, new Set(seen), callStack)
			|| expressionCallsNeutralIcons(current.whenFalse, environment, context, new Set(seen), callStack)
	}
	if (ts.isBinaryExpression(current)) {
		const operator = current.operatorToken.kind
		if (isAssignmentOperator(operator))
			return expressionCallsNeutralIcons(current.right, environment, context, new Set(seen), callStack)
		if (operator === ts.SyntaxKind.BarBarToken || operator === ts.SyntaxKind.AmpersandAmpersandToken || operator === ts.SyntaxKind.QuestionQuestionToken) {
			const left = expressionCallsNeutralIcons(current.left, environment, context, new Set(seen), callStack)
			const leftValue = operator === ts.SyntaxKind.QuestionQuestionToken
				? lexicalNullish(current.left, environment, context)
				: lexicalBoolean(current.left, environment, context)
			if (leftValue === true) {
				return operator === ts.SyntaxKind.BarBarToken
					? left
					: left || expressionCallsNeutralIcons(current.right, environment, context, new Set(seen), callStack)
			}
			if (leftValue === false) {
				return operator === ts.SyntaxKind.BarBarToken
					? left || expressionCallsNeutralIcons(current.right, environment, context, new Set(seen), callStack)
					: left
			}
			return left || expressionCallsNeutralIcons(current.right, environment, context, new Set(seen), callStack)
		}
	}
	let found = false
	ts.forEachChild(current, (child) => {
		if (!found && ts.isExpression(child)
			&& !ts.isFunctionExpression(child)
			&& !ts.isArrowFunction(child)
			&& !ts.isClassExpression(child)) {
			found = expressionCallsNeutralIcons(child, environment, context, new Set(seen), callStack)
		}
	})
	return found
}

function definedConfigArgument(
	expression: ts.Expression,
	variables: VariableBindings,
	seen = new Set<string>(),
): ResolvedStaticExpression | undefined {
	const current = unwrapExpression(expression)
	if (ts.isIdentifier(current)) {
		if (seen.has(current.text))
			return undefined
		const binding = variables.get(current.text)
		if (binding == null)
			return { expression: current, variables }
		const nextSeen = new Set(seen)
		nextSeen.add(current.text)
		return definedConfigArgument(binding.initializer, binding.variables, nextSeen)
	}
	if (!ts.isCallExpression(current)) {
		if (ts.isObjectLiteralExpression(current)) {
			const defaultValue = resolveObjectProperty(current, 'default', variables)
			if (defaultValue != null)
				return definedConfigArgument(defaultValue, variables)
		}
		return { expression: current, variables }
	}
	const argument = current.arguments[0]
	if (argument == null)
		return undefined
	const unwrappedArgument = unwrapExpression(argument)
	if ((ts.isArrowFunction(unwrappedArgument) || ts.isFunctionExpression(unwrappedArgument)) && ts.isBlock(unwrappedArgument.body)) {
		const returned = unwrappedArgument.body.statements.find(ts.isReturnStatement)
		return returned?.expression == null ? undefined : { expression: returned.expression, variables }
	}
	if (ts.isArrowFunction(unwrappedArgument) && !ts.isBlock(unwrappedArgument.body))
		return { expression: unwrappedArgument.body, variables }
	return { expression: argument, variables }
}

function exportTarget(expression: ts.Expression): boolean {
	const current = unwrapExpression(expression)
	if (!ts.isPropertyAccessExpression(current))
		return false
	const object = unwrapExpression(current.expression)
	const isDefaultExport = current.name.text === 'default'
	const isExportsObject = (ts.isIdentifier(object) && object.text === 'exports')
		|| (ts.isPropertyAccessExpression(object)
			&& ts.isIdentifier(object.expression)
			&& object.expression.text === 'module'
			&& object.name.text === 'exports')
	return (isDefaultExport && isExportsObject)
		|| (current.name.text === 'exports' && ts.isIdentifier(object) && object.text === 'module')
}

interface ConfigExpression {
	readonly expression: ts.Expression
	readonly variables: VariableBindings
	readonly statementIndex: number
}

function configExpressions(source: ts.SourceFile): ConfigExpression[] {
	const expressions: ConfigExpression[] = []
	const variables = new Map<string, VariableBinding>()
	for (let statementIndex = 0; statementIndex < source.statements.length; statementIndex++) {
		const statement = source.statements[statementIndex]
		if (statement == null)
			continue
		if (ts.isExportAssignment(statement)) {
			expressions.push({
				expression: statement.expression,
				variables: new Map(variables),
				statementIndex,
			})
			continue
		}
		if (ts.isExpressionStatement(statement) && ts.isBinaryExpression(statement.expression)
			&& statement.expression.operatorToken.kind === ts.SyntaxKind.EqualsToken
			&& exportTarget(statement.expression.left)) {
			expressions.push({
				expression: statement.expression.right,
				variables: new Map(variables),
				statementIndex,
			})
			continue
		}
		collectVariableInitializers(variables, statement)
	}
	return expressions
		.map((config) => {
			const defined = definedConfigArgument(config.expression, config.variables)
			return defined == null ? undefined : { ...config, ...defined }
		})
		.filter((config): config is ConfigExpression => config != null)
}

function staticOptionKind(expression: ts.Expression, variables: VariableBindings, seen = new Set<string>()): 'undefined' | 'false' | 'true' | 'concrete' | 'unknown' {
	const current = unwrapExpression(expression)
	if (ts.isIdentifier(current)) {
		if (current.text === 'undefined')
			return 'undefined'
		if (seen.has(current.text))
			return 'unknown'
		const binding = variables.get(current.text)
		if (binding == null)
			return 'unknown'
		const nextSeen = new Set(seen)
		nextSeen.add(current.text)
		return staticOptionKind(binding.initializer, binding.variables, nextSeen)
	}
	if (current.kind === ts.SyntaxKind.TrueKeyword)
		return 'true'
	if (current.kind === ts.SyntaxKind.FalseKeyword)
		return 'false'
	if (current.kind === ts.SyntaxKind.NullKeyword)
		return 'undefined'
	if (ts.isStringLiteralLike(current) || ts.isArrayLiteralExpression(current))
		return 'concrete'
	return 'unknown'
}

function optionRequestsNodeCapability(
	result: ResolvedObjectPropertyValues,
	option: typeof NODE_ONLY_ICON_OPTIONS[number],
): boolean {
	if (result.possiblyDefines && !result.definitelyDefines)
		return true
	return result.values.some((value) => {
		const kind = staticOptionKind(value.expression, value.variables)
		if (option === 'autoInstall')
			return kind !== 'undefined' && kind !== 'false'
		return kind !== 'undefined'
	})
}

function analyzeIconsConfigCapabilities(configContent: string): { neutralIconsPluginActive: boolean, nodeOnlyOption: boolean } {
	const source = ts.createSourceFile('pika.config.ts', configContent, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
	const neutralIconBindings = new Set<string>()
	const neutralIconNamespaces = new Set<string>()

	for (const statement of source.statements) {
		if (ts.isImportDeclaration(statement)
			&& ts.isStringLiteral(statement.moduleSpecifier)
			&& statement.moduleSpecifier.text === '@pikacss/plugin-icons') {
			const bindings = statement.importClause?.namedBindings
			if (bindings != null && ts.isNamedImports(bindings)) {
				for (const element of bindings.elements) {
					const importedName = element.propertyName?.text ?? element.name.text
					if (importedName === 'icons')
						neutralIconBindings.add(element.name.text)
				}
			}
			else if (bindings != null && ts.isNamespaceImport(bindings)) {
				neutralIconNamespaces.add(bindings.name.text)
			}
			continue
		}
		if (ts.isImportEqualsDeclaration(statement)
			&& ts.isExternalModuleReference(statement.moduleReference)
			&& ts.isStringLiteralLike(statement.moduleReference.expression)
			&& statement.moduleReference.expression.text === '@pikacss/plugin-icons') {
			neutralIconNamespaces.add(statement.name.text)
		}
	}

	const entries = configExpressions(source)
		.flatMap((config) => {
			const resolved = resolveVariableExpression(config.expression, config.variables)
			const expressions = ts.isArrayLiteralExpression(resolved.expression)
				? [...resolved.expression.elements].filter(ts.isExpression)
				: [config.expression]
			return expressions.map(expression => ({
				expression,
				variables: ts.isArrayLiteralExpression(resolved.expression) ? resolved.variables : config.variables,
				statementIndex: config.statementIndex,
			}))
		})
	const entryCapabilities = entries.map((entry) => {
		const engineResult = resolveObjectPropertyValueResult(entry.expression, 'engine', entry.variables)
		const engines = engineResult.values
		const pluginResults = engines.map(engine => resolveObjectPropertyValueResult(engine.expression, 'plugins', engine.variables))
		const iconResults = engines.map(engine => resolveObjectPropertyValueResult(engine.expression, 'icons', engine.variables))
		const plugins = pluginResults.flatMap(result => result.values)
		const icons = iconResults.flatMap(result => result.values)
		const possiblyNeutralPlugins = pluginResults.some(result => result.possiblyDefines && !result.definitelyDefines)
		const unknownIconsConfig = icons.some((iconsConfig) => {
			if (staticOptionKind(iconsConfig.expression, iconsConfig.variables) === 'undefined')
				return false
			const resolved = resolveVariableExpression(iconsConfig.expression, iconsConfig.variables)
			return !ts.isObjectLiteralExpression(resolved.expression) && !isStaticallyKnownObject(iconsConfig.expression, iconsConfig.variables)
		})
		const neutralPlugin = (plugin: ResolvedStaticExpression): boolean => {
			const pluginContext: IconAnalysisContext = {
				variables: plugin.variables,
				rootEnvironment: createRootEnvironment(source, neutralIconBindings, neutralIconNamespaces, entry.statementIndex, plugin.variables),
				budgetExceeded: false,
			}
			return executeExpressionEffects(plugin.expression, pluginContext.rootEnvironment, pluginContext, new Set()).foundNeutral
		}
		return {
			neutral: possiblyNeutralPlugins || plugins.some(neutralPlugin),
			node: unknownIconsConfig || NODE_ONLY_ICON_OPTIONS.some(option => icons.some(iconsConfig =>
				optionRequestsNodeCapability(resolveObjectPropertyValueResult(iconsConfig.expression, option, iconsConfig.variables), option))),
		}
	})

	return {
		neutralIconsPluginActive: entryCapabilities.some(entry => entry.neutral),
		nodeOnlyOption: entryCapabilities.some(entry => entry.neutral && entry.node),
	}
}

/**
 * Returns a contract violation when a workspace config activates the neutral
 * icons plugin while requesting Node-only local icon capabilities.
 *
 * Repository policy is intentionally conservative: when a workspace directly
 * installs `@iconify-json/*` and activates the icons plugin, that config uses
 * the `/node` entry even if the current source tree does not yet reference the
 * installed collection. `autoInstall` and `cwd` likewise require `/node`.
 */
export function localIconAdapterViolation(manifestContent: string, configContent: string): string | undefined {
	const manifest = JSON.parse(manifestContent) as Record<string, unknown>
	const localCollections = new Set<string>()

	for (const field of LOCAL_ICON_DEPENDENCY_FIELDS) {
		const dependencies = manifest[field]
		if (dependencies == null || typeof dependencies !== 'object' || Array.isArray(dependencies))
			continue
		for (const name of Object.keys(dependencies)) {
			if (name.startsWith('@iconify-json/'))
				localCollections.add(name)
		}
	}

	const { neutralIconsPluginActive, nodeOnlyOption } = analyzeIconsConfigCapabilities(configContent)
	if (!neutralIconsPluginActive || (localCollections.size === 0 && !nodeOnlyOption))
		return undefined

	const reasons: string[] = []
	if (localCollections.size > 0) {
		reasons.push(`local Iconify collections (${[...localCollections].sort()
			.join(', ')})`)
	}
	if (nodeOnlyOption)
		reasons.push('Node-only icons options (`autoInstall` or `cwd`)')

	return `${reasons.join(' and ')} require icons() from @pikacss/plugin-icons/node`
}

export interface ForbiddenPathFinding {
	path: string
	reason: string
	remedy: string
}

export function findForbiddenPaths(changedPaths: string[]): ForbiddenPathFinding[] {
	const findings: ForbiddenPathFinding[] = []
	for (const path of changedPaths) {
		const rule = FORBIDDEN_PATH_RULES.find(r => r.matches(path))
		if (rule != null)
			findings.push({ path, reason: rule.reason, remedy: rule.remedy })
	}
	return findings
}

/**
 * True when every added/removed line in a unified diff is a comment or blank.
 *
 * JSDoc-only sweeps touch many source files without changing behavior, so they
 * must not trip the "source changed but no test changed" gate. Anything that is
 * not clearly a comment counts as a code change: the gate errs toward asking
 * for a test.
 */
export function isCommentOnlyDiff(diff: string): boolean {
	const changedLines = diff
		.split('\n')
		.filter(line => /^[+-]/.test(line) && !/^(?:\+\+\+|---)/.test(line))
		.map(line => line.slice(1)
			.trim())

	if (changedLines.length === 0)
		return true

	return changedLines.every(line =>
		line === ''
		|| line.startsWith('//')
		|| line.startsWith('/*')
		|| line.startsWith('*/')
		|| line.startsWith('*'),
	)
}

const RE_PACKAGE_SOURCE = /^packages\/([^/]+)\/src\/.+\.tsx?$/
const RE_TEST_FILE = /\.(?:test|spec|bench)\.tsx?$/

/** Source files whose changes never need a matching test change. */
function isExemptSource(path: string): boolean {
	return RE_TEST_FILE.test(path)
		|| path.includes('/src/generated/')
		|| /\.gen\.[^/]+$/.test(path)
}

export function packageOfSourcePath(path: string): string | undefined {
	const match = RE_PACKAGE_SOURCE.exec(path)
	return match?.[1]
}

export interface ChangedSourceFile {
	path: string
	commentOnly: boolean
}

/**
 * Packages whose behavior changed without any test file in the same package
 * changing. AGENTS.md requires every fix to ship a regression test; this is the
 * part of that rule a script can prove.
 */
export function packagesMissingTestChanges(files: ChangedSourceFile[]): string[] {
	const changedCode = new Set<string>()
	const changedTests = new Set<string>()

	for (const { path, commentOnly } of files) {
		const pkg = packageOfSourcePath(path)
		if (pkg == null)
			continue

		if (RE_TEST_FILE.test(path)) {
			changedTests.add(pkg)
			continue
		}

		if (isExemptSource(path) || commentOnly)
			continue

		changedCode.add(pkg)
	}

	return [...changedCode].filter(pkg => !changedTests.has(pkg))
		.sort()
}

/** Label an owner applies to waive the regression-test requirement on one pull request. */
export const NO_TEST_NEEDED_LABEL = 'no-test-needed'

export function hasWaiverLabel(rawLabels: string | undefined): boolean {
	if (rawLabels == null)
		return false
	return rawLabels
		.split(',')
		.map(label => label.trim())
		.includes(NO_TEST_NEEDED_LABEL)
}
