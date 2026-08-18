# AGENTS.md — PikaCSS

PikaCSS is an instant on-demand atomic CSS-in-JS engine. This file is the canonical always-on instruction source for agents working in the repository.

Keep repository-wide rules here.

## Control Plane

Use this file as the repository-level control plane for agent customization.

- Keep always-on repository rules, routing guidance, and cross-skill boundaries here.
- Keep workflow-specific detail inside the relevant skill.
- Keep review-only criteria inside dedicated review agents.
- Treat prompt-adjacent runtime packages as reusable primitives, not as the identity of a skill.

### Skill And Agent Locations (intentional split — do not "unify")

- `.claude/skills/` holds the **real files** for the internal maintenance skills (`maintain-docs`, `maintain-i18n`, `maintain-jsdocs`). `scripts/maintain-docs/*` and `scripts/maintain-i18n/*` resolve this path directly.
- `.agents/skills/*` are **symlinks** to those directories, kept so agents that look for `.agents/` still resolve. Never edit through the symlink path in a way that assumes a separate copy exists.
- `skills/` (repo root) is the **published, consumer-facing** skill set, installed by end users via `npx skills add pikacss/pikacss --skill pikacss-use` (see `docs/integrations/agent-skills.md`). Its path is part of the public contract, so it stays canonical there and is surfaced to Claude Code as `.claude/skills/pikacss-use` (symlink).
- Two public install paths resolve to that same directory, so its path and name are both contract: `npx skills add`, and `.claude-plugin/marketplace.json`, whose plugin `source` is `./skills/pikacss-use` and whose plugin `name` supplies the `/pikacss:` command prefix. Moving or renaming `skills/pikacss-use` breaks installs that this repository cannot see.
- `.claude/agents/` holds the review subagents. All three are read-only reviewers: `maintain-docs-review`, `maintain-tests-review`, `engine-review`. Only `maintain-docs-review` has a paired skill; the other two are invoked directly by the main agent after the work stabilizes. There are no implementation subagents — the main agent implements, and delegates independent subtasks to generic subagents when volume warrants it.
- **Nothing is enforced server-side.** Branch protection on `main` was removed on 2026-08-18 and the script that used to apply it is gone: the owner pushes directly, force pushes and deletions are not blocked, and CI runs *after* the push, so a red run on `main` is the only signal that something landed broken. Repository settings (`allow_auto_merge`, `delete_branch_on_merge`, deployment environments) are now managed by hand in GitHub's UI, not from this repository. There is no `CODEOWNERS` and none should be added: a sole maintainer cannot approve their own pull request, so a review requirement would deadlock every one.
- **`.claude/settings.json` is a checkpoint, not a boundary.** It prompts, and its patterns match command strings, so a different spelling can slip past. Only two things are hard-denied — publishing to npm, and writing generated outputs (`pika.gen.*`, `dist/`, `coverage/`). Everything else at most asks; the paths worth pausing on are the ones in its `ask` list.
- **Releasing is three steps, and only the first is automated.** `bump.yml` (`workflow_dispatch`, choose the bump type) bumps every `package.json` onto a `release/v*` branch and stops. The owner opens that pull request and merges it. The owner then tags the merged commit on `main` and pushes the tag, which triggers `release.yml`: build, `publint`/`attw`, npm trusted publishing, `changelogithub`, docs redeploy. Full walkthrough, the pre-publish gate, and the release-candidate flow are in `RELEASING.md` — that file owns the procedure, this one owns only the invariants below.
- **Do not rename `release.yml`.** npm trusted publishing authorizes a specific repository *and workflow filename*; publishing from any other file fails the OIDC exchange with no local signal. It is not scoped to a deployment environment, so the publish job declares none — merging the version pull request is the human gate.
- **One GitHub rule shapes the whole release flow: nothing done with `GITHUB_TOKEN` starts another workflow run.** That is why the pull request is opened by hand (a bot-pushed branch gets no CI at all, so the version commit would be merged with nothing having checked it), why the tag is pushed by hand (a bot-pushed tag would not trigger `release.yml`), and why `deploy-docs` is chained with `needs:` instead of reacting to the tag. Any attempt to automate those steps has to solve this first — `workflow_dispatch` and `repository_dispatch` are the only exceptions to the rule.
- **Merging and pushing are the owner's decision, but an agent may execute them.** `git push`, `gh pr merge`, `gh workflow run`, and every state-changing `gh api` call ask for approval each time. Do them when the owner asks, never as an inferred next step: open the pull request, report what needs deciding, and wait.

## Repo Facts

| | |
|---|---|
| Language | TypeScript (strict, ES modules) |
| Package manager | pnpm 10.x |
| Build | tsdown (ESM + CJS + DTS) |
| Test | Vitest v4+ with `@vitest/coverage-v8` |
| Lint | ESLint via `@deviltea/eslint-config` |
| Docs | VitePress (`docs/`) |

## Setup And Commands

Requires Node.js >= 22 and pnpm 10.x.

```bash
pnpm install
pnpm test
pnpm typecheck
pnpm lint
pnpm --filter @pikacss/<package> test
pnpm --filter @pikacss/<package> typecheck
pnpm --filter @pikacss/<package> build
pnpm --filter @pikacss/docs typecheck
pnpm docs:dev
pnpm playground:dev
pnpm playground:build
pnpm newpkg
pnpm newplugin
pnpm maintain-docs:analyze
pnpm maintain-docs:gen-api
pnpm maintain-jsdocs:scaffold --packages <name>...
pnpm maintain-jsdocs:lint [--packages <name>...]
pnpm maintain-i18n:status
pnpm maintain-i18n:lint
```

Use package-scoped commands during iterative development. Root-level `vitest --project` filtering is not the canonical package validation path in this repo.

## Type Bench

`scripts/type-bench/` is a quantitative benchmarking tool that measures PikaCSS's TypeScript type system performance under different usage scales. It dynamically generates fixture projects using the real `createCtx()` codegen pipeline.

### Quick Reference

```bash
# Run all dimensions (default 5 runs, takes a while)
pnpm type-bench

# Single dimension, 1 run (fast check)
pnpm type-bench -d callCount -r 1

# With trace hotspot analysis
pnpm type-bench -d callCount -r 1 --trace

# With tsserver IDE latency measurement (completionInfo, quickInfo, diagnostics)
pnpm type-bench -d callCount -r 1 --tsserver

# Save a baseline before refactoring
pnpm type-bench -r 3 --save-baseline before-refactor

# Compare against a saved baseline (shows ±% per metric with regression markers)
pnpm type-bench -r 3 --compare before-refactor

# Cross-version comparison (downloads via npx)
pnpm type-bench -d callCount -r 1 --ts-versions 5.7,5.8,5.9

# Export JSON report
pnpm type-bench -d callCount -r 3 -o ./bench-result.json
```

### Dimensions

| Dimension | Description | Scale |
|---|---|---|
| `callCount` | Number of `pika()` calls | 10 → 1000 |
| `pluginCount` | Registered plugins | 0 → 5 |
| `autocompleteSize` | Autocomplete union size | 10 → 200 |
| `nestingDepth` | StyleDefinition nesting depth | 1 → 4 |
| `fileSpread` | Call distribution across files | single / 10files / 50files |

### Measurement Runners

| Runner | Flag | Metrics |
|---|---|---|
| tsc diagnostics | *(always on)* | Types, Instantiations, Memory, Check Time |
| Trace analysis | `--trace` | Top-N hotspot type instantiations |
| tsserver latency | `--tsserver` | completionInfo / quickInfo / semanticDiagnosticsSync p50/p95 |

### When to Use

- **Before/after type-level refactors** — save a baseline, refactor, compare.
- **Evaluating plugin impact** — use `-d pluginCount` to measure type cost per plugin.
- **Diagnosing IDE slowness** — use `--tsserver` to pinpoint which operations are slow.
- **TS version upgrades** — use `--ts-versions` to compare type performance across versions.

### File Structure

- `scripts/type-bench/index.ts` — CLI entry point
- `scripts/type-bench/config.ts` — dimension definitions and scenario generation
- `scripts/type-bench/fixture-gen.ts` — dynamic fixture project generator (uses real `createCtx()` pipeline)
- `scripts/type-bench/baseline.ts` — baseline save/load/compare with regression detection
- `scripts/type-bench/runners/tsc.ts` — `tsc --noEmit --diagnostics` runner
- `scripts/type-bench/runners/trace.ts` — `tsc --generateTrace` analysis
- `scripts/type-bench/runners/tsserver.ts` — programmatic tsserver session for IDE latency
- `scripts/type-bench/reporters/cli-table.ts` — terminal table + baseline diff output
- `scripts/type-bench/reporters/json.ts` — JSON file output
- `scripts/type-bench/baselines/` — saved baseline snapshots (git tracked)

## Package Graph

```plaintext
core  (no internal deps)
  └── integration
        └── unplugin
              └── nuxt

plugin-*  →  depend on core
(plugin-reset, plugin-icons, plugin-fonts, plugin-typography, plugin-design-tokens)
```

Each package uses `src/index.ts` as the entry point, keeps tests co-located with source files, and carries local `tsconfig`, `tsdown`, and `vitest` config files.

Non-package workspaces: `docs/` (VitePress site), `demo/` (static Vue showcase), `playground/` (in-browser WebContainer playground; see `playground/README.md`).

## Workspace Apps

- `playground/` boots real Vite projects inside a WebContainer. Its `src/templates/<name>/` directories (solid-ts is the default) are **data served into the container**, not app code: excluded from the app tsconfig, from repo ESLint, and from the playground's own PikaCSS scan. Template `package.json` files reference **published** `@pikacss/*` versions — `workspace:` cannot resolve inside the container. The playground `vite.config.ts` rewrites them to the latest npm release at build time (`vfsPlugin` `dependencyVersions`); the pins in the repo are only offline fallbacks.
- `demo/` and `playground/` use a hyphenated `type-check` script on purpose: it needs generated files (`pika.gen.ts`, `vfs.d.ts`) from a prior dev/build run, so it is excluded from the repo-wide `pnpm typecheck`. Run `build` first, then `type-check`.
- The playground deploys to `https://pikacss.github.io/playground/` via `deploy-docs.yml` (copied into the docs dist). GitHub Pages cannot send COOP/COEP headers, so `playground/public/coi-serviceworker.min.js` provides cross-origin isolation — keep the script tag first in `playground/index.html`.
- The ~90s in-browser `npm install` is skipped by mounting a **dependency snapshot** (`useSnapshotCache.ts`): the gzip of `export('.', { format: 'binary' })` — WebContainer's *own* filesystem — which is `mount()`ed then `chmod -R +x node_modules` (mount drops the exec bit). Two layers (`App.vue`), both falling back to install: a **static baseline** `snapshots/<template>.bin` generated in CI (fast first visit for everyone) and a per-visitor **IndexedDB** cache keyed by `<template>@<package.json hash>`. This works **only** with WebContainer's own export: do **not** build the snapshot from a host `npm install` — WebContainer disables native `.node` addon loading and resolves WASM builds of native-dependent packages (rollup, esbuild) only via an *in-container* install through StackBlitz's proxy registry, so a host `node_modules` fails at startup (`ERR_DLOPEN_DISABLED` for rollup, esbuild "service was stopped").
- Static baseline snapshots are generated by `scripts/gen-snapshots.mjs`: WebContainer's `spawn` only works inside the full app (not a stripped page), so it drives the built playground in headless Chromium (Playwright) via `/<template>/?__generate`, which runs a fresh install and exposes the gzip export on `window.__pikaSnapshot`. The deploy workflow runs it after `pnpm playground:build` (non-fatal). `.bin` files are build artifacts, not committed.
- The template comes from the path (`/playground/<template>/`); GitHub Pages has **no SPA fallback**, so `vite-plugin-template-pages` emits a real per-template `index.html` at build and redirects the bare base to `solid-ts/`. Do not assume Vite dev/preview behaviour matches the deployed static host — they fall back to `index.html`, GitHub Pages does not.
- `PreviewPanel.vue` reloads the preview iframe once, triggered by the first `hmr update … pika.css` terminal line (with a timed fallback): the dev server becomes ready before PikaCSS has written the runtime `pika.css`, so the first paint is unstyled and Vite's CSS HMR does not retroactively style it. A fixed delay is unreliable because the cache path reaches the dev server much faster than a cold install.
- Marketing/example copy may show a literal `pika()` call directly. The AST compiler pipeline (`c0a1c19`, replacing the old `stripLiteral` + `\bpika\(` regex scanner) only rewrites real `pika(...)` **call expressions**; `pika()` appearing in JSX text, Vue template text, or a mustache string literal is not a call node and is left untouched. The historical escaping workarounds (`{'pika()'}` in JSX, `pika&#40;&#41;` HTML entities in Vue templates) are no longer required, though they remain harmless.

## Engine Invariants

Correctness rules encoded by regression tests — do not "simplify" them away:

- Core plugin order in `createEngine` keeps `important()` **after** `shortcuts()`, so `!important` applies to shortcut-expanded declarations and never to the `__shortcut` reference.
- Transformed `pika()` output uses **single-quoted** string literals (`ctx.ts` `quoteSingle`), because the call may sit inside a double-quoted Vue template attribute.
- The atomic style ID placeholder `%` is not treated as a placeholder when directly preceded by a digit (`@supports (width: 50%)`), and selector normalization never rewrites quoted content.
- `AbstractResolver` rule mutations (add/remove) clear the whole resolution cache; recursively expanded results may depend on any rule.
- During one `renderPreflights` pass each preflight function runs exactly once (`engine.invokePreflight` memoization); the variables pruning preflight reuses those results.
- `engine.use()` is split into a provisional `prepareUse()` (async transforms/extraction/normalization plus the `transformStyleContents` seam — allocates no IDs, mutates no store, fires no committed notifications) and a short **synchronous** `commitUse()` (ID allocation, store registration, `atomicStyleAdded`). The integration commits a whole module as one transaction inside a revision/epoch-checked synchronous block, so a failed or stale module attempt consumes zero committed IDs/state; `commitUse` must never become async, and reuse-vs-fresh ID decisions must never be precomputed at prepare time. A superseded transform throws `PikaStaleTransformError` — never return `null` for it: a null transform result makes the bundler serve the original macro-bearing source, and Vite can still deliver a stale result to its original caller after invalidation. A throwing `atomicStyleAdded` observer is diagnosed but never rolls back the commit.
- `EnginePlugin` objects are reusable **definitions**, safe across sequential and concurrent engines (#116): engine-local mutable data lives in `createState()`/`context.state` (one context per plugin/engine pair, same object for every hook of that pair), never in the plugin factory closure. Long-lived callbacks a plugin registers (shortcut resolvers, preflights, engine service methods) must capture the per-engine context/state, not closure variables. Core built-ins are exempt only because `createEngine` instantiates them fresh per engine and never exports the factories.
- Plugins that load external files must register them via `engine.addConfigDependency(path)` so the unplugin reloads on change (used by `plugin-design-tokens`). Registration alone is not enough: the unplugin reloads only when the file's *content* changed, so a dependency whose bytes stay identical while its meaning shifts (env vars, the clock, an unregistered neighbour file) will not be picked up. Dependencies may also be registered mid-run (during `engine.use()`): each genuinely new path fires `configDependencyAdded`, which the integration forwards (`ctx.hooks.dependencyAdded`) so bundler adapters extend the ACTIVE watcher dynamically — never assume `addConfigDependency` at runtime is sufficient without that propagation (#122).
- **A branded-opaque config descriptor survives `createEngine`'s clone only while its prototype stays non-plain, and a user's `{...spread}` destroys that.** `cloneConfigValue` (`packages/core/src/config-clone.ts`) returns any value whose prototype is neither `Object.prototype` nor `null` by reference (line 61), which is what lets `Object.create(PROTO)` + `Symbol.for` brands — `defineWatchableIconCollection` is the current example — reach plugin hooks intact. Plain objects instead go through `Object.entries` (line 68), which copies **string keys only**, so the brand symbol is dropped. Object spread *does* copy symbol keys but produces an `Object.prototype` result, so `{ ...collection, source: x }` lands in the plain-object branch and the brand vanishes during the clone `createEngine` performs before any hook runs: no error, no diagnostic, the feature just stops. Any new opaque-descriptor API inherits this — its JSDoc must say "pass the return value through unmodified, never spread it."

## Maintenance Playbook

- Every confirmed bug fix lands together with a minimal co-located regression test that fails without the fix.
- Downstream packages test against built upstream `dist/` output: rebuild the upstream package (`pnpm --filter @pikacss/core build`) before validating consumers. **Confirm the rebuild by grepping `dist/` for a distinctive symbol the source diff introduced, never by comparing mtimes** — `dist/*.mjs` timestamps have been observed to predate the source commits they already contain (four separate occasions), so an mtime check produces false "stale dist" findings and, worse, false confidence when it happens to look right.
- A new package must carry `"exclude": []` in its `tsconfig.tests.json`. The parent `tsconfig.package.json` excludes `./src/**/*.test.ts`, and without the override that exclude silently cancels the child's include, so `pnpm typecheck` checks zero test files and reports success. `pnpm newpkg`/`pnpm newplugin` emit the correct shape; verify it survives any template edit with `tsc -p tsconfig.tests.json --listFiles --noEmit | grep '\.test\.ts'`.
- New plugin package checklist: `pnpm newplugin <name>` → implement (`defineEnginePlugin` + `declare module '@pikacss/core'` augmentation, factory named after the plugin) → register in `scripts/_skill-shared/index.ts` `PACKAGES` → docs page + template (`.claude/skills/maintain-docs/templates/pages/...`) + example triple in `docs/.examples/` → sidebar entry in `docs/.vitepress/sidebarAndNav.ts` → `pnpm maintain-docs:gen-api` until zero JSDoc gaps → package `README.md`.
- Coverage thresholds (95% branches/functions/lines/statements) are enforced per package by `packages/_shared/vitest.ts`; when a fix adds branches, add tests covering the new branches in the same change.
- A full-repository test sweep validates in dependency order: `core` and `eslint-config`, then `plugin-*` and `integration`, then `unplugin`, then `nuxt`. Validating a consumer before its upstream is a meaningless pass.
- Periodic drift checks, each independent: `pnpm maintain-docs:analyze` (docs coverage), `pnpm maintain-i18n:status` (translation freshness), `pnpm maintain-docs:gen-api` (API reference gaps), and `pnpm update:browsers` followed by `pnpm generate:core:css` (browser data — this one touches `pnpm-lock.yaml`, so it is always the owner's decision).

## Request Routing

- Repository orientation, contributor setup, scaffolding, package graph, and PR readiness: handle directly from this file. Do not rely on a separate `contribute` skill.
- Docs pages, READMEs, API reference drift, or docs examples: use the `maintain-docs` skill directly from the main agent, then hand completed work to `maintain-docs-review`.
- zh-TW docs translation, translation freshness, or Taiwan-terminology questions: use the `maintain-i18n` skill directly from the main agent. English docs changes that touch translated pages should finish by running `pnpm maintain-i18n:status` to surface new staleness.
- Exported-surface JSDoc maintenance: use the `maintain-jsdocs` skill directly from the main agent. It runs a streamlined scan-fill-apply-validate flow without intermediate templates or review rounds.
- Unit or integration test creation, refinement, coverage work, or downstream validation: implement directly from the main agent against the coverage and sweep-order rules in the Maintenance Playbook above, then hand completed work to `maintain-tests-review`. There is no test-maintenance skill; the reviewer holds the repository-specific criteria.
- Changes under `scripts/**`, including its co-located tests (`scripts/ci`, `scripts/css-data`): handle directly from the main agent. No reviewer owns this tree — it is build/CI tooling, not shipped surface.
- Changes under `packages/*/src/**`, and any pull request from an outside contributor: hand the finished work to `engine-review`. It owns the engine invariants, the regression-test requirement, and public-surface/breaking-change classification.
- Consumer installation, application configuration, troubleshooting, examples for using PikaCSS in a project, and authoring or modifying plugin implementation, hook usage, config augmentation, and plugin tests: use the `pikacss-use` domain skill directly from the main agent. It does not have a dedicated paired custom agent.
- Reviewing an open pull request: dispatch the reviewers its diff calls for — `engine-review` for `packages/*/src/**`, `maintain-tests-review` for test files and coverage config, `maintain-docs-review` for `docs/**` and any `README.md` — then post one verdict comment covering what no reviewer owns (CI status, scope creep, supply chain, public surface). Reviewing never fixes, pushes, or merges.

## Composition Rules

- Choose one primary skill or workflow for a request, and add others when the task genuinely spans their domains.
- Delegate independent subtasks to subagents and keep working while they run — one package per subagent for a sweep, one reviewer per touched area. Intervene when a subagent goes off track or lacks context.
- Use the single `pikacss-use` skill for both consuming and authoring plugins.
- Treat every maintenance skill as a main-agent execution skill. The only subagents are read-only reviewers.
- `maintain-docs` (English) and `maintain-i18n` (zh-TW) compose: docs edits flow English-first, then i18n sync.
- Use `pikacss-use` as skill-only domain guidance in the main conversation unless a dedicated agent is added later.
- After heavy workflow changes, hand off to the matching review agent instead of embedding review policy into implementation steps.
- Reviewers run in a fresh context and never edit files; apply their findings from the main conversation.

## Review And Agent Boundaries

- `maintain-docs` is executed directly by the main agent. `maintain-docs-review` reviews docs work after implementation stabilizes.
- Test work is implemented directly by the main agent; `maintain-tests-review` reviews it afterwards and owns the repository-specific test criteria. It has no paired skill.
- `engine-review` reviews `packages/*/src/**` changes and outside-contributor pull requests. It assumes the author has not read this file.
- `maintain-jsdocs`, `maintain-i18n`, and `pikacss-use` are main-agent execution skills with no paired reviewer.
- Every reviewer ends with an explicit **Owner decision** section. Breaking changes, new dependencies, coverage exceptions, and public-contract changes are the repository owner's call, never the agent's.

## Global Rules

- Prefer minimal, targeted changes over broad refactors.
- Use package-scoped validation during development. Do not default to workspace-wide commands unless the task requires repo-wide verification.
- If a task changes an upstream package, rebuild that upstream package before validating downstream consumers.
- Run the smallest credible validation for the changed area before handoff. Update tests and docs when behavior or public API changes.
- Maintain JSDoc on public exports when public API behavior or signatures change.
- Use `defineEnginePlugin`, `defineEngineConfig`, and related identity helpers when they provide the canonical project pattern.
- Keep all code, comments, default docs content, prompts, and templates in English.
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/): `type(scope): imperative summary`, where type is one of `feat|fix|docs|refactor|test|chore`. Mark breaking changes with `!` and a `BREAKING CHANGE:` footer — release notes are generated from commit history, so the message is the only place that record exists.
- **Never run `pnpm install` on a pull request whose diff touches `package.json`, `pnpm-lock.yaml`, or `pnpm-workspace.yaml`.** Installing executes dependency lifecycle scripts from a manifest you did not write, and this repository's supply-chain policy (`minimumReleaseAge`, `trustPolicy: no-downgrade`, security `overrides`) is exactly what such a change could quietly relax. Review those hunks statically and put them under Owner decision.
- Keep the conversation language aligned with the user's chosen language and locale.
- Ask follow-up questions instead of guessing when ambiguity affects architecture, scope, safety, or acceptance criteria.
- In `tests`, `docs`, and `src` directories, do not reference absolute file system paths.

## Final Validation

- During iterative work, validate only the touched package or docs workspace.
- Before suggesting a contribution is ready for handoff, run the smallest credible final gate for the affected area.
- Use repository-wide `pnpm lint`, `pnpm test`, and `pnpm typecheck` only when the task truly warrants a repo-wide confidence pass.

## Forbidden Actions

- Do not edit generated outputs in `dist/` or `coverage/`.
- Do not manually edit generated `pika.gen.*` files.
- Do not manually write or edit generated API reference pages (`docs/api/*.md` except `index.md`). Always use `gen-api-docs` to regenerate them from source.
- Do not bypass or replace the `createCtx` transform pipeline in `docs/.examples/_utils/pika-example.ts`. It simulates the real build pipeline; swapping it for `createEngine`/`engine.use()` bypasses the transform/extract flow and breaks all examples. Mechanical or type-driven maintenance that preserves that pipeline is allowed and is enforced by an invariant gate in `scripts/ci/gates.ts`, not a byte-freeze.
- Do not import from `@pikacss/core` in `.pikain.ts` files. Pikain files must use bare `pika()` calls exactly as real users write them.
- Do not run workspace-wide `pnpm build` during iterative development.
- Do not edit `docs/zh-tw/**` translation content without updating the `translation:` frontmatter via `maintain-i18n:status --mark-synced`; do not hand-edit the `translation:` block.
- Do not guess through unclear requirements when a short follow-up question would remove risk.
