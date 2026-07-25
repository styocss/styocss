# Route Linking

Use this reference to keep cross-linking consistent across the four IA routes: Learn, Extend, Reference, and Help.

## Purpose

- Keep page progression predictable.
- Prevent lookup, recovery, and authoring links from overpowering the main teaching flow.
- Make `## Next` sections and in-body route transfers follow the same logic.
- Give page briefs a stable rule set for `Link contract` decisions.

## Route roles

| Route | Primary job | Default user state |
|---|---|---|
| Learn | Teach adoption and usage | The reader is progressing forward |
| Extend | Teach authoring and extension | The reader is implementing or modifying plugins |
| Reference | Provide exact lookup | The reader already knows what they need |
| Help | Recover, reroute, or support | The reader is blocked or needs adjacent resources |

Link behavior must preserve these roles.

## Link types

| Link type | Meaning | Typical placement |
|---|---|---|
| Route-local progression | The next page in the same route | `## Next`, overview pages, inline "continue" links |
| Route transfer | The reader's next action belongs to another route | overview pages, boundary callouts, final `## Next` |
| Reference lookup | Exact API or config lookup needed to support the current task | inline contextual links, occasional `## Next` item |
| Recovery off-ramp | The reader is blocked and needs help | warnings, troubleshooting callouts, occasional `## Next` item |

## Default hierarchy

When choosing links, prefer them in this order:

1. Route-local progression
2. Route transfer only when the reader's next action changes route
3. Reference lookup only when exact symbols or options matter
4. Recovery off-ramp only when failure or confusion is likely

If a lower-priority link is doing the job of a higher-priority link, the page is probably mislinked.

## Learn linking rules

- Learn pages should prefer Learn-to-Learn progression.
- Learn may link to Reference when the reader needs exact lookup, but Reference should not become the default next step for a teaching page.
- Learn may link to Help when setup or output failures are a realistic interruption.
- Learn should link to Extend only at explicit authoring boundaries, such as "you now need to build a plugin".
- Consumer plugin pages must not silently drift into plugin authoring. That handoff should be explicit.

### Allowed Learn transfers

- Learn -> Learn: default and preferred.
- Learn -> Reference: for exact config or API lookup.
- Learn -> Help: for troubleshooting or supporting resources.
- Learn -> Extend: only when the reader is crossing into plugin authoring.

## Extend linking rules

- Extend pages should prefer Extend-to-Extend progression.
- Extend may link back to Learn when consumer behavior is the context an author needs to understand.
- Extend may link to Reference when exact exports, types, or package surfaces matter.
- Extend may link to Help for contribution workflows or troubleshooting authoring issues.
- Extend should not send readers into consumer plugin guides as the primary next step unless the author explicitly needs usage context.

### Allowed Extend transfers

- Extend -> Extend: default and preferred.
- Extend -> Reference: common and often necessary.
- Extend -> Learn: only for consumer-context grounding.
- Extend -> Help: when repository workflow or troubleshooting becomes the next task.

## Reference linking rules

- Reference pages are lookup surfaces, not learning spines.
- Reference should link outward sparingly and only when the reader needs conceptual context or route recovery.
- Reference may link to Learn for usage guidance.
- Reference may link to Extend for authoring context when the API belongs to plugin authors.
- Reference may link to Help when a lookup page cannot resolve a likely failure on its own.

### Allowed Reference transfers

- Reference -> Learn: for conceptual or usage context.
- Reference -> Extend: for authoring context.
- Reference -> Help: for blocked readers.
- Reference -> Reference: only when package or symbol lookup naturally continues.

## Help linking rules

- Help pages should reroute readers back into the route that solves their actual task.
- Help is not a replacement for Learn, Extend, or Reference.
- Troubleshooting should point readers back to the route where the fix lives.
- Contributing should route readers into repository workflows, docs routes, or API pages as needed.
- Skills pages should point readers to the route the skill accelerates.

### Allowed Help transfers

- Help -> Learn: when the issue is setup, usage, or consumer workflow.
- Help -> Extend: when the issue is plugin authoring or extension work.
- Help -> Reference: when exact lookup is the next useful step.
- Help -> Help: only when moving between support resources is genuinely useful.

## Overview page rules

- Every overview page should provide one clear route-local starting point.
- Overview pages may expose route transfers more visibly than leaf pages because they act as routers.
- Even on overview pages, route-local links should appear before optional off-route destinations.

## Leaf page rules

- Leaf pages should make the next same-route page easy to follow.
- Cross-route links on leaf pages should be explicit about why the reader is leaving the current route.
- Avoid mixing multiple different off-route motivations in the same short `## Next` list.

## `## Next` rules

- `## Next` should normally contain 2-4 links.
- At least one `## Next` link should stay within the current route unless the page is intentionally terminal.
- Most instructional pages should include no more than one cross-route link in `## Next`.
- Reference pages may use `## Next` to point to one owning guide page and one neighboring reference page.
- Help pages should include at least one "back to the solving route" link.

## Inline link rules

- Use inline links for exact lookups, clarifications, and short route transfers that support the current paragraph.
- Do not use inline links to smuggle in the real next step while `## Next` points somewhere weaker.
- If a route transfer is critical to the page boundary, say why the reader should switch routes.

## Common transfer patterns

### Learn -> Reference

Use when:

- The reader needs exact option names.
- The reader needs exported API signatures.
- The conceptual teaching is already complete on the current page.

Do not use when:

- The page still owes the reader a conceptual explanation.

### Learn -> Help

Use when:

- The page includes a common failure point.
- The reader may see missing output, invalid config, or integration-specific breakage.

Do not use when:

- The "problem" is just a concept that should be explained in Learn.

### Learn -> Extend

Use when:

- The reader is now authoring a plugin or extending engine behavior.

Do not use when:

- The reader only needs to consume an official plugin.

### Extend -> Learn

Use when:

- An author needs consumer-facing context to judge design or UX impact.

Do not use when:

- The real need is exact exported behavior, which belongs in Reference.

### Help -> Solving route

Use when:

- A problem has been identified and the fix lives in Learn, Extend, or Reference.

Do not use when:

- The Help page can and should resolve the issue directly.

## Anti-patterns

- Do not use API pages as the main next step from a beginner teaching page.
- Do not link from consumer plugin docs into authoring docs without naming the authoring boundary.
- Do not use Help as a dumping ground for unrelated "see also" links.
- Do not build circular `## Next` lists that bounce readers between routes without a task change.
- Do not make route transfers implicit. State why the reader should leave the current route.

## Locale rule

- English and `zh-TW` pages should preserve the same route-transfer intent even if link labels are translated.
- If one locale changes a route transfer, the mirrored locale should be updated in the same maintenance pass.

## Page brief handoff

When writing a page brief `Link contract`:

- Name the route-local incoming pages first.
- Name the route-local outgoing pages first.
- Add cross-route exits only when they represent a real task transition.
- Treat Reference as lookup support, not as default progression.
- Treat Help as recovery or support, not as default progression.