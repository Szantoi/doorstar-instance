# PLATFORM VÁLASZ — EPIC-SPACEOS-PRODUCTION-PLANNING handoff

**Feladó:** JoineryTech platform (root) · **Dátum:** 2026-07-27
**Címzett:** Doorstar instance (doorstar-production-planning)
**Hivatkozás:** PLATFORM_HANDOFF_EPIC.md (ugyanebben a mappában)

## Döntés: ELFOGADVA

A Production Planning modul platform-oldali megépítését átvesszük. A platform
repóban bekötve: **EPIC-PRODUCTION-PLANNING-2026Q3** (EPICS.yaml), első fázis
kiírva. A Doorstar-repó forrását platform-task nem módosítja — az átadás
kizárólag publikált kontraktussal történik, pontosan a handoff „Gate" szakasza
szerint.

## Ami már megvan, és amire építünk (a gate-hez releváns)

- **ADR-067 ACCEPTED (2026-07-27):** aláírt modul-katalógus + életciklus,
  registry = GitHub Packages, trust root = TUF-szerű root+intermediate modell,
  entitlement = Kernel-mező. A kért **package compatibility manifest +
  version/hash** publikáció ebben a rezsimben fog megtörténni (gépi validált
  manifest-schema már létezik: docs/knowledge/contracts/spaceos-module-v1.schema.json).
- **ADR-066 ACCEPTED (2026-07-25):** semleges referenciatípusok
  (SpaceOS.Modules.Erp.References) + kanonikus Order/Quote/Customer a CRM-ben
  (ERPSEP-04, külön repóban épül). A Planning a rendelés-fogalmat típusos
  referencián keresztül éri majd el, nem duplikálja.
- **RLS-bizonyíték rezsim:** mind a 7 ERP-modulon nem-superuser FORCE RLS
  proof fut (megosztott RlsFixtures, raw-SQL szintű assertek) — a kért
  **tenant/RLS proof** ennek a mintának a kiterjesztése lesz a Planning
  modulra; az élő worker-szerepek hardening-je (NOBYPASSRLS + szűk SECURITY
  DEFINER) döntött irány, folyamatban.

## Ütemterv (fázisok, a platform bevált gyártósorával)

1. **PLAN-01 — capability-boundary audit (read-only, MOST indul):** mi létezik
   már a platformon (Production.ProductionJob/WorkflowStep, cutting-ütemezés,
   Kernel FlowEpic/StageChain, inventory foglalások), mi a helyes ownership és
   namespace (spaceos.planning vs joinerytech.planning — a finite-capacity mag
   iparágsemleges, a product/component/finish minősítők iparágiak), és tételes
   gap-lista a ti hat fogyasztói követelményetek ellen.
2. **PLAN-02 — ADR:** ütemezés-domain szerződés (FS/SS/FF/SF függőségek,
   erőforrás-naptárak, részleges release, fix-dátum override + extra napok,
   proposal / shadow-összehasonlítás / explicit publikáció szemantika,
   plan-revíziók, audit-események). Elfogadás: Gábor.
3. **PLAN-03+ — implementáció:** OpenAPI-first, JWT tenant-feloldás +
   policy-check a közös hosting-mintával, PostgreSQL RLS-baseline, verziózott
   standard-import.
4. **Gate-publikáció:** manifest + Planning OpenAPI + tenant/RLS proof +
   pontos verzió/hash a GitHub Packages-en → ekkor indulhat nálatok a
   DSPLAN-02, forrás-másolás nélkül.

## Amit a Doorstartól kérünk (bemenetek — fixture/doksi formában, nem forráskód)

1. **A legacy képlet mint futtatható teszt-baseline:** bemenet→elvárt kimenet
   vektorok (elapsed duration + labour demand külön), néhány szélsőséges
   esettel (extra napok, fix dátum, részleges release).
2. **Verziózott standard-minták** product/component/finish minősítőkkel
   (2-3 valós, anonimizálható példa + egy verzióváltás-példa).
3. **Naptár/műszak-példák** (üzemi naptár, túlterhelés-eset, amit az
   overload-nézetben látni akartok).
4. **Nevesített kontakt** a kontraktus-draftok review-jára (az OpenAPI-t
   draft-ként előbb megkapjátok, mint a publikált gate-et).

## Időzítés

A sáv a futó platform-stabilitási és warehouse-zárási kör után nyílik; a
pontos priorizálás Gábor döntése. A PLAN-01 audit read-only, ezért már most
elindult — az eredménye (gap-lista + ownership-javaslat) lesz az első
visszajelzésünk felétek.

— JoineryTech platform root

---

## Kiegészítés (2026-07-27, platform root) — a Doorstar-oldali olvasat VISSZAIGAZOLVA

A termékesítési dokumentációra adott pontosításaitok helyesek, és a platform
tervezési anyagaiba kötelező keretként átvezettük (PLAN-01 audit-keret,
PLAN-02 scope-bővítés, world-gating task):

1. **A Planning felület világ/kompozíció, nem maga a modul** — egyetértünk;
   a PLAN-01 a világ-összerakást és a mögöttes modul(oka)t külön térképezi.
2. **JWT `enabled_modules` = UI-hint, nem jogosultsági forrás** — pontosan így
   kezeljük: a portál-oldali világ-szűrés terméknézet (mit látsz), a
   kikényszerítés a szerver-oldalé (endpoint-authz + RLS + Kernel
   entitled/enabled). Ezt a world-gating task doksijában is explicitté tettük.
3. **`spaceos.planning` csak teljesen iparágsemleges magra** — a faipari
   standardok, a Doorstar-import és az instance-adapter `joinerytech.*` /
   `doorstar.*` határon marad. A pontos vágás a PLAN-01 audit kimenete.
4. **PLAN-02 ADR scope-ja bővült:** a tervezési domain MELLETT a termékcsomag
   is döntési tárgy — modulazonosító(k) + függőségek, entitlement,
   world→module összerakás, kiadási manifest, Doorstar instance-adapter határa.
5. **Fogyasztási felület:** publikált frontend/API kontraktus + manifest +
   verzió + hash — forrás-másolás nincs, ahogy írtátok.

A 4 kért bemenet (legacy-képlet vektorok, standard-minták, naptár-példák,
nevesített reviewer) továbbra is a leggyorsabb út az első OpenAPI-drafthoz.
