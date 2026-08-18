import process from 'node:process'
import { resolve } from 'pathe'
import { $ } from 'zx'

// Local release driver. Everything a release needs is already in `bumpp`:
// `--git-check` refuses a dirty tree, `-r` bumps every workspace manifest in
// lockstep, the version prompt doubles as the confirmation, and it commits,
// annotates the `v<version>` tag, then runs `git push` followed by
// `git push --tags` — branch first, tag second, which is the order
// `release.yml` needs (it refuses a tag that is not an ancestor of
// `origin/main`).
//
// The one thing bumpp does not check is *where* it is releasing from. Bumping
// on a feature branch or on a stale `main` still pushes a tag, and the mistake
// only surfaces in `release.yml` — by which point the tag is on origin and the
// version number is spent. That guard is this file's entire reason to exist.

const rootDir = resolve(import.meta.dirname, '..')

$.cwd = rootDir
$.verbose = false

async function git(...args: string[]) {
	return (await $`git ${args}`).stdout.trim()
}

async function assertReleasableMain() {
	const branch = await git('rev-parse', '--abbrev-ref', 'HEAD')
	if (branch !== 'main')
		throw new Error(`Releases start from \`main\`, but the current branch is \`${branch}\`.`)

	await git('fetch', 'origin', 'main')

	if ((await git('rev-parse', 'HEAD')) !== (await git('rev-parse', 'origin/main')))
		throw new Error('Local `main` differs from `origin/main`. Pull or push before releasing.')
}

// `bumpp --git-check patch` silently loses the release: bumpp's argument parser
// reads `patch` as the *value* of `--git-check`, leaving the release
// unspecified, so it falls back to the interactive picker. Passing the release
// as `--release <value>` keeps it out of that position entirely.
function bumppArgs() {
	const [first, ...rest] = process.argv.slice(2)

	return first != null && !first.startsWith('-')
		? ['--release', first, ...rest]
		: process.argv.slice(2)
}

try {
	await assertReleasableMain()
}
catch (error) {
	console.error(error instanceof Error ? error.message : String(error))
	process.exit(1)
}

// `pnpm release`, `pnpm release minor`, `pnpm release 1.0.0-rc.1 --preid rc`.
// `nothrow`: bumpp already prints its own failures (the dirty-tree message
// among them), so rethrowing would only add a zx stack trace on top.
const { exitCode } = await $({ stdio: 'inherit', nothrow: true })`pnpm exec bumpp -r --git-check ${bumppArgs()}`

if (exitCode !== 0)
	process.exit(exitCode ?? 1)
