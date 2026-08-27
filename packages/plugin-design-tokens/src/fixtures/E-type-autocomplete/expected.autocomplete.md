# Expected autocomplete surface (TARGET — bottleneck E)

Each token should register as a CSS variable AND, from its `$type`, populate
`VariableSuggest.asValueOf` with a sensible default property set
(overridable via `designTokens.typeAutocomplete`).

| Token | Var | `$type` | Expected `asValueOf` (default map) |
|---|---|---|---|
| `color.primary` | `--color-primary` | `color` | `color`, `background-color`, `border-color`, `outline-color`, `fill`, `stroke` |
| `space.md` | `--space-md` | `dimension` | `width`, `height`, `min-width`, `min-height`, `max-width`, `max-height`, `margin`, `padding`, `gap`, `inset`, `font-size`, `border-radius` |
| `motion.fast` | `--motion-fast` | `duration` | `transition-duration`, `animation-duration` |
| `font.family.sans` | `--font-family-sans` | `fontFamily` | `font-family` |
| `font.weight.bold` | `--font-weight-bold` | `fontWeight` | `font-weight` |
| `z.modal` | `--z-modal` | `number` | `z-index`, `opacity`, `line-height`, `flex-grow`, `flex-shrink`, `order` |

CURRENT (0.0.58): variables are registered, but `$type` does not drive
`asValueOf`, so no type-appropriate value suggestions are produced. The exact
default property sets above are a proposal — the point of the fixture is that
*some* deterministic, `$type`-derived, overridable mapping exists.
