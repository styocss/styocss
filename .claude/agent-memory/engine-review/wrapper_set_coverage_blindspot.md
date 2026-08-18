---
name: wrapper-set-coverage-blindspot
description: v8 coverage cannot detect a missing test for a new element added to an existing Set/wrapper-type list — check the test-file convention directly
metadata:
  type: feedback
---

When a change adds a new member to an existing `Set` of AST node-type strings (e.g. `wrapperNodeTypes`/`WRAPPER_NODE_TYPES` in `packages/eslint-config/src/utils/fn-names.ts` and `packages/eslint-config/src/static-evaluate.ts`), statement/branch coverage tools (v8) cannot flag the new member as untested: the `Set.has()` call and the `while` loop are already covered by tests exercising any other member. A green coverage report proves nothing about the new element specifically.

**Why:** During the #119 conformance-corpus review, `TSInstantiationExpression` was added to `wrapperNodeTypes` in `fn-names.ts`. Every other member of that Set (`TSNonNullExpression`, `TSAsExpression`, `TSSatisfiesExpression`, `TSTypeAssertion`, `ParenthesizedExpression`) has a dedicated synthetic-AST-node test in `packages/eslint-config/src/utils/fn-names.test.ts`. `TSInstantiationExpression` did not get one. The only corpus cases exercising it (`pika<string>(dyn)`) are tagged `dialect: 'ts'` and are explicitly excluded from the eslint-config package's own espree-based conformance run (espree cannot parse TS generic-call syntax), so the addition shipped with **zero** test coverage in the eslint-config package despite package coverage staying at 97%+ and 217/217 tests green.

**How to apply:** When a diff adds a new node-type string to a wrapper/wrapper-adjacent Set in this codebase, grep the sibling `*.test.ts` file for that exact string. If every other Set member has a matching synthetic-node test and the new one doesn't, flag it as an unpinned regression — do not accept "coverage % is high" or "existing suite is green" as evidence, and do not rely on a parser-unrepresentable exclusion (e.g. TS-only corpus dialect tags) to fill the gap when a plain synthetic AST-node unit test would have been trivial to add instead.
