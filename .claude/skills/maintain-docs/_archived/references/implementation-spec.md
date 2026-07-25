# Docs Implementation Spec

Use this file as the implementation contract for the next phase of PikaCSS docs work. It sits below the route-level IA and above individual page briefs.

## Purpose

- Give docs authoring, brief maintenance, and runtime checks one shared contract.
- Prevent the next docs pass from drifting back into short, underspecified pages.
- Separate what is hand-authored from what must be generator-owned.

## Working agreement

- Strengthen contracts before rewriting large page bodies.
- English is the source pass. Mirror `zh-TW` after the English route and structure are correct.
- High-priority page rewrites come only after the brief schema and runtime checks are in place.

## IA revisions

### Learn route

- The main Learn spine remains: Getting Started -> Integrations -> Configuration -> Core Features -> Patterns -> Plugins.
- `Getting Started > ESLint setup` may recommend `Skills overview` as an early guided off-ramp for readers who prefer task routing over continued linear reading.
- That recommendation does not move the Skills section into Learn ownership. It remains a Help-owned resource.

### Help route

- Help still owns Troubleshooting, Contributing, and Skills.
- Skills are the only Help pages that may be surfaced directly from Getting Started as a proactive support option.
- Troubleshooting remains failure-driven and should not be introduced as a default next step for successful onboarding pages.

## Page brief contract

Every brief must keep the existing structure from `page-briefs/schema.md` and add the following required sections:

- `## Mental model` — the reader-facing conceptual model the page must establish.
- `## Validation` — how the reader confirms success, including the smallest credible command or observable result when applicable.
- `## Common pitfalls` — mistakes, misconceptions, or failure patterns the page must name explicitly.
- `## Required API links` — exact interfaces, types, helpers, or package reference pages the page must point to.

These sections are required because the next docs phase needs stronger enforcement than `Must include` alone can provide.

## Instructional page minimum depth

Tutorial and overview pages in Learn must cover all of the following:

- A usable mental model, not just a feature list.
- At least one concrete config or usage example.
- Observable input/output, generated result, or explicit outcome interpretation.
- Common pitfalls or boundary mistakes.
- Clear route-forward guidance in `## Next`.

If a page cannot satisfy that depth, it is either too broad and needs to split, or too narrow and should be absorbed into a neighboring page.

## API generator contract

- `docs/api/index.md` and `docs/zh-TW/api/index.md` remain hand-authored overview pages.
- Every package-level API page under `docs/api/*.md` other than `index.md` must be generator-owned.
- The generator must emit one page per published package.
- The generator source of truth is exported surface plus JSDoc, not hand-written prose patches.
- Generated API pages must carry an explicit generated marker and must not be manually edited.
- When JSDoc is incomplete, the generator should still emit the page and report the missing symbol coverage explicitly instead of silently omitting it or inventing prose.

## Help and Skills boundary

- `skills/index.md` is limited to public user-facing skills.
- `skills/index.md` must describe only `pikacss-use` and `pikacss-develop-plugin`.
- Internal repository workflow skills such as `maintain-docs`, `maintain-tests`, or exported-surface maintenance are out of scope for public docs.
- Public Skills pages act as task accelerators, not as a catalog of repository-internal workflows.

## Runtime enforcement targets

The docs runtime should report contract failures for at least:

- Missing required brief sections.
- API generator ownership gaps.
- Skills boundary violations in public Skills pages.
- Other contract gaps that block the next rewrite pass from trusting the docs structure.

## Planned rollout

1. Publish this implementation spec.
2. Upgrade the brief schema and review/policy references.
3. Extend runtime analysis with contract checks.
4. Upgrade the high-priority English page briefs.
5. Rewrite the high-priority English docs pages.
6. Mirror the approved structure and content into `zh-TW`.