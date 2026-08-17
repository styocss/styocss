/**
 * #110 — deterministic concurrency regression harness.
 *
 * Two independent actors (each its own `createCtx()` → own Engine) share one
 * project root and one set of generated artifacts. Execution order is forced
 * through explicit await sequencing plus `createGate()` checkpoints at the
 * actor's write-attempt boundary — never sleeps or scheduler luck. The
 * checkpoints wrap the public write operations, not any internal fs
 * primitive, so the harness survives #111/#112 changing how the artifact is
 * physically replaced (e.g. temp file + safe rename).
 *
 * `serve` vs `build` is metadata, not an ownership key: a serve actor feeds
 * styles through per-module `transform()`, a build actor through the
 * `fullyCssCodegen()` full-scan path. Same-mode pairings are covered
 * explicitly.
 *
 * The oracle is semantic, not existential: the class id a module was
 * transformed to must mean, in the CSS that actor actually consumes, the same
 * declaration the actor compiled. Assertions never mention lock files, run
 * directories, or any other future ownership implementation.
 *
 * Tests marked `it.fails` document the current shared-artifact corruption.
 * #111/#112 are expected to turn them into ordinary passing tests.
 */
import type { IntegrationContext, IntegrationContextOptions } from './types'
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'pathe'
import { afterEach, describe, expect, it } from 'vitest'
import { createGate } from '../../_shared/vitest'
import { createCtx } from './ctx'

const TEST_TIMEOUT = 20_000

type Gate = ReturnType<typeof createGate>

/**
 * Suspends an actor's write operation at an architecture-independent
 * checkpoint: the returned promise announces arrival at the write attempt
 * (via `gate.reached`) and performs the whole write only after the test
 * releases the gate. This deliberately knows nothing about how the write is
 * implemented internally, so #111/#112 may switch to temp+replace (or any
 * other strategy) without invalidating the harness.
 */
function writeWhenReleased(gate: Gate, write: () => Promise<void>) {
	return (async () => {
		await gate.pass()
		await write()
	})()
}

const createdDirs: string[] = []

async function createSharedRoot() {
	// realpath: macOS `os.tmpdir()` is a symlink and path-based matching should
	// see the canonical root, like a real project would.
	const root = await realpath(await mkdtemp(join(tmpdir(), 'pikacss-concurrency-')))
	createdDirs.push(root)
	await mkdir(join(root, 'src'), { recursive: true })
	// `m*` files are ordered red-first, `n*` files flex-first, so actors can
	// deterministically mint opposite class-to-declaration mappings either by
	// transform order (serve) or by sorted full-scan scope (build).
	// `p-preview.ts` exists solely for the typegen contention test: a preview
	// usage gives one actor a declaration surface the other does not have.
	await writeFile(join(root, 'src/m1-red.ts'), 'export const cls = pika({ color: \'red\' })\n')
	await writeFile(join(root, 'src/m2-flex.ts'), 'export const cls = pika({ display: \'flex\' })\n')
	await writeFile(join(root, 'src/n1-flex.ts'), 'export const cls = pika({ display: \'flex\' })\n')
	await writeFile(join(root, 'src/n2-red.ts'), 'export const cls = pika({ color: \'red\' })\n')
	await writeFile(join(root, 'src/p-preview.ts'), 'export const cls = pikap({ color: \'blue\' })\n')
	return root
}

interface Actor {
	name: string
	root: string
	ctx: IntegrationContext
	/** Transform one shared-root module through this actor's own pipeline. */
	transformFile: (rel: string) => Promise<string>
	/** Class id this actor's transformed module references. */
	classIn: (rel: string) => string
	/** Class id this actor committed for a module (full-scan actors hold no transformed code). */
	idOf: (rel: string) => string
	/** The CSS this actor itself would emit — its semantic ground truth. */
	ownCss: () => Promise<string>
	writeCss: () => Promise<void>
	/** The CSS this actor actually consumes through its own resolved artifact. */
	consumedCss: () => Promise<string>
	buildScan: () => Promise<void>
	tsContent: () => Promise<string>
	writeTs: () => Promise<void>
}

async function createActor(root: string, name: string, overrides?: Partial<IntegrationContextOptions>): Promise<Actor> {
	const ctx = createCtx({
		cwd: root,
		currentPackageName: '@pikacss/core',
		scan: { include: ['src/**/*.ts'], exclude: [] },
		configOrPath: {},
		fnName: 'pika',
		transformedFormat: 'string',
		tsCodegen: 'pika.gen.ts',
		cssCodegen: 'pika.gen.css',
		autoCreateConfig: false,
		...overrides,
	})
	await ctx.setup()

	const transformed = new Map<string, string>()
	return {
		name,
		root,
		ctx,
		transformFile: async (rel) => {
			const code = await readFile(join(root, rel), 'utf8')
			const result = await ctx.transform(code, rel)
			if (result == null)
				throw new Error(`[${name}] transform produced no output for ${rel}`)
			transformed.set(rel, result.code)
			return result.code
		},
		classIn: (rel) => {
			const match = transformed.get(rel)
				?.match(/pk-[A-Za-z]+/)
			if (match == null)
				throw new Error(`[${name}] no transformed class id recorded for ${rel}`)
			return match[0]
		},
		idOf: (rel) => {
			const id = ctx.usages.get(join(root, rel))?.[0]?.atomicStyleIds[0]
			if (id == null)
				throw new Error(`[${name}] no committed usage recorded for ${rel}`)
			return id
		},
		ownCss: async () => (await ctx.getCssCodegenContent()) ?? '',
		writeCss: () => ctx.writeCssCodegenFile(),
		consumedCss: () => readFile(ctx.cssCodegenFilepath, 'utf8'),
		buildScan: () => ctx.fullyCssCodegen(),
		tsContent: async () => (await ctx.getTsCodegenContent()) ?? '',
		writeTs: () => ctx.writeTsCodegenFile(),
	}
}

/** Collects `class id -> whitespace-normalized declaration text` from rendered CSS. */
function cssDeclarationsOf(css: string) {
	const rules = new Map<string, string>()
	for (const [, selector, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
		for (const [, id] of selector!.matchAll(/\.(pk-[A-Za-z]+)/g))
			rules.set(id!, `${rules.get(id!) ?? ''}${body!.replace(/\s+/g, '')}`)
	}
	return rules
}

type Expectation = readonly [classId: string, declaration: string]

function violationsIn(actorName: string, css: string, expected: readonly Expectation[]) {
	const rules = cssDeclarationsOf(css)
	const violations: string[] = []
	for (const [classId, declaration] of expected) {
		const body = rules.get(classId)
		if (body == null || !body.includes(declaration))
			violations.push(`${actorName}: .${classId} should mean "${declaration}" but consumed CSS provides "${body ?? '<no rule>'}"`)
	}
	return violations
}

async function consumedViolations(actor: Actor, expected: readonly Expectation[]) {
	return violationsIn(actor.name, await actor.consumedCss(), expected)
}

/** The issue-mandated interleaving: A red, B flex, A flex, B red. */
async function transformOppositeOrders(a: Actor, b: Actor) {
	await a.transformFile('src/m1-red.ts')
	await b.transformFile('src/m2-flex.ts')
	await a.transformFile('src/m2-flex.ts')
	await b.transformFile('src/m1-red.ts')
}

function serveExpectations(actor: Actor): Expectation[] {
	return [
		[actor.classIn('src/m1-red.ts'), 'color:red'],
		[actor.classIn('src/m2-flex.ts'), 'display:flex'],
	]
}

afterEach(async () => {
	while (createdDirs.length > 0)
		await rm(createdDirs.pop()!, { recursive: true, force: true })
})

describe('concurrent invocations sharing one project root (#110)', () => {
	describe('runtime CSS semantic ownership', () => {
		it('control: a lone invocation stays semantically consistent between transformed classes and consumed CSS', async () => {
			const root = await createSharedRoot()
			const solo = await createActor(root, 'solo')

			await solo.transformFile('src/m1-red.ts')
			await solo.transformFile('src/m2-flex.ts')
			await solo.writeCss()

			expect(await consumedViolations(solo, serveExpectations(solo)))
				.toEqual([])
		}, TEST_TIMEOUT)

		it('preconditions: opposite-order actors are truly independent and mint opposite class mappings', async () => {
			const root = await createSharedRoot()
			const a = await createActor(root, 'serve A')
			const b = await createActor(root, 'serve B')

			await transformOppositeOrders(a, b)

			// Independent invocations — shared state is only the project root.
			expect(a.ctx)
				.not.toBe(b.ctx)
			expect(a.ctx.engine)
				.not.toBe(b.ctx.engine)

			// Opposite mappings actually formed: the id A gave "color:red" is the
			// id B gave "display:flex", and vice versa.
			expect(a.classIn('src/m1-red.ts'))
				.toBe(b.classIn('src/m2-flex.ts'))
			expect(a.classIn('src/m2-flex.ts'))
				.toBe(b.classIn('src/m1-red.ts'))
			expect(a.classIn('src/m1-red.ts'))
				.not.toBe(a.classIn('src/m2-flex.ts'))

			// Oracle self-check: judged against its OWN emitted CSS, each actor is
			// consistent. Cross-contamination failures below are therefore real
			// semantic findings, not oracle or fixture artifacts.
			expect(violationsIn(a.name, await a.ownCss(), serveExpectations(a)))
				.toEqual([])
			expect(violationsIn(b.name, await b.ownCss(), serveExpectations(b)))
				.toEqual([])
		}, TEST_TIMEOUT)

		it('preconditions: differently scoped full scans are independent and mint opposite class mappings', async () => {
			const root = await createSharedRoot()
			const buildA = await createActor(root, 'build A', {
				scan: { include: ['src/m*.ts'], exclude: [] },
			})
			const buildB = await createActor(root, 'build B', {
				scan: { include: ['src/n*.ts'], exclude: [] },
			})

			await buildA.buildScan()
			await buildB.buildScan()

			expect(buildA.ctx.engine)
				.not.toBe(buildB.ctx.engine)

			// The sorted scan scopes really mint opposite mappings: A sees red
			// first (`m1` < `m2`), B sees flex first (`n1` < `n2`).
			expect(buildA.idOf('src/m1-red.ts'))
				.toBe(buildB.idOf('src/n1-flex.ts'))
			expect(buildA.idOf('src/m2-flex.ts'))
				.toBe(buildB.idOf('src/n2-red.ts'))
			expect(buildA.idOf('src/m1-red.ts'))
				.not.toBe(buildA.idOf('src/m2-flex.ts'))

			// Oracle self-check against each build actor's OWN generated CSS, so
			// the build-mode expected failures below can only be red because of
			// cross-actor contamination, not full-scan or fixture breakage.
			expect(violationsIn(buildA.name, await buildA.ownCss(), [
				[buildA.idOf('src/m1-red.ts'), 'color:red'],
				[buildA.idOf('src/m2-flex.ts'), 'display:flex'],
			]))
				.toEqual([])
			expect(violationsIn(buildB.name, await buildB.ownCss(), [
				[buildB.idOf('src/n1-flex.ts'), 'display:flex'],
				[buildB.idOf('src/n2-red.ts'), 'color:red'],
			]))
				.toEqual([])
		}, TEST_TIMEOUT)

		// Current behavior: both invocations resolve one shared physical CSS
		// artifact, so the last writer silently redefines the other actor's
		// class meanings. #111 owns the fix; this documents the defect.
		it.fails('serve + serve: overlapping artifact writes keep every actor semantically consistent', async () => {
			const root = await createSharedRoot()
			const a = await createActor(root, 'serve A')
			const b = await createActor(root, 'serve B')
			await transformOppositeOrders(a, b)

			// Both writers reach their write attempt, then are released in a
			// chosen order: A completes first, B completes last.
			const gateA = createGate('serve A css write')
			const gateB = createGate('serve B css write')
			const writeA = writeWhenReleased(gateA, a.writeCss)
			await gateA.reached
			const writeB = writeWhenReleased(gateB, b.writeCss)
			await gateB.reached

			gateA.release()
			await writeA
			gateB.release()
			await writeB

			expect([
				...await consumedViolations(a, serveExpectations(a)),
				...await consumedViolations(b, serveExpectations(b)),
			])
				.toEqual([])
		}, TEST_TIMEOUT)

		it.fails('serve + build: a full-scan build sharing the root keeps the live serve invocation semantically consistent', async () => {
			const root = await createSharedRoot()
			// `scan` only drives the full-scan path; the serve actor feeds styles
			// through explicit `transformFile` calls, so it keeps the defaults.
			const serve = await createActor(root, 'serve')
			const build = await createActor(root, 'build', {
				scan: { include: ['src/n*.ts'], exclude: [] },
			})

			// serve mints red-first; the build's sorted scan scope mints flex-first.
			await serve.transformFile('src/m1-red.ts')
			await serve.transformFile('src/m2-flex.ts')
			await serve.writeCss()
			await build.buildScan()

			const buildExpectations: Expectation[] = [
				[build.idOf('src/n1-flex.ts'), 'display:flex'],
				[build.idOf('src/n2-red.ts'), 'color:red'],
			]
			expect([
				...await consumedViolations(serve, serveExpectations(serve)),
				...await consumedViolations(build, buildExpectations),
			])
				.toEqual([])
		}, TEST_TIMEOUT)

		it.fails('build + build: differently scoped builds sharing the root keep both invocations semantically consistent', async () => {
			const root = await createSharedRoot()
			const buildA = await createActor(root, 'build A', {
				scan: { include: ['src/m*.ts'], exclude: [] },
			})
			const buildB = await createActor(root, 'build B', {
				scan: { include: ['src/n*.ts'], exclude: [] },
			})

			await buildA.buildScan()
			await buildB.buildScan()

			const expectationsA: Expectation[] = [
				[buildA.idOf('src/m1-red.ts'), 'color:red'],
				[buildA.idOf('src/m2-flex.ts'), 'display:flex'],
			]
			const expectationsB: Expectation[] = [
				[buildB.idOf('src/n1-flex.ts'), 'display:flex'],
				[buildB.idOf('src/n2-red.ts'), 'color:red'],
			]
			expect([
				...await consumedViolations(buildA, expectationsA),
				...await consumedViolations(buildB, expectationsB),
			])
				.toEqual([])
		}, TEST_TIMEOUT)
	})

	describe('typescript declaration writer contention', () => {
		// Orchestration contract only: writers can be held at their write
		// attempt and released in a chosen order, and the surviving file is
		// always ONE writer's complete declaration — never truncated or
		// interleaved output. Deliberately NOT asserted: which writer wins.
		// Pre-#113 sessions may legitimately hold different declaration state
		// and neither #110 nor #112 defines an owner/precedence between them;
		// #112 (after #113) owns the final write strategy and the
		// byte-identical-inputs oracle, where winner identity is irrelevant.
		// Note for #112: the checkpoints serialize the write operations, so
		// this proves completeness at the operation level — syscall-level
		// partial/interleaved writes need a lower-level fixture if required.
		it('overlapping declaration writers always leave one complete declaration, under either release order', async () => {
			for (const releaseOrder of ['A first', 'B first'] as const) {
				const root = await createSharedRoot()
				const a = await createActor(root, 'ts A')
				const b = await createActor(root, 'ts B')

				await a.transformFile('src/m1-red.ts')
				// Preview usage gives A a declaration surface B does not have, so
				// the two declarations differ and completeness is distinguishable:
				// any truncated or interleaved result matches neither writer.
				await a.transformFile('src/p-preview.ts')
				await b.transformFile('src/m2-flex.ts')

				const contentA = await a.tsContent()
				const contentB = await b.tsContent()
				expect(contentA)
					.not.toBe(contentB)

				const [first, second] = releaseOrder === 'A first' ? [a, b] : [b, a]
				const gateFirst = createGate(`${first.name} ts write`)
				const gateSecond = createGate(`${second.name} ts write`)

				const writeFirst = writeWhenReleased(gateFirst, first.writeTs)
				await gateFirst.reached
				const writeSecond = writeWhenReleased(gateSecond, second.writeTs)
				await gateSecond.reached

				gateFirst.release()
				await writeFirst
				gateSecond.release()
				await writeSecond

				const finalContent = await readFile(a.ctx.tsCodegenFilepath!, 'utf8')
				expect([contentA, contentB])
					.toContain(finalContent)
			}
		}, TEST_TIMEOUT)
	})
})
