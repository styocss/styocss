import type { StyleDefinition } from '@pikacss/core'

/**
 * Default CSS custom property values for prose typography colors and accents.
 * @internal
 *
 * @remarks Each variable controls a specific color role within prose content
 * (body text, headings, links, code, borders, etc.). All default to
 * `currentColor` or `transparent`, allowing consumers to override them
 * through the plugin's `variables` option.
 *
 * @example
 * ```ts
 * typography({ variables: {
 *   ...typographyVariables,
 *   '--pk-prose-color-links': '#3b82f6',
 * } })
 * ```
 */
const typographyVariableDefaults = {
	'--pk-prose-color-body': 'currentColor',
	'--pk-prose-color-headings': 'currentColor',
	'--pk-prose-color-lead': 'currentColor',
	'--pk-prose-color-links': 'currentColor',
	'--pk-prose-color-bold': 'currentColor',
	'--pk-prose-color-counters': 'currentColor',
	'--pk-prose-color-bullets': 'currentColor',
	'--pk-prose-color-hr': 'currentColor',
	'--pk-prose-color-quotes': 'currentColor',
	'--pk-prose-color-quote-borders': 'currentColor',
	'--pk-prose-color-captions': 'currentColor',
	'--pk-prose-color-code': 'currentColor',
	'--pk-prose-color-pre-code': 'currentColor',
	'--pk-prose-color-pre-bg': 'transparent',
	'--pk-prose-color-th-borders': 'currentColor',
	'--pk-prose-color-td-borders': 'currentColor',
	'--pk-prose-color-kbd': 'currentColor',
	'--pk-prose-kbd-shadows': 'currentColor',
} as const

export const typographyVariables: { [K in keyof typeof typographyVariableDefaults]: string } = typographyVariableDefaults

// Base prose styles
/**
 * Base prose container styles that set color, max-width, font size, and line height.
 * @internal
 *
 * @remarks Also collapses margins on the first and last child elements to
 * prevent unwanted spacing at the edges of the prose container.
 *
 * @example
 * ```ts
 * typography() lowers `{ name: 'prose-base', value: proseBaseStyle }` into Core shortcut config.
 * ```
 */
export const proseBaseStyle: StyleDefinition = {
	'color': 'var(--pk-prose-color-body)',
	'maxWidth': '65ch',
	'fontSize': '1rem',
	'lineHeight': '1.75',
	'$ > :first-child': {
		marginTop: '0',
	},
	'$ > :last-child': {
		marginBottom: '0',
	},
}

// Paragraph styles
/**
 * Paragraph and lead-text styles for prose content.
 * @internal
 *
 * @remarks Applies vertical margins to `<p>` elements and additional size,
 * color, and spacing overrides for elements carrying the `lead` class.
 *
 * @example
 * ```ts
 * typography() lowers this module into the `prose-paragraphs` Core shortcut definition.
 * ```
 */
export const proseParagraphsStyle: StyleDefinition = {
	'$ p': {
		marginTop: '1.25em',
		marginBottom: '1.25em',
	},
	'$ [class~="lead"]': {
		color: 'var(--pk-prose-color-lead)',
		fontSize: '1.25em',
		lineHeight: '1.6',
		marginTop: '1.2em',
		marginBottom: '1.2em',
	},
}

// Link styles
/**
 * Anchor link styles for prose content.
 * @internal
 *
 * @remarks Sets link color, underline decoration, and medium font weight.
 * Nested `<strong>` and `<code>` inside links inherit the link color.
 *
 * @example
 * ```ts
 * typography() lowers this module into the `prose-links` Core shortcut definition.
 * ```
 */
export const proseLinksStyle: StyleDefinition = {
	'$ a': {
		color: 'var(--pk-prose-color-links)',
		textDecoration: 'underline',
		fontWeight: '500',
	},
	'$ a strong': {
		color: 'inherit',
	},
	'$ a code': {
		color: 'inherit',
	},
}

// Emphasis styles (strong, em)
/**
 * Strong and italic emphasis styles for prose content.
 * @internal
 *
 * @remarks Bold text receives a dedicated color variable and semi-bold weight.
 * When `<strong>` appears inside links, blockquotes, or table headers the
 * color inherits from the parent to avoid clashing with contextual colors.
 *
 * @example
 * ```ts
 * typography() lowers this module into the `prose-emphasis` Core shortcut definition.
 * ```
 */
export const proseEmphasisStyle: StyleDefinition = {
	'$ strong': {
		color: 'var(--pk-prose-color-bold)',
		fontWeight: '600',
	},
	'$ a strong': {
		color: 'inherit',
	},
	'$ blockquote strong': {
		color: 'inherit',
	},
	'$ thead th strong': {
		color: 'inherit',
	},
	'$ em': {
		fontStyle: 'italic',
	},
}

// Keyboard styles
/**
 * Keyboard input (`<kbd>`) styles for prose content.
 * @internal
 *
 * @remarks Renders `<kbd>` elements with a subtle raised appearance using
 * box-shadow borders. Color and shadow are driven by dedicated CSS variables.
 *
 * @example
 * ```ts
 * typography() lowers this module into the `prose-kbd` Core shortcut definition.
 * ```
 */
export const proseKbdStyle: StyleDefinition = {
	'$ kbd': {
		color: 'var(--pk-prose-color-kbd)',
		fontSize: '0.875em',
		fontWeight: '500',
		fontFamily: 'inherit',
		borderRadius: '0.3125rem',
		paddingTop: '0.1875em',
		paddingRight: '0.375em',
		paddingBottom: '0.1875em',
		paddingLeft: '0.375em',
		boxShadow: '0 0 0 1px var(--pk-prose-kbd-shadows), 0 3px 0 var(--pk-prose-kbd-shadows)',
	},
}

// Lists styles
/**
 * Ordered list, unordered list, and definition list styles for prose content.
 * @internal
 *
 * @remarks Handles list markers (decimal, alpha, roman), nested list bullet
 * progression (disc → circle → square), item spacing, and definition list
 * (`<dl>`, `<dt>`, `<dd>`) layout.
 *
 * @example
 * ```ts
 * typography() lowers this module into the `prose-lists` Core shortcut definition.
 * ```
 */
export const proseListsStyle: StyleDefinition = {
	'$ ol': {
		listStyleType: 'decimal',
		marginTop: '1.25em',
		marginBottom: '1.25em',
		paddingLeft: '1.625em',
	},
	'$ ol[type="A"]': {
		listStyleType: 'upper-alpha',
	},
	'$ ol[type="a"]': {
		listStyleType: 'lower-alpha',
	},
	'$ ol[type="A" s]': {
		listStyleType: 'upper-alpha',
	},
	'$ ol[type="a" s]': {
		listStyleType: 'lower-alpha',
	},
	'$ ol[type="I"]': {
		listStyleType: 'upper-roman',
	},
	'$ ol[type="i"]': {
		listStyleType: 'lower-roman',
	},
	'$ ol[type="I" s]': {
		listStyleType: 'upper-roman',
	},
	'$ ol[type="i" s]': {
		listStyleType: 'lower-roman',
	},
	'$ ol[type="1"]': {
		listStyleType: 'decimal',
	},
	'$ ul': {
		listStyleType: 'disc',
		marginTop: '1.25em',
		marginBottom: '1.25em',
		paddingLeft: '1.625em',
	},
	'$ ul ul': {
		listStyleType: 'circle',
	},
	'$ ul ul ul': {
		listStyleType: 'square',
	},
	'$ li': {
		marginTop: '0.5em',
		marginBottom: '0.5em',
	},
	'$ ol > li': {
		paddingLeft: '0.375em',
	},
	'$ ul > li': {
		paddingLeft: '0.375em',
	},
	'$ > ul > li p': {
		marginTop: '0.75em',
		marginBottom: '0.75em',
	},
	'$ > ul > li > p:first-child': {
		marginTop: '1.25em',
	},
	'$ > ul > li > p:last-child': {
		marginBottom: '1.25em',
	},
	'$ > ol > li > p:first-child': {
		marginTop: '1.25em',
	},
	'$ > ol > li > p:last-child': {
		marginBottom: '1.25em',
	},
	'$ ul ul, $ ul ol, $ ol ul, $ ol ol': {
		marginTop: '0.75em',
		marginBottom: '0.75em',
	},
	'$ dl': {
		marginTop: '1.25em',
		marginBottom: '1.25em',
	},
	'$ dt': {
		color: 'var(--pk-prose-color-headings)',
		fontWeight: '600',
		marginTop: '1.25em',
	},
	'$ dd': {
		marginTop: '0.5em',
		paddingLeft: '1.625em',
	},
}

// Horizontal rule styles
/**
 * Horizontal rule (`<hr>`) styles for prose content.
 * @internal
 *
 * @remarks Applies generous vertical margins and a single-pixel top border
 * colored by the `--pk-prose-color-hr` variable. The element immediately
 * following an `<hr>` has its top margin collapsed.
 *
 * @example
 * ```ts
 * typography() lowers this module into the `prose-hr` Core shortcut definition.
 * ```
 */
export const proseHrStyle: StyleDefinition = {
	'$ hr': {
		borderColor: 'var(--pk-prose-color-hr)',
		// Explicit style keeps the rule visible when a reset sets `border: 0`
		borderTopStyle: 'solid',
		borderTopWidth: '1px',
		marginTop: '3em',
		marginBottom: '3em',
	},
	'$ hr + *': {
		marginTop: '0',
	},
}

// Headings styles
/**
 * Heading (h1–h4) styles for prose content.
 * @internal
 *
 * @remarks Each heading level gets a distinct font size, weight, line height,
 * and vertical margin. Nested `<strong>` receives a heavier weight and
 * `<code>` inherits the heading color. Sibling elements after h2/h3/h4
 * have their top margin collapsed.
 *
 * @example
 * ```ts
 * typography() lowers this module into the `prose-headings` Core shortcut definition.
 * ```
 */
export const proseHeadingsStyle: StyleDefinition = {
	'$ h1': {
		color: 'var(--pk-prose-color-headings)',
		fontWeight: '800',
		fontSize: '2.25em',
		marginTop: '0',
		marginBottom: '0.88em',
		lineHeight: '1.1',
	},
	'$ h1 strong': {
		fontWeight: '900',
	},
	'$ h1 code': {
		color: 'inherit',
	},
	'$ h2': {
		color: 'var(--pk-prose-color-headings)',
		fontWeight: '700',
		fontSize: '1.5em',
		marginTop: '2em',
		marginBottom: '1em',
		lineHeight: '1.33',
	},
	'$ h2 strong': {
		fontWeight: '800',
	},
	'$ h2 code': {
		color: 'inherit',
	},
	'$ h2 + *': {
		marginTop: '0',
	},
	'$ h3': {
		color: 'var(--pk-prose-color-headings)',
		fontWeight: '600',
		fontSize: '1.25em',
		marginTop: '1.6em',
		marginBottom: '0.6em',
		lineHeight: '1.6',
	},
	'$ h3 strong': {
		fontWeight: '700',
	},
	'$ h3 code': {
		color: 'inherit',
	},
	'$ h3 + *': {
		marginTop: '0',
	},
	'$ h4': {
		color: 'var(--pk-prose-color-headings)',
		fontWeight: '600',
		marginTop: '1.5em',
		marginBottom: '0.5em',
		lineHeight: '1.5',
	},
	'$ h4 strong': {
		fontWeight: '700',
	},
	'$ h4 code': {
		color: 'inherit',
	},
	'$ h4 + *': {
		marginTop: '0',
	},
}

// Blockquote styles
/**
 * Blockquote styles for prose content.
 * @internal
 *
 * @remarks Renders blockquotes with italic text, a left border accent,
 * and automatic open/close curly quotes via CSS `content`. Nested
 * `<code>` inherits the quote color.
 *
 * @example
 * ```ts
 * typography() lowers this module into the `prose-quotes` Core shortcut definition.
 * ```
 */
export const proseQuotesStyle: StyleDefinition = {
	'$ blockquote': {
		fontWeight: '500',
		fontStyle: 'italic',
		color: 'var(--pk-prose-color-quotes)',
		borderLeftWidth: '0.25rem',
		borderLeftColor: 'var(--pk-prose-color-quote-borders)',
		quotes: '"\\201C""\\201D""\\2018""\\2019"',
		marginTop: '1.6em',
		marginBottom: '1.6em',
		paddingLeft: '1em',
	},
	'$ blockquote p:first-of-type::before': {
		content: 'open-quote',
	},
	'$ blockquote p:last-of-type::after': {
		content: 'close-quote',
	},
	'$ blockquote code': {
		color: 'inherit',
	},
}

// Media styles (images, video, figure)
/**
 * Image, video, picture, figure, and figcaption styles for prose content.
 * @internal
 *
 * @remarks Applies consistent vertical margins to media elements and
 * collapses inner margins within `<figure>`. Figcaptions receive a
 * smaller font size and the captions color variable.
 *
 * @example
 * ```ts
 * typography() lowers this module into the `prose-media` Core shortcut definition.
 * ```
 */
export const proseMediaStyle: StyleDefinition = {
	'$ img': {
		marginTop: '2em',
		marginBottom: '2em',
	},
	'$ picture': {
		display: 'block',
		marginTop: '2em',
		marginBottom: '2em',
	},
	'$ video': {
		marginTop: '2em',
		marginBottom: '2em',
	},
	'$ figure': {
		marginTop: '2em',
		marginBottom: '2em',
	},
	'$ figure > *': {
		marginTop: '0',
		marginBottom: '0',
	},
	'$ figcaption': {
		color: 'var(--pk-prose-color-captions)',
		fontSize: '0.875em',
		lineHeight: '1.4',
		marginTop: '0.85em',
	},
}

// Code styles
/**
 * Inline code and preformatted code block styles for prose content.
 * @internal
 *
 * @remarks Inline `<code>` receives backtick-style pseudo-element wrappers
 * and bold weight. `<pre>` blocks get background color, rounded corners,
 * horizontal scroll, and padding. Code inside `<pre>` resets to inherit
 * parent styles and removes the backtick wrappers.
 *
 * @example
 * ```ts
 * typography() lowers this module into the `prose-code` Core shortcut definition.
 * ```
 */
export const proseCodeStyle: StyleDefinition = {
	'$ code': {
		color: 'var(--pk-prose-color-code)',
		fontWeight: '600',
		fontSize: '0.875em',
	},
	'$ code::before': {
		content: '"`"',
	},
	'$ code::after': {
		content: '"`"',
	},
	'$ pre': {
		color: 'var(--pk-prose-color-pre-code)',
		backgroundColor: 'var(--pk-prose-color-pre-bg)',
		overflowX: 'auto',
		fontWeight: '400',
		fontSize: '0.875em',
		lineHeight: '1.7',
		marginTop: '1.7em',
		marginBottom: '1.7em',
		borderRadius: '0.375rem',
		paddingTop: '0.85em',
		paddingRight: '1.14em',
		paddingBottom: '0.85em',
		paddingLeft: '1.14em',
	},
	'$ pre code': {
		backgroundColor: 'transparent',
		borderWidth: '0',
		borderRadius: '0',
		padding: '0',
		fontWeight: 'inherit',
		color: 'inherit',
		fontSize: 'inherit',
		fontFamily: 'inherit',
		lineHeight: 'inherit',
	},
	'$ pre code::before': {
		content: 'none',
	},
	'$ pre code::after': {
		content: 'none',
	},
}

// Table styles
/**
 * Table, thead, tbody, and tfoot styles for prose content.
 * @internal
 *
 * @remarks Tables span the full width with auto layout. Header cells receive
 * the headings color and bottom border; body rows get per-row bottom
 * borders (removed on the last row). First and last cell padding is
 * collapsed flush with the table edges.
 *
 * @example
 * ```ts
 * typography() lowers this module into the `prose-tables` Core shortcut definition.
 * ```
 */
export const proseTablesStyle: StyleDefinition = {
	'$ table': {
		width: '100%',
		tableLayout: 'auto',
		textAlign: 'left',
		marginTop: '2em',
		marginBottom: '2em',
		fontSize: '0.875em',
		lineHeight: '1.7',
	},
	'$ thead': {
		borderBottomWidth: '1px',
		borderBottomColor: 'var(--pk-prose-color-th-borders)',
	},
	'$ thead th': {
		color: 'var(--pk-prose-color-headings)',
		fontWeight: '600',
		verticalAlign: 'bottom',
		paddingRight: '0.57em',
		paddingBottom: '0.57em',
		paddingLeft: '0.57em',
	},
	'$ thead th:first-child': {
		paddingLeft: '0',
	},
	'$ thead th:last-child': {
		paddingRight: '0',
	},
	'$ thead th code': {
		color: 'inherit',
	},
	'$ tbody tr': {
		borderBottomWidth: '1px',
		borderBottomColor: 'var(--pk-prose-color-td-borders)',
	},
	'$ tbody tr:last-child': {
		borderBottomWidth: '0',
	},
	'$ tbody td': {
		verticalAlign: 'baseline',
	},
	'$ tbody td, $ tfoot td': {
		paddingTop: '0.57em',
		paddingRight: '0.57em',
		paddingBottom: '0.57em',
		paddingLeft: '0.57em',
	},
	'$ tbody td:first-child, $ tfoot td:first-child': {
		paddingLeft: '0',
	},
	'$ tbody td:last-child, $ tfoot td:last-child': {
		paddingRight: '0',
	},
}
