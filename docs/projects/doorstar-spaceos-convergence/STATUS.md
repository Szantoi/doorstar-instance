# Doorstar SpaceOS Convergence — Status

**Frissítve:** 2026-07-21
**Epic:** EPIC-DOORSTAR-SPACEOS-CONVERGENCE  
**Állapot:** ACTIVE — DSCONV-00 runtime security gate blokkolt; DSCONV-01 mapping kész

| Milestone | Taskok | Kész | Blokkolt | Állapot |
|---|---:|---:|---:|---|
| D0 Baseline és mapping | 2 | 1 | 1 | mapping kész; DSCONV-00 runtime security human gate |
| D1 Contract és security | 3 | 0 | 3 | D0 + platform gate |
| D2 Instance extraction | 4 | 0 | 4 | platform contract gate |
| D3 Bundle, kézfogás és release | 5 | 0 | 5 | platform bundle + B2B conformance gate |

## Következő kiadható feladatok

1. `DSCONV-GATE-SECURITY` és `DSCONV-GATE-INSTANCE` — csak a pontos
   JoineryTech artifact-verziók és hash-ek átvétele után zárhatók.
2. `DSCONV-00` — a dokumentációs baseline kész; a futásidejű credential
   rotáció az emberi kapus végrehajtási terv szerint végezhető.

A `DSCONV-GATE-HANDSHAKE` és `DSCONV-09` dokumentált, de a JoineryTech `B2B-09`
publikált artifactjáig nem diszpécselhető.

Ezek párhuzamosan futhatnak, de ugyanazt a tudásindexet csak a DSCONV-00
módosíthatja.

## Külső blokkolók

- JoineryTech `STAB-RLS-PROOF`;
- JoineryTech `ERPSEP-02`, `ERPSEP-03`, `ERPSEP-06`, `ERPSEP-07`;
- JoineryTech `PROJECT-CORE-ADR`;
- JoineryTech `B2B-09` Collaboration conformance artifact;
- később `ERPSEP-08` és `ERPSEP-09`.

## Memento

A Doorstar-specifikus feladatok külön projektbe kerültek. Platform- vagy
ERP- vagy Collaboration-platform implementáció ebben a repositoryban nem
indulhat; a gate-ek csak publikált artifacttal oldhatók fel. A Doorstar a
kézfogás első fogyasztói pilotja, nem a protokoll tulajdonosa.
