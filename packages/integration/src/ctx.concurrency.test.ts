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
 * The cross-actor regressions were introduced under #110 as `it.fails`
 * documenting the shared-artifact corruption; #111's invocation-scoped
 * runtime CSS turned them into ordinary passing tests.
 */
import type { IntegrationContext, IntegrationContextOptions } from './types'
import { mkdir, mkdtemp, open, readdir, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'pathe'
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
	await writeFile(join(root, 'src/m1-red.ts'), 'export const cls = pika({ color: \'red\' })\n')
	await writeFile(join(root, 'src/m2-flex.ts'), 'export const cls = pika({ display: \'flex\' })\n')
	await writeFile(join(root, 'src/n1-flex.ts'), 'export const cls = pika({ display: \'flex\' })\n')
	await writeFile(join(root, 'src/n2-red.ts'), 'export const cls = pika({ color: \'red\' })\n')
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

		// Each invocation owns its runtime CSS artifact (#111), so a last
		// writer can no longer redefine another actor's class meanings.
		it('serve + serve: overlapping artifact writes keep every actor semantically consistent', async () => {
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

		it('serve + build: a full-scan build sharing the root keeps the live serve invocation semantically consistent', async () => {
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

		it('build + build: differently scoped builds sharing the root keep both invocations semantically consistent', async () => {
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

	describe('typescript declaration writer contention (harness self-test)', () => {
		// #110 provides the deterministic orchestration and the ownership-
		// neutral completeness oracle: the surviving target must be ONE
		// writer's complete declaration — never truncated or interleaved —
		// and which writer wins is deliberately not asserted (pre-#113
		// sessions have no defined owner; #112's byte-identical-inputs model
		// makes the winner irrelevant).
		//
		// The scripted-schedule cases are harness self-tests: every filesystem
		// step is awaited by the test itself, so both the corrupted and the
		// complete outcome are forced by explicit checkpoints rather than by
		// OS/kernel scheduling. Since #112 the REAL declaration writer
		// (compare → unique temp → atomic rename) is additionally exercised
		// under genuine overlap below: atomic replacement makes the
		// completeness assertion interleaving-independent, so no marker or
		// repetition tricks are needed.
		async function typegenFixture() {
			const root = await createSharedRoot()
			const a = await createActor(root, 'ts A')
			// A different `fnName` is a genuine type-surface input, so the two
			// declarations differ and completeness is distinguishable: any
			// truncated or interleaved result matches neither writer. (Post-#113
			// declarations are config-derived, so usage state cannot be used to
			// differentiate them — and both actors need no transforms at all.)
			const b = await createActor(root, 'ts B', { fnName: 'styled' })

			const contentA = await a.tsContent()
			const contentB = await b.tsContent()
			expect(contentA)
				.not.toBe(contentB)
			expect(contentA.length)
				.not.toBe(contentB.length)
			return { target: a.ctx.tsCodegenFilepath!, contentA, contentB }
		}

		it('detects a checkpoint-forced interleaved write schedule as an incomplete declaration', async () => {
			const { target, contentA, contentB } = await typegenFixture()

			// Split A's write beyond the common prefix of the two declarations
			// so the mixed result can never coincide with either writer.
			let firstDiff = 0
			while (firstDiff < Math.min(contentA.length, contentB.length) && contentA[firstDiff] === contentB[firstDiff])
				firstDiff++
			const splitAt = firstDiff + 1
			expect(splitAt)
				.toBeLessThan(contentA.length)

			// The classic lost-truncate interleave, step by step: A truncates,
			// B truncates, A writes its first slice, B writes everything, A
			// finishes writing at its own (now stale) offset.
			const aHandle = await open(target, 'w')
			const bHandle = await open(target, 'w')
			await aHandle.write(contentA.slice(0, splitAt), null, 'utf8')
			await bHandle.write(contentB, null, 'utf8')
			await bHandle.close()
			await aHandle.write(contentA.slice(splitAt), null, 'utf8')
			await aHandle.close()

			// The completeness oracle must flag this: the file matches neither
			// writer's complete declaration.
			const finalContent = await readFile(target, 'utf8')
			expect([contentA, contentB])
				.not.toContain(finalContent)
		}, TEST_TIMEOUT)

		it('leaves one complete declaration when staged writers are released whole, under either order', async () => {
			const { target, contentA, contentB } = await typegenFixture()

			const writeWhole = (content: string) => async () => {
				const handle = await open(target, 'w')
				await handle.write(content, null, 'utf8')
				await handle.close()
			}

			for (const [firstContent, secondContent] of [[contentA, contentB], [contentB, contentA]] as const) {
				const gateFirst = createGate('first ts write')
				const gateSecond = createGate('second ts write')

				const writeFirst = writeWhenReleased(gateFirst, writeWhole(firstContent))
				await gateFirst.reached
				const writeSecond = writeWhenReleased(gateSecond, writeWhole(secondContent))
				await gateSecond.reached

				gateFirst.release()
				await writeFirst
				gateSecond.release()
				await writeSecond

				const finalContent = await readFile(target, 'utf8')
				expect([contentA, contentB])
					.toContain(finalContent)
			}
		}, TEST_TIMEOUT)

		// #112: with the safe-replace writer, equal effective configurations
		// converge on byte-identical declarations (#113), so concurrently
		// released REAL writers must always leave that exact complete file —
		// under every interleaving, with no temp residue and no winner
		// semantics to define.
		it('concurrently released equal-configuration writers leave the byte-identical declaration (#112)', async () => {
			for (const stagingOrder of ['A first', 'B first'] as const) {
				const root = await createSharedRoot()
				const a = await createActor(root, 'ts A')
				const b = await createActor(root, 'ts B')

				const contentA = await a.tsContent()
				const contentB = await b.tsContent()
				expect(contentA)
					.toBe(contentB)

				const [first, second] = stagingOrder === 'A first' ? [a, b] : [b, a]
				const gateFirst = createGate(`${first.name} ts write`)
				const gateSecond = createGate(`${second.name} ts write`)

				const writeFirst = writeWhenReleased(gateFirst, first.writeTs)
				await gateFirst.reached
				const writeSecond = writeWhenReleased(gateSecond, second.writeTs)
				await gateSecond.reached

				// Both real write operations in flight concurrently.
				gateFirst.release()
				gateSecond.release()
				await Promise.all([writeFirst, writeSecond])

				const target = a.ctx.tsCodegenFilepath!
				expect(await readFile(target, 'utf8'))
					.toBe(contentA)
				expect((await readdir(dirname(target))).filter(name => name.endsWith('.tmp')))
					.toEqual([])
			}
		}, TEST_TIMEOUT)
	})
})
