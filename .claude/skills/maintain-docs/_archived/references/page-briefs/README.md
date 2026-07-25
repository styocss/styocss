# Page briefs

Use this directory for page-level content contracts that sit under the section-level IA in `information-architecture.md`.

## Purpose

- Keep page definitions explicit before or alongside docs authoring.
- Make future docs work less dependent on ad hoc placement decisions.
- Give `maintain-docs` a stable, human-readable contract for what each page is supposed to do.

## Directory layout

```text
references/page-briefs/
├── README.md
├── schema.md
├── learn/
│   ├── README.md
│   ├── getting-started/
│   ├── integrations/
│   ├── configuration/
│   ├── core-features/
│   ├── patterns/
│   └── plugins/
├── extend/
├── reference/
└── help/
```

## Routing rule

- The first directory level mirrors the top-level IA route: `learn`, `extend`, `reference`, or `help`.
- The second directory level mirrors the section slug within that route.
- Each brief file represents one canonical docs page.

## Naming rule

- Use `index.md` for overview pages.
- Use the intended canonical docs slug for non-overview pages.
- If the current docs file name is expected to change, the brief file should use the target name and document the intended canonical docs path explicitly.

## Scope rule

- A page brief defines intent and boundaries for a single page.
- A route README or section README may summarize ordering and coverage, but it does not replace per-page briefs.
- English page briefs define the source structure for `zh-TW` mirrors.

## Shared reference boundary

- Keep each leaf brief standalone and page-specific.
- Shared authoring mechanics belong in top-level references rather than being copied into briefs.
- Use `../information-architecture.md` for route ownership and section placement.
- Use `../route-linking.md` for route progression and `## Next` behavior.
- Use `../writing-conventions.md` and `../example-authoring.md` for page-level authoring rules.

## Required companions

- Every brief must follow `schema.md`.
- Every Learn section should have at least one overview brief.
- If a page is in the default learning route, its brief should define expected incoming and outgoing links.
- Follow `../implementation-spec.md` when deciding whether a brief is deep enough for the next rewrite pass.