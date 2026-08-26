/** Escape marker used by the reversible private-variable segment codec. */
const ESCAPE_PREFIX = '_u'
const ESCAPE_SUFFIX = '_'
const SAFE_CHAR_RE = /^[A-Z0-9-]$/i

/**
 * Encodes one logical icon identity segment into a CSS-ident-safe, reversible
 * form. Ordinary ASCII alphanumerics and isolated hyphens stay readable;
 * underscores, non-ASCII/special characters, and boundary-conflicting hyphens
 * are escaped as Unicode code points.
 * @internal
 */
export function encodePrivateAssetSegment(input: string): string {
	let output = ''
	for (const char of input) {
		const rawSafe = SAFE_CHAR_RE.test(char)
			&& char !== '_'
			&& !(char === '-' && output.endsWith('-'))
		if (rawSafe) {
			output += char
			continue
		}
		output += `${ESCAPE_PREFIX}${char.codePointAt(0)!.toString(16)}${ESCAPE_SUFFIX}`
	}
	return output
}

/** @internal */
export function decodePrivateAssetSegment(input: string): string {
	let output = ''
	for (let index = 0; index < input.length;) {
		if (input.startsWith(ESCAPE_PREFIX, index)) {
			const end = input.indexOf(ESCAPE_SUFFIX, index + ESCAPE_PREFIX.length)
			if (end < 0)
				throw new Error(`Invalid encoded icon private-asset segment: ${input}`)
			const hex = input.slice(index + ESCAPE_PREFIX.length, end)
			if (!/^[\da-f]+$/i.test(hex))
				throw new Error(`Invalid encoded icon private-asset segment: ${input}`)
			output += String.fromCodePoint(Number.parseInt(hex, 16))
			index = end + ESCAPE_SUFFIX.length
			continue
		}
		const char = input[index]!
		if (char === '_')
			throw new Error(`Invalid encoded icon private-asset segment: ${input}`)
		output += char
		index++
	}
	return output
}

/** @internal */
export function createPrivateAssetVariableName(
	collection: string,
	name: string,
	privateCssDiscriminator?: string,
): string {
	const entry = privateCssDiscriminator == null ? '' : `${encodePrivateAssetSegment(privateCssDiscriminator)}-`
	return `--pk-${entry}svg-icon-${encodePrivateAssetSegment(collection)}--${encodePrivateAssetSegment(name)}`
}
