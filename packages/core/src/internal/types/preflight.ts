import type { Engine } from '../engine'

// #region Preflight
export type PreflightFn = (engine: Engine, isFormatted: boolean) => string

/**
 * PreflightConfig can be a string or a function that returns a string.
 *
 * 1. A string is a static preflight style.
 * 2. A function is a dynamic preflight style that can use the engine instance to generate styles.
 */
export type Preflight = string | PreflightFn
// #endregion Preflight
