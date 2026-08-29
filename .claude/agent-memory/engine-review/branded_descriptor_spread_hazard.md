---
name: branded-descriptor-spread-hazard
description: any "Object.create(non-plain-prototype) + Symbol.for brand" opt-in descriptor pattern silently loses its brand through core's cloneEngineConfig if a user spreads it
metadata:
  type: project
---

Core's `cloneConfigValue` (`packages/core/src/config-clone.ts`) preserves identity for any
value whose prototype isn't `Object.prototype`/`null` (early return before the plain-object
clone branch), but for plain objects it deep-clones via `Object.entries(value)` — which only
copies **string**-keyed own enumerable properties, silently dropping symbol-keyed ones.

`@pikacss/plugin-icons`'s `defineWatchableIconCollection` (`packages/plugin-icons/src/
watchable.ts`, #122) relies on exactly this: the descriptor is `Object.create(WATCHABLE_PROTOTYPE)`
with `WATCHABLE_PROTOTYPE = Object.create(Object.prototype)`, so it survives `createEngine()`'s
clone by reference. But if a user does `{ ...definedCollection, source: overriddenSource }` —
a plausible "just tweak one field" pattern — the spread copies the brand symbol too (object
spread *does* copy symbol keys) onto a plain (`Object.prototype`) result. That plain-prototype
copy then goes through cloneConfigValue's `Object.entries` branch, which drops the symbol brand
during the clone `createEngine()` always performs before any plugin hook runs. Net effect: the
spread descriptor silently downgrades to an ordinary opaque collection — no error, no
diagnostic, dependency watching for that collection just stops working. Confirmed by tracing
(not just reading the docstring): checked `Object.getPrototypeOf` after a spread, checked
`Object.entries` symbol-key semantics, and confirmed `cloneEngineConfig` runs inside
`createEngine()` before `configureRawConfig`/`configureEngine` ever see the value.

The `watchable.ts` JSDoc now explicitly warns callers to pass the branded descriptor through
unmodified and never object-spread it, and the public icons documentation should preserve the
same warning. Treat any future loss of that guidance as documentation drift. This remains an
accepted design tradeoff of the brand mechanism itself, not unique to icons — any future
plugin adopting the same "non-plain-prototype brand so #117's clone treats it as opaque"
pattern (e.g. a future `plugin-design-tokens` or `plugin-fonts` watchable/opaque descriptor)
inherits the identical sharp edge.

**How to apply:** When reviewing a new branded-opaque-descriptor design (recognizable by
`Object.create(SOME_PROTOTYPE)` + a `Symbol.for` brand check), always ask whether the descriptor
survives `{...spread}` — if not, flag it as a documentation gap (JSDoc should warn "never
spread this, pass the return value through unmodified") even though it's not a functional bug
in the base case. Don't treat this as blocking on its own; it's a moderate hygiene finding
unless the PR's own examples encourage spreading.
