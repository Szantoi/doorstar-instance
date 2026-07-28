# DSPLAN-03 — Shadow comparison and UAT

**Status:** pending

## Goal

Run C# Planning proposals against selected Doorstar legacy examples before
enabling any capacity reservation. Confirm expected differences caused by real
shift, holiday or capacity rules with Doorstar.

## Acceptance

- compatibility examples cover FS/SS/FF/SF, partial release, weekend, extra
  day and fixed-date scenarios;
- plan differences are classified and approved;
- cross-tenant and insufficient-capacity paths are tested;
- publication remains behind an explicit human release gate.
