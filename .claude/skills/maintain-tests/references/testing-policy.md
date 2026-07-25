# Testing Policy

Use this reference for coverage policy, test design, and example suites.

## Coverage policy

- 100% coverage per package is the default bar.
- Do not silently exclude files, branches, or code paths.
- Every uncovered branch is actionable unless the user approves an exception.
- Coverage exceptions must be justified and approved before proceeding.

## Test design rules

- Prefer the lightest credible test level first.
- `describe` and `it` labels explain behavior and intent, not implementation.
- Cover success paths, failure paths, invalid inputs, edge conditions, and regression-sensitive branches.
- Prefer behavior assertions over implementation snapshots.
- Use unit tests for isolated logic and branch-heavy helpers.
- Use integration tests for multi-module behavior, filesystem work, generated outputs, or cross-package contracts.

## Reference suites

- `packages/core/src/internal/atomic-style.test.ts` — tone, structure, case depth.
- `packages/core/src/internal/plugins/important.test.ts` — plugin lifecycle and overrides.
- `packages/core/src/internal/engine.test.ts` — engine setup and end-to-end resolution.
- `packages/integration/src/ctx.test.ts` — package-internal integration.
- `packages/unplugin/src/index.test.ts` — downstream contract coverage.
