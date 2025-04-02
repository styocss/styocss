import type { StyleDefinition, StyleItem } from '../src/internal/types'

/**
 * 常用捷徑定義
 */
export const commonShortcuts = [
	['btn', ['p-2', 'rounded']],
	['btn-primary', ['btn', 'bg-blue-500']],
	['card', ['p-4', 'shadow', 'rounded']],
	['flex-center', ['flex', 'justify-center', 'items-center']],
]

/**
 * 常用動態捷徑定義
 */
export const dynamicShortcuts = [
	[/^size-(.+)$/, (match: RegExpMatchArray) => [`w-${match[1]}`, `h-${match[1]}`], ['size-sm', 'size-md', 'size-lg']],
]

/**
 * 常用樣式對象
 */
export const commonStyleObjects = {
	button: { p: '2', rounded: true },
	card: { p: '4', shadow: true, rounded: true },
	primary: { bg: 'blue-500', color: 'white' },
	hover: { hover: 'scale-105' },
}

/**
 * 測試用樣式定義
 */
export const testStyleDefinitions: StyleDefinition[] = [
	{ color: 'blue' },
	{ p: '4' },
	{ __shortcut: 'btn-primary', color: 'white' },
	{ __shortcut: ['card', 'hover'], m: '2' },
]

/**
 * 測試用樣式項目
 */
export const testStyleItems: StyleItem[] = [
	'btn-primary',
	{ color: 'red' },
	'size-10',
	'unknown',
]
