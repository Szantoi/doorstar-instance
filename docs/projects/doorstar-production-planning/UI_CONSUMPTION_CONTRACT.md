# Doorstar Planning UI — JoineryTech UI-kit consumption contract

**Status:** required for implementation  
**Source of truth:** JoineryTech portal `src/components/ui` and `design-system`

## Decision

The Doorstar Planning UI consumes the JoineryTech UI kit through a published,
versioned package. It does not use cross-repository relative imports and does
not copy portal component source into the Doorstar application.

The Planning screen is a **world/composition**, not evidence of a directly
installed product module. Its final world-to-module mapping is published by
the Planning product manifest and Instance Context API. A generic Planning
core may be `spaceos.planning` only if it remains industry-neutral; joinery
standards and Doorstar source adapters stay on `joinerytech.*` / `doorstar.*`
boundaries. Doorstar must not invent a permanent module ID locally.

## Product lifecycle and enforcement boundary

The screen may be shown only from a server-authoritative capability result
that confirms the product lifecycle gate:

`known -> installed -> entitled -> enabled -> usable`.

- A JWT `enabled_modules` claim is a display hint only. It can filter a tile
  optimistically, but it is never an authorization decision.
- Every planning API call independently enforces entitlement, permission and
  tenant isolation server-side. A route or UI-gating bypass must yield no plan,
  calendar, standard or reservation data.
- If the capability result is absent, stale or incomplete, the Doorstar UI is
  fail-closed: it shows an unavailable explanation and makes no Planning API
  call. It does not replace the server check.
- The published module manifest supplies the canonical module IDs, compatible
  UI-kit package version, generated OpenAPI client version and integrity hash.
  An unsigned, unknown, revoked or incompatible manifest disables the feature.

The currently verified canonical primitives are:

- `Card` and `KpiCard` for estimate, capacity and overload summaries;
- `StatusPill` for proposal, warning, published and blocked states;
- `Button` for recalculation and publication actions;
- `Tabs` for proposal, calendar, variance and audit views;
- `DataTable` for standard/import and overload lists;
- `SlideOver` for a planning-run detail on desktop, bottom-sheet behaviour on
  mobile;
- `ProgressBar` for partial-release and planning-run progress;
- `QueryGate` for loading/error/empty states.

Native SVG is used only for the Gantt and dependency-graph drawing surface;
the surrounding page, actions, state and detail affordances consume the
published UI-kit primitives once available. No JoineryTech component source is
copied into Doorstar for charting.

## Doorstar-specific rules

- The production world uses the JoineryTech teal accent and canonical status
  tones; business status never gets a new ad-hoc colour.
- A blocked action remains visible, `aria-disabled` and explains the missing
  prerequisite. It is not hidden.
- The planning page keeps the accepted Doorstar workshop terminology and the
  existing Üzemi Tábla workflow context.
- Mobile controls have a 44px minimum hit area; desktop uses SlideOver and
  mobile uses bottom-sheet presentation.
- The UI displays a C# Planning proposal and audit data. It never calculates
  authoritative dates locally.

## Package gate

The JoineryTech portal currently exposes the UI kit from a private application
source tree rather than an installable package. Before Doorstar code imports
it, the platform owner must publish a versioned package/export manifest with
React, Router and Query peer-dependency compatibility. This prevents a source
fork and permits independent Doorstar deployment.

Until that release, Doorstar may follow the documented visual/accessibility
rules but must not claim direct component consumption.

The generated Planning OpenAPI client and the product manifest are a joint
gate. A locally written substitute DTO, a hard-coded module identifier or a
mock scheduling endpoint is not an acceptable integration path.

## Planning UI acceptance

- one generated client query populates the planning proposal; no handwritten
  duplicate API DTO;
- estimate, labour, resource, calendar version and warnings are visible;
- unpublished proposal has a visible disabled/publish policy state;
- keyboard, screen-reader and mobile behaviour use the UI-kit primitive
  contracts;
- visual regression covers the planning summary, calendar and detail sheet.
- visual regression and accessibility checks cover the Gantt timeline and the
  `FS`/`SS`/`FF`/`SF` dependency graph labels.
- product conformance verifies that hiding or directly navigating around the
  world gate does not bypass the server's entitled/enabled/RLS enforcement.
