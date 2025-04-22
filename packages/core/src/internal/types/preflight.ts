import type { Engine } from '../engine'

export type PreflightFn = (engine: Engine) => string

/**
 * PreflightConfig can be a string or a function that returns a string.
 *
 * 1. A string is a static preflight style.
 * 2. A function is a dynamic preflight style that can use the engine instance to generate styles.
 */
export type PreflightConfig = string | PreflightFn
