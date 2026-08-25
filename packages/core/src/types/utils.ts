/**
 * Represents `null` or `undefined`, used throughout the engine to express optional absence.
 *
 * @remarks Prefer this alias over inlining `null | undefined` for consistency across the codebase.
 *
 * @example
 * ```ts
 * function process(value: string | Nullish) {
 *   if (value == null) return // handles both null and undefined
 * }
 * ```
 */
export type Nullish = null | undefined

/**
 * Branded string type that preserves literal union autocompletion while still accepting arbitrary strings.
 *
 * @remarks TypeScript narrows `string` to only known literals when a union is used. Intersecting with `{}` keeps the union suggestions in IDE autocomplete without rejecting unknown strings at the type level.
 *
 * @example
 * ```ts
 * type Color = 'red' | 'blue' | UnionString
 * const c: Color = 'red'    // autocomplete suggests 'red' | 'blue'
 * const d: Color = 'green'  // still valid
 * ```
 */
export type UnionString = string & {}

/**
 * A value that can be either a single item or an array of items.
 *
 * @typeParam T - The element type.
 *
 * @remarks Used pervasively in configuration surfaces so consumers can pass a single value or an array without explicit wrapping.
 *
 * @example
 * ```ts
 * function normalize<T>(input: Arrayable<T>): T[] {
 *   return [input].flat() as T[]
 * }
 * normalize('a')     // ['a']
 * normalize(['a','b']) // ['a','b']
 * ```
 */
export type Arrayable<T> = T | T[]

/**
 * A value that may be synchronous or wrapped in a `Promise`.
 *
 * @typeParam T - The resolved value type.
 *
 * @remarks Hook callbacks and plugin functions use this so authors can return either synchronously or asynchronously without the engine caring which.
 *
 * @example
 * ```ts
 * async function run(fn: () => Awaitable<string>) {
 *   const result = await fn() // works whether fn is sync or async
 * }
 * ```
 */
export type Awaitable<T> = T | Promise<T>

/**
 * Converts a union type into an intersection of all its members.
 *
 * @typeParam U - The union type to intersect.
 *
 * @remarks Leverages contra-variant inference on function parameter positions. Useful internally for merging augmented module declarations into a single combined type.
 *
 * @example
 * ```ts
 * type U = { a: 1 } | { b: 2 }
 * type I = UnionToIntersection<U> // { a: 1 } & { b: 2 }
 * ```
 */
export type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends ((k: infer I) => void) ? I : never

/**
 * Type-level strict equality check that resolves to `true` when `X` and `Y` are identical types.
 *
 * @typeParam X - First type to compare.
 * @typeParam Y - Second type to compare.
 *
 * @remarks Uses the double-conditional-inference trick to detect structural and modifier differences that `extends` alone would miss (e.g. `readonly` vs mutable).
 *
 * @example
 * ```ts
 * type A = IsEqual<string, string>  // true
 * type B = IsEqual<string, number>  // false
 * ```
 */
export type IsEqual<X, Y> = (<T>() => T extends X ? 1 : 2) extends (<T>() => T extends Y ? 1 : 2) ? true : false

/**
 * Evaluates to `true` when `T` is the `never` type, `false` otherwise.
 *
 * @typeParam T - The type to test.
 *
 * @remarks Wrapping `T` in a tuple prevents distributive conditional behavior that would otherwise collapse `never` before the check runs.
 *
 * @example
 * ```ts
 * type A = IsNever<never>  // true
 * type B = IsNever<string> // false
 * ```
 */
export type IsNever<T> = [T] extends [never] ? true : false

/**
 * Flattens an intersection type into a single object type for improved readability in IDE tooltips.
 *
 * @typeParam T - The intersection or object type to simplify.
 *
 * @remarks Mapped types re-enumerate all keys so the resulting hover preview shows a flat `{ ... }` shape instead of `A & B & C`.
 *
 * @example
 * ```ts
 * type Merged = Simplify<{ a: 1 } & { b: 2 }> // { a: 1; b: 2 }
 * ```
 */
export type Simplify<T> = { [K in keyof T]: T[K] } & {}

/**
 * Converts a camelCase or PascalCase string literal type to kebab-case at the type level.
 *
 * @typeParam T - The string literal type to convert. CSS custom properties (`--*`) are returned as-is.
 *
 * @remarks Used to map JavaScript-style property names to their CSS kebab-case equivalents during style extraction and rendering.
 *
 * @example
 * ```ts
 * type A = ToKebab<'backgroundColor'> // 'background-color'
 * type B = ToKebab<'--my-var'>        // '--my-var'
 * ```
 */
export type ToKebab<T extends string> = T extends `--${string}`
	? T
	: T extends `${infer A}${infer U}${infer Rest}`
		? U extends Uppercase<U>
			? U extends Lowercase<U>
				? `${Lowercase<A>}${ToKebab<`${U}${Rest}`>}`
				: `${Lowercase<A>}-${ToKebab<`${Lowercase<U>}${Rest}`>}`
			: `${Lowercase<A>}${ToKebab<`${U}${Rest}`>}`
		: Lowercase<T>

/**
 * Converts a kebab-case string literal type to camelCase at the type level.
 *
 * @typeParam T - The string literal type to convert. CSS custom properties (`--*`) are returned as-is.
 *
 * @remarks The inverse of `ToKebab`. Used to reconcile CSS-native property names back to their JavaScript equivalents during autocomplete resolution.
 *
 * @example
 * ```ts
 * type A = FromKebab<'background-color'> // 'backgroundColor'
 * type B = FromKebab<'--my-var'>         // '--my-var'
 * ```
 */
export type FromKebab<T extends string> = T extends `--${string}`
	? T
	: T extends `${infer Head}-${infer Tail}`
		? `${Head}${FromKebab<Capitalize<Tail>>}`
		: T

/**
 * Safely extracts the value type at key `K` from object type `Obj`, returning `never` when `Obj` is `never` or `K` is not a key of `Obj`.
 *
 * @typeParam Obj - The source object type.
 * @typeParam K - The key to look up.
 *
 * @remarks Wrapping `Obj` in a tuple prevents distributive collapse when `Obj` is `never`.
 *
 * @example
 * ```ts
 * type V = GetValue<{ a: number }, 'a'> // number
 * type N = GetValue<{ a: number }, 'b'> // never
 * ```
 */
export type GetValue<
	Obj,
	K extends string,
> = [Obj] extends [never]
	? never
	: K extends keyof Obj
		? Obj[K]
		: never

/**
 * Distributively reads one key from every member of an object union.
 *
 * @remarks Unlike {@link GetValue}, this helper intentionally distributes over
 * `Obj` so independent Typegen contributors add their values for the same key.
 */
export type DistributiveGetValue<Obj, K extends PropertyKey> = Obj extends unknown
	? K extends keyof Obj
		? Obj[K]
		: never
	: never

/**
 * Conditionally resolves `T[Key]` when the key exists and its value extends `I`; otherwise falls back to `Fallback`.
 *
 * @typeParam T - The source type to look up.
 * @typeParam Key - The key to look up in `T`.
 * @typeParam I - The constraint that `T[Key]` must satisfy.
 * @typeParam Fallback - The default type returned when `Key` is missing or `T[Key]` does not extend `I`.
 *
 * @remarks Used extensively to resolve augmented types from `PikaAugment`, falling back to internal defaults when no augmentation is provided.
 *
 * @example
 * ```ts
 * type R = ResolveFrom<{ Foo: string }, 'Foo', string, 'default'> // string
 * type D = ResolveFrom<{}, 'Foo', string, 'default'>              // 'default'
 * ```
 */
export type ResolveFrom<T, Key extends string, I, Fallback extends I> = Key extends keyof T
	? T[Key] extends I
		? T[Key]
		: Fallback
	: Fallback
