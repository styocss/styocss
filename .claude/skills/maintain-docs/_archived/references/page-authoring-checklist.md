# Page Authoring Checklist

Use this checklist when turning a page brief into a real docs page.

Low-level formatting, example, and route rules are defined in `writing-conventions.md`, `example-authoring.md`, and `route-linking.md`. Use this file as the final page-level gate.

## Page identity

- The docs path matches the page brief `Canonical docs path`.
- The page belongs to the correct IA route and section.
- The page title matches the brief intent and does not drift into a neighboring topic.
- The page still needs to exist as its own page rather than being merged into an adjacent page.

## Metadata

- The page includes the required frontmatter unless it is the home page.
- `category` matches the section ownership defined in `information-architecture.md`.
- `relatedSources` point to the real source of truth for the page.
- The page has a concise `description` that can stand alone in LLM and search contexts.
- The frontmatter matches the page brief and does not silently change route ownership.
- Frontmatter and internal links follow `writing-conventions.md`.

## Content scope

- The page fulfills the brief `Purpose`.
- The page addresses the intended target reader and assumed prerequisites.
- Every item in `Must include` is present.
- The page does not absorb topics listed in `Must not include`.
- If the page boundary feels blurry, update the brief before expanding the prose.

## Wording

- The page title matches the agreed page-kind wording pattern, including the `Overview` suffix for overview pages.
- The page voice matches its page kind:
	- Overview pages orient and route.
	- Tutorial pages teach how and when to use something.
	- API reference pages document the exported surface of a package.
	- Help pages help readers diagnose, reroute, or choose a support resource.
- The page intro reflects the brief `Purpose` rather than drifting into marketing or generic explanation.
- The implied audience in the prose matches the brief `Target reader`.
- The page assumes the same route stage and capability level described in `Prerequisites`.
- Core takeaways align with the `What`, `How`, `When`, and `Why` expectations from the brief instead of collapsing into an unstructured topic dump.
- Optional authoring notes from the brief have been respected and not expanded into extra page scope.

## Examples

- The page follows the example requirement from the brief.
- Instructional pages use examples that match the route and task level.
- Example mechanics follow `example-authoring.md`.
- Pages with `No example required; ...` in the brief still justify the omission by matching that reason in the page structure.

## Route linking

- The page follows `route-linking.md`.
- Route-local links are stronger and more visible than cross-route links.
- Cross-route links only appear when the reader's next action really changes route.
- Reference links are used for exact lookup, not as the default next step from an instructional page.
- Help links act as recovery or support off-ramps, not as the main progression path.
- If the page crosses into plugin authoring, API lookup, or troubleshooting, it says why.

## `## Next`

- The page ends with `## Next` as the final section.
- `## Next` follows the progression limits defined in `route-linking.md`.
- `## Next` reflects the page brief `Link contract`.
- The strongest next step is not hidden only in inline prose.

## Locale mirroring

- The English page is correct before mirroring to `zh-TW`.
- The `zh-TW` page preserves the same structure, route ownership, and route-transfer intent.
- The translated page keeps the same example structure and `## Next` behavior.

## Validation

- The smallest credible docs validation has been run for the changed area.
- Example tests have been run when examples were added or changed.
- Generated API pages were regenerated instead of hand-edited when API reference content changed.
- Nav, sidebar, and route links still match the current IA when the page is a new entry point or overview page.

## Generated API exceptions

- Generated API pages still follow route ownership, frontmatter, description, `## Next`, and route-linking expectations.
- Generated API pages may skip custom hand-authored examples when the generator owns the page structure.
- Generated API pages may use generator-provided signatures and summaries instead of manually expanded prose when that keeps the reference accurate.
- Generated API pages should still preserve the package-reference voice established by the brief.
- If a generated API page needs special handling, update the generator or its inputs instead of patching the generated output by hand.

## Handoff

- The page is ready for `maintain-docs-review`.
- The brief is still accurate after writing the page, or it has been updated in the same pass.