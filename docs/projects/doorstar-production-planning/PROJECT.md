---
id: PROJECT-DOORSTAR-PRODUCTION-PLANNING
name: Doorstar Production Planning Adoption
owner: root
status: ACTIVE
created: 2026-07-27
---

# Doorstar Production Planning Adoption

## Goal

Adopt SpaceOS Production Planning for Doorstar without replacing the accepted
Üzemi Tábla UX or losing the existing, proven Excel calculation semantics. The
target is automatic, explainable duration calculation and a capacity-aware
calendar for the Doorstar tenant.

The Excel workbook is the behavioural reference, not the implementation
target. Doorstar reproduces each approved business rule as a typed,
independently-tested domain rule and treats Power Query output as an explicit
adapter input. No worksheet formula text, cell address or VBA behaviour is
copied into production code.

## Epic boundary

Doorstar owns the legacy-workbook adapter, source mapping, tenant instance
pack, shadow comparison, UI consumption and Doorstar UAT. The SpaceOS C#
platform owns the generic Production Planning API, tenant identity, policy,
calendar engine, capacity reservation and RLS.

No C# platform source is created or copied into this repository. The required
external epic is defined in `PLATFORM_HANDOFF_EPIC.md` and must be created by
the JoineryTech platform owner in the platform repository.

## Success criteria

- legacy `Volumen × Egység idő` and workforce semantics have a tested,
  versioned compatibility baseline;
- no estimate can be published with missing volume, standard, resource or
  calendar configuration;
- Doorstar standards, resources and calendar are tenant-scoped configuration;
- shadow comparison proves selected legacy examples before live planning;
- the Doorstar UI consumes the published C# OpenAPI contract, not a second
  Node scheduling API.

## Source evidence

- `docs/knowledge/architecture/SPACEOS_PRODUCTION_PLANNING_ADR_2026-07-27.md`
- `docs/knowledge/domain/DOORSTAR_NORMTIME_SOURCE_ANALYSIS_2026-07-27.md`
- `docs/knowledge/domain/DOORSTAR_LEGACY_SCHEDULING_MODEL_ANALYSIS_2026-07-27.md`

## Stop conditions

Stop and escalate on an unpublished platform contract, an unmapped standard,
an ambiguous source unit, data-loss risk, tenant-isolation failure or a plan
that differs from the approved legacy baseline without a documented reason.
