# EPIC-SPACEOS-PRODUCTION-PLANNING — C# platform handoff

**Owner:** JoineryTech / SpaceOS platform repository  
**Status:** requested; not implemented in the Doorstar repository

## Required deliverable

Create the tenant-aware Production Planning module in the C# / ASP.NET Core
platform. It owns the OpenAPI, JWT tenant resolution, policy checks,
PostgreSQL RLS/query isolation, resource calendars, finite-capacity scheduler,
plan revisions, reservations and audit events.

## Doorstar consumer requirements

- import versioned standards with product/component/finish qualifiers;
- calculate elapsed duration and separate labour demand;
- support FS/SS/FF/SF, partial release, fixed-date overrides and extra days;
- offer proposal, shadow comparison and explicit publication semantics;
- expose overloads and calendar slots through OpenAPI;
- preserve the Doorstar legacy formula as a compatibility test baseline.

## Gate to Doorstar work

Publish the C# package compatibility manifest, Planning OpenAPI, tenant/RLS
proof and exact version/hash. Doorstar then starts DSPLAN-02 without copying
platform source code.
