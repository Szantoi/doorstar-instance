# ADR — Two-sided Doorstar door structure and component appearance

Date: 2026-07-30  
Status: Amended after terminology research; frontend safety boundary accepted;
backend contract pending

## Context

Every Doorstar door position has two stable physical wall/room sides. For the
common adjustable wrap-around frame, one side has a casing that is structurally
fixed to the lining/core and the other has a casing that is adjusted during
installation to the actual wall depth.

`FIXED` and `ADJUSTABLE` are therefore casing roles for that frame system, not
universal identities of the two physical sides. A fixed/block/concealed/sliding
or other product may have different casing roles or no casing on a side.

The two visible door-leaf faces may have different finish, colour and pattern.
The visible frame (`tok`) and either casing may also differ from the matching
door-leaf face. `Tokmag` is a separate Doorstar manufacturing-component term,
not a synonym for the complete frame.

The source documents already separate these concepts. The XLSM profiles have
distinct FIXED and ADJUSTABLE leaf-face surface/colour/pattern fields and,
separately, casing surface/colour/pattern fields on both sides. The Sales PDF
has side-unspecified leaf and frame colour/pattern hints. The current
`OrderPosition.surface` and `finishKey` fields cannot represent this without
loss.

## Decision

The canonical position model will contain a `DoorStructureSpec` with exactly
two stable physical sides:

```text
DoorStructureSpec
├─ frameSystem
│  ├─ profileRef + version
│  ├─ visibleFrameSurfaceAppearance
│  └─ adjustability
├─ sides
│  ├─ SIDE_A
│  │  ├─ spaceRef
│  │  ├─ leafFaceAppearance
│  │  ├─ casingState: UNRESOLVED | NOT_APPLICABLE | PRESENT
│  │  ├─ casing { role, appearance }  # only when PRESENT
│  │  └─ wallSolution
│  └─ SIDE_B
│     ├─ spaceRef
│     ├─ leafFaceAppearance
│     ├─ casingState: UNRESOLVED | NOT_APPLICABLE | PRESENT
│     ├─ casing { role, appearance }  # only when PRESENT
│     └─ wallSolution
├─ handing + handingConvention
└─ opensIntoSide
```

`SIDE_A` and `SIDE_B` remain stable if a product or casing role changes.
Unknown casing applicability is `UNRESOLVED`; verified absence is
`NOT_APPLICABLE`; only `PRESENT` has a casing object. Its role is
`UNRESOLVED`, `FIXED`, `ADJUSTABLE` or `OTHER`. These roles are never used as
side keys. They are not synonyms for hinge/strike jamb, left/right handing or
swing direction. Product-specific rules may relate the fixed casing to the
rebate/hinge face, but the frontend and backend never infer that relation
globally.

For a confirmed adjustable wrap-around frame the appearance targets are:

1. SIDE_A door-leaf face;
2. SIDE_B door-leaf face;
3. visible frame-surface appearance;
4. the casing whose role is `FIXED`;
5. the casing whose role is `ADJUSTABLE`.

Other frame systems derive their applicable appearance targets from a
versioned profile. A verified missing component is explicitly
`NOT_APPLICABLE`; unknown applicability stays `UNRESOLVED`.

If Doorstar later confirms that the visible frame faces may differ, this model
will be extended with explicit side-scoped frame-face appearances. No such
difference is inferred from the existing source fields.

Each appearance selection has an explicit state:

- `UNRESOLVED`;
- `INHERIT` with a typed, non-circular source target;
- `EXPLICIT` with either versioned catalog references or a reviewed custom
  finish/colour/pattern value plus reason.

`null` never means inheritance. The backend validates allowed inheritance and
returns both the effective value and its lineage. The frontend does not derive
effective appearance.

Compensation for a casing whose role is `ADJUSTABLE` is a backend-owned,
versioned and reviewed projection. `openingDepthMm` remains a legacy measured
wall-depth observation and is never overwritten with frame depth or a
compensation result.

Legacy `surface`, `finishKey`, `Project.szinTok` and `Project.szinLap` remain
read-only compatibility hints. They are not copied to several component
targets automatically. An “identical” selection is also an explicit technical
decision.

`Tokmag` remains a separate manufacturing-component concept. The research does
not assume it is non-visible. Until Doorstar profile drawings define the BOM
and visibility boundary, appearance targets the abstract
`visibleFrameSurface`; it is not automatically assigned to or excluded from
the tokmag.

Until the structured write contract is available:

- the frontend keeps the two physical sides visible and presents the five
  targets only as an adjustable-wrap-around-frame candidate;
- labelled legacy values remain unassigned source observations;
- the generic finish selector is visibly marked as legacy;
- technical review remains fail-closed until frame-system applicability and
  side-role mapping are server-authoritative.

## Import and evidence rules

- XLSM FIXED/ADJUSTABLE leaf fields preserve their source casing-role label.
  They become canonical `SIDE_A`/`SIDE_B` leaf-face candidates only when a
  reviewed space/side mapping exists.
- XLSM casing fields become casing-role candidates and are likewise mapped to
  a physical side only with reviewed evidence.
- Sales `lapColour/lapPattern` remains a side-unspecified leaf candidate.
- Sales `tokColour/tokPattern` remains a frame candidate.
- `BKM_FIX`, `BKM_MOVING` and `TOK` values are manufacturing dimensions, not
  appearance.
- Generic surface, project colour and one side's value are never replicated
  to another target.

Evidence must store component target, optional physical side, optional source
casing role, field, raw and normalized value, source locator, review state and
resolution. Deprecated generic `SURFACE` evidence cannot authorize a
structured appearance.

## Consequences

The UI can communicate the real door structure now without manufacturing a
false complete state. Backend delivery requires stable physical sides,
profile-dependent casing roles and applicability, an additive appearance
model, OpenAPI schemas, server-authoritative readiness, field evidence and a
versioned order-content hash. Existing REVIEW/APPROVED revisions must retain
their old hash schema; new DRAFT review uses the new structure-aware schema.
