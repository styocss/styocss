import type { TypegenDocumentation } from './snapshot'

/** Host binding used only while rendering final TypeScript source. */
export interface TypegenJSDocRenderBindings {
	/**
	 * Resolves one path-free semantic preview image to a Markdown href after the
	 * host has successfully materialized it. Returning nullish omits that image.
	 */
	readonly resolvePreviewImageHref?: (assetId: string) => string | null | undefined
}

const LEFT_TO_RIGHT_MARK = '\u200E'
const RE_LEADING_INDENT = /^(\s*)/
const RE_USER_JSDOC_TAG = /^(\s*)@/

function sanitizeJSDocText(text: string, neutralizeTags: boolean): string[] {
	return text
		.replaceAll('*/', `*${LEFT_TO_RIGHT_MARK}/`)
		.split('\n')
		.map((line) => {
			const safeTagLine = neutralizeTags
				? line.replace(RE_USER_JSDOC_TAG, `$1${LEFT_TO_RIGHT_MARK}@`)
				: line
			return `${LEFT_TO_RIGHT_MARK}${safeTagLine.replace(RE_LEADING_INDENT, `$1${LEFT_TO_RIGHT_MARK}`)}`
		})
}

function markdownImage(alt: string, href: string): string {
	// Keep arbitrary host/user strings inside Markdown syntax from terminating the
	// surrounding generated JSDoc. Markdown escaping itself stays intentionally
	// minimal: the editor owns Markdown interpretation, while Core owns TS/JSDoc
	// lexical safety.
	return `![${alt}](${href})`
}

/**
 * Renders one lexical-safe JSDoc block from path-free semantic documentation.
 *
 * @remarks
 * The renderer preserves the historical `### PikaCSS Preview` fenced-CSS
 * convention and U+200E safety workaround. Arbitrary descriptions are prevented
 * from becoming semantic JSDoc `@tags`. Preview-image hrefs are supplied only at
 * final render time, so semantic snapshots never contain host paths or URIs.
 *
 * @param documentation - Path-free description, preview, and semantic tags to render.
 * @param bindings - Host callbacks used to resolve semantic preview asset IDs to hrefs.
 * @param indent - Prefix applied to every line of the generated JSDoc block.
 *
 * @internal
 */
export function renderTypegenJSDoc(
	documentation: TypegenDocumentation,
	bindings: TypegenJSDocRenderBindings = {},
	indent = '',
): string[] {
	const body: string[] = []

	if (documentation.description != null && documentation.description.length > 0)
		body.push(...sanitizeJSDocText(documentation.description, true))

	const imageLines = (documentation.previewImages ?? []).flatMap((image) => {
		const href = bindings.resolvePreviewImageHref?.(image.assetId)
		if (href == null)
			return []
		return sanitizeJSDocText(markdownImage(image.alt ?? 'PikaCSS Preview', href), true)
	})
	const hasPreview = (documentation.previewCss?.length ?? 0) > 0 || imageLines.length > 0
	if (hasPreview && body.length > 0)
		body.push('')
	if (hasPreview)
		body.push(`${LEFT_TO_RIGHT_MARK}### PikaCSS Preview`)
	// Image previews are primary when present; CSS remains immediately below for
	// implementation inspection, matching the frozen rich-preview contract.
	body.push(...imageLines)
	if ((documentation.previewCss?.length ?? 0) > 0) {
		body.push(`${LEFT_TO_RIGHT_MARK}\`\`\`css`)
		body.push(...sanitizeJSDocText(documentation.previewCss!, false))
		body.push(`${LEFT_TO_RIGHT_MARK}\`\`\``)
	}

	const tags = (documentation.tags ?? []).flatMap((tag) => {
		if (!/^[A-Z][\w-]*$/i.test(tag.name))
			throw new Error(`Invalid Typegen JSDoc tag name: ${tag.name}`)
		const text = tag.text == null || tag.text.length === 0
			? []
			: sanitizeJSDocText(tag.text, true)
		if (text.length === 0)
			return [`@${tag.name}`]
		return [`@${tag.name} ${text[0]}`, ...text.slice(1)]
	})
	if (tags.length > 0 && body.length > 0)
		body.push('')
	body.push(...tags)

	if (body.length === 0)
		return []

	return [
		`${indent}/**`,
		...body.map(line => `${indent} * ${line}`),
		`${indent} */`,
	]
}
