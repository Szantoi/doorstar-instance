# DSPLAN-06 — Planning visualizations

**Status:** rendering baseline complete; live C# proposal integration blocked

## Purpose

Give Doorstar planners two complementary, audit-friendly ways to inspect a Planning proposal without recreating scheduler logic in the browser.

## Delivered visual components

- `DependencyGanttTimeline` renders persisted operation start/finish intervals as a horizontal Gantt timeline.
- `WorkflowDependencyGraph` renders explicit predecessor/successor edges and keeps `FS`, `SS`, `FF`, `SF`, lag and partial-release percentage visible on every edge.
- Both components use semantic, accessible SVG with textual labels. Status is represented by text and SVG title information as well as colour.

They accept a presentation model populated later by the generated C# Planning OpenAPI client. Invalid dates and dependencies with a missing endpoint are deliberately omitted rather than fabricated.

## Required live proposal fields

The C# contract must provide planning-run ID, operation ID/label/stage, planned start/finish, display status, dependency IDs/type/lag, partial-release threshold, calendar revision, resource and warnings. The UI must show all warnings and cannot publish or recalculate locally.

## Interaction requirements after API integration

- selecting a Gantt bar highlights its graph node and opens the planning-run detail;
- selecting an edge exposes its type, lag, release threshold, source and audit reason;
- calendar non-working bands and capacity-reservation conflicts appear only from authoritative C# output;
- desktop keeps graph/Gantt scrollable; mobile shows the selected operation and dependency list before a wide chart;
- no relation is communicated by colour alone.

## Evidence

Model tests reject malformed intervals and missing endpoints. Render tests verify that both SVG views expose accessible names and visible relationship labels. These are independent from the production API; the live contract test remains a platform gate.

## Boundary

No route uses fake planning data and no current Doorstar `dependsOnId` field is reinterpreted as a full dependency graph. The components remain unmounted until the C# Planning proposal contract is published.
