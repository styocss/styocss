# Page brief schema

Use this schema for every page brief under `references/page-briefs/`.

## Required structure

```md
# <Page name>

- Canonical docs path: `docs/...`
- Route group: `learn | extend | reference | help`
- Section: `<section name>`
- Category: `<frontmatter category>`
- Page kind: `overview | tutorial | reference | troubleshooting | resource`
- Status: `planned | active | needs-review`
- Locale policy: `mirror-to-zh-TW`

## Purpose

<1-2 sentences describing the job of the page>

## Target reader

- <primary reader role and task>

## Prerequisites

- Route stage: <where the reader is in the route>
- Capability: <what the reader can already understand or do>

## Must include

- What <reader takeaway or concept>
- How <reader decision, workflow, or model>
- When <boundary, choice, or escalation>
- Why <constraint, tradeoff, or consequence>

## Mental model

- <the conceptual model the page must establish>

## Example requirement

- <command-style example requirement, or `No example required; <reason>.`>

## Validation

- <how the reader confirms success>

## Common pitfalls

- <mistake, misconception, or failure pattern the page must name>

## Required API links

- <exact type, helper, interface, or package reference page the reader may need>

## Must not include

- <neighboring topics that belong elsewhere>

## Link contract

- Incoming route-local: <same-route pages that should point here>
- Incoming cross-route: <other-route pages that should point here, or `None`>
- Outgoing route-local: <same-route pages this page should route to>
- Outgoing cross-route: <other-route pages this page should route to, or `None`>

## Source of truth

- <packages, source files, examples, JSDoc, or config files>

## Notes

- <single authoring constraint, optionally with short rationale>
```

## Field rules

- `Canonical docs path` is the intended English docs file path, even if the page does not exist yet.
- `Route group` must align with the top-level taxonomy in `information-architecture.md`.
- `Section` must match the section that owns the page in the IA.
- `Category` should match the eventual page frontmatter `category`.
- `Page kind` clarifies whether the page teaches, routes, helps diagnose, or primarily supports lookup.
- `Status` is editorial state for the brief, not runtime verification status.
- `Locale policy` is `mirror-to-zh-TW` by default unless the page is intentionally English-only.

## Content rules

- Keep `Purpose` concise and action-oriented.
- `Target reader` and `Prerequisites` should be concrete enough to prevent topic sprawl.
- `Must include` should list the non-negotiable content contract, not every possible subheading.
- `Mental model` is required for all instructional pages and should capture the conceptual model that prevents shallow list-style pages.
- `Example requirement` is mandatory for instructional Learn pages. If examples are optional, say why.
- `Validation` is required whenever the page teaches a workflow, setup step, or generated outcome.
- `Common pitfalls` is required because page boundaries alone do not prevent omission of likely reader mistakes.
- `Required API links` should name exact interfaces, helpers, types, or package reference pages when the page depends on API lookup support.
- `Must not include` is required because page boundaries are part of the IA contract.
- `Link contract` should reflect route progression, not just any related link. Use `references/route-linking.md` as the source of truth for cross-route behavior.
- `Source of truth` should identify the authoritative code or docs artifacts without relying on absolute filesystem paths.

## Wording rules

- Overview page titles should keep the `Overview` suffix.
- Use a page-kind-specific `Purpose` template whenever possible:
	- Overview: `Orient readers to <topic> and route them to the right next page...`
	- Tutorial: `Teach how and when to use <topic>...`
	- Reference in `reference/api`: `Document the exported surface of <package>.`
	- Reference outside `reference/api`: `Explain <topic>...`
	- Troubleshooting: `Help readers diagnose <problem space> and route them to the most relevant fix path.`
	- Resource: `Help readers understand when and how to use <resource>.`
- `Target reader` should prefer role-and-task phrasing such as `Users who...`, `Developers who...`, or `Plugin authors who...`.
- `Prerequisites` should always list `Route stage` first and `Capability` second.
- `Must include` bullets should prefer result-oriented `What`, `How`, `When`, and `Why` phrasing over raw topic fragments.
- `Must not include` bullets should stay as topic exclusions, not imperative instructions.
- `Example requirement` should use command-style wording such as `Include ...` or the fixed form `No example required; <reason>.`
- `Notes` should normally stay to a single bullet and should capture an authoring constraint, not a second page summary.

## Link contract rules

- A page brief should identify the route-local next step first.
- Cross-route links should exist only when the reader's next action changes route.
- Reference links should not replace route-local teaching links when the page is instructional.
- Help links should be recovery or support off-ramps, not default progression.
- If a page regularly needs more than one cross-route exit in its primary flow, its IA boundary likely needs review.
- Use all four `Link contract` lines even when one of them is `None` so the route behavior stays explicit.

See `references/route-linking.md` for the full route-to-route linking policy.

## Directory rule

- Store briefs under the route and section they belong to.
- Use `README.md` only for route-level inventories or conventions, not as a substitute for a page brief.