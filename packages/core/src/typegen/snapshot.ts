/** Path-free preview asset produced by deterministic Typegen finalization. */
export interface TypegenPreviewAsset {
	/** Opaque semantic asset identity used only to bind a later host href. */
	readonly id: string
	/** Raw preview content. The host owns physical materialization/content addressing. */
	readonly content: string
	/** Media type describing the raw content (for example `image/svg+xml`). */
	readonly mediaType: string
}

/** Path-free reference from member documentation to one preview asset artifact. */
export interface TypegenPreviewImage {
	readonly assetId: string
	/** Optional Markdown image alt text. */
	readonly alt?: string
}

/** Intentional semantic JSDoc tag owned by Typegen rather than arbitrary prose. */
export interface TypegenJSDocTag {
	/** Tag name without the leading `@` (for example `deprecated`). */
	readonly name: string
	/** Optional lexical-safe tag text. */
	readonly text?: string
}

/** Path-free rich documentation vocabulary for generated Typegen members. */
export interface TypegenDocumentation {
	/** User/domain description rendered before preview content. */
	readonly description?: string
	/** Resolved CSS semantics shown in the established PikaCSS fenced preview. */
	readonly previewCss?: string
	/** Preview image references whose hrefs are deliberately host-owned. */
	readonly previewImages?: readonly TypegenPreviewImage[]
	/** Intentional Typegen-owned semantic JSDoc tags. */
	readonly tags?: readonly TypegenJSDocTag[]
}

/** Managed Typegen attachment points contributed by one plugin. */
export interface TypegenContribution {
	/** Stable contribution identity. Must be non-empty and unique per Engine. */
	readonly id: string
	/** Verbatim supporting TypeScript declarations. */
	readonly declarations?: string
	/** First-level Pika static-extension type roots. */
	readonly pika?: Readonly<Record<string, string>>
	/**
	 * TypeScript type reference contributed to the nested selector surface.
	 * @default `undefined`
	 */
	readonly selectors?: string
	/**
	 * TypeScript type reference contributed to the generated property surface.
	 * @default `undefined`
	 */
	readonly properties?: string
	/**
	 * TypeScript type reference contributed to CSS property names and values.
	 * @default `undefined`
	 */
	readonly cssProperties?: string
	/**
	 * TypeScript type reference contributed to CSS property value autocomplete.
	 * @default `undefined`
	 */
	readonly cssPropertyValues?: string
	/**
	 * TypeScript type reference that narrows or constrains generated properties.
	 * @default `undefined`
	 */
	readonly propertyConstraints?: string
}

/** Immutable semantic contribution captured in a finalized Typegen snapshot. */
export interface TypegenSnapshotContribution {
	/** Stable contribution identity copied from the registered contribution. */
	readonly id: string
	/**
	 * Supporting TypeScript declarations captured for the finalized snapshot.
	 * @default `undefined`
	 */
	readonly declarations?: string
	/**
	 * First-level Pika static-extension type roots captured for the snapshot.
	 * @default `undefined`
	 */
	readonly pika?: Readonly<Record<string, string>>
	/**
	 * TypeScript type reference contributed to the nested selector surface.
	 * @default `undefined`
	 */
	readonly selectors?: string
	/**
	 * TypeScript type reference contributed to the generated property surface.
	 * @default `undefined`
	 */
	readonly properties?: string
	/**
	 * TypeScript type reference contributed to CSS property names and values.
	 * @default `undefined`
	 */
	readonly cssProperties?: string
	/**
	 * TypeScript type reference contributed to CSS property value autocomplete.
	 * @default `undefined`
	 */
	readonly cssPropertyValues?: string
	/**
	 * TypeScript type reference that narrows or constrains generated properties.
	 * @default `undefined`
	 */
	readonly propertyConstraints?: string
}

/** Path-independent Typegen semantic state produced by Engine finalization. */
export interface TypegenSnapshot {
	/** Contributions captured and sorted when the Engine was finalized. */
	readonly contributions: readonly TypegenSnapshotContribution[]
	/** Path-free preview artifacts; host materialization binds these ids to hrefs later. */
	readonly previewAssets: readonly TypegenPreviewAsset[]
}
