# DSCONV-03 — JWT, tenant és station-policy bevezetése

- **Szerep:** backend/security, frontend consumer
- **Prioritás:** P0
- **Státusz:** pending (dependency-blocked)
- **Függőség:** DSCONV-02, DSCONV-GATE-SECURITY
- **Mutációs határ:** production-service auth/tenant/policy middleware,
  persistence isolation és frontend auth adapter
- **Tiltott scope:** Keycloak éles konfiguráció emberi kapu nélkül, platform
  hosting forkolása, workflow/domain redesign

## Cél

A kliens által küldött `X-Role`/`X-Station` többé ne legyen jogosultsági source
of truth. A backend hitelesített JWT-ből és szerveroldali membership/policy
adatból állapítsa meg a tenantot, szerepet, állomást és műveleti jogosultságot.

A Kernel identity-authority resolverének korlátozott, M2M-alapú technikai
próbaüzemi terve: [DSCONV-03-IDENTITY-AUTHORITY-TRIAL-DESIGN.md](DSCONV-03-IDENTITY-AUTHORITY-TRIAL-DESIGN.md).
Ez a terv nem oldja fel a DSCONV-02 vagy DSCONV-GATE-SECURITY függőséget.

## Megvalósítási lépések

1. Fogyaszd a platform gate-ben rögzített auth/tenant contractot.
2. Vezess be fail-closed JWT validationt és permission policy-ket.
3. A station membership szerveroldali, tenant-scoped adattá váljon.
4. Add hozzá a tenant kulcsot/migrációt minden szükséges aggregate-hez, vagy
   bizonyítsd a dedikált instance isolation alternatívát ADR-rel.
5. PostgreSQL RLS/query filter/interceptor defense in depth a platformmintával.
6. A frontend csak bearer tokent és nem hitelesítési UX-preferenciát küldhet.
7. Auditáld a tiltott és cross-tenant kísérleteket.

## Teszt- és bizonyítékterv

- nincs token → 401;
- rossz issuer/audience/signature → 401;
- valid user, hiányzó permission/station membership → 403;
- másik tenant id-je → 404/403, adat nem szivárog;
- DB-szintű nem-superuser RLS teszt;
- frontend build és auth-flow smoke.

## Elfogadási kritériumok

- [ ] `X-Role`/`X-Station` nem dönt authorizationről.
- [ ] Tenant kizárólag hitelesített szerveroldali contextből ered.
- [ ] Minden mutációhoz explicit permission/policy tartozik.
- [ ] Cross-tenant és station-spoof teszt zöld.
- [ ] Log tartalmaz correlation/tenant/user/module mezőt secret nélkül.

## Stop / eszkaláció

Éles identity provider, realm/client vagy credential változtatás emberi kapu.
A platform hostingot tilos lokálisan lemásolni vagy módosítani.

## Végrehajtási napló

### 2026-08-25 — identity-authority próbaüzemi tervezés

- A Doorstar `origin/main` tiszta baseline-ja még nem tartalmazza a tenant/BFF
  adatmodellt. A meglévő, vegyes munkafában levő authority adapter régi
  `/api/tenant-access/authorize` végpontot és tiltott humán bearer-forwardingot
  használ; ezért nem minősíthető próbaüzemi alapnak.
- Elkészült a külön M0–M4 sorrend, a tokenmentes evidence-határ és a Kernel v1
  resolver szigorú szerződése a
  [trial design](DSCONV-03-IDENTITY-AUTHORITY-TRIAL-DESIGN.md) dokumentumban.
- A dokumentum explicit rögzíti, hogy a Kernel feature ágának kontrollált
  rehearsal-e nem platform release-artifact, és a globális Kernel
  snapshot-parity NO-GO miatt shared E2E még nem indítható.
- A clean-base extraction vizsgálat kimondta, hogy a korábbi hét migrációs
  auth/BFF slice nem emelhető át: 35 hiányzó relációt és további tizenegy vegyes
  üzleti migrációt feltételez. Az M0 ezért source-only, default-off M2M kliens
  és unit-test; a keskeny control-plane/BFF foundation külön, új slice.
- Nem történt Keycloak-, VPS-, credential-, adatbázis- vagy deploy-művelet; a
  DSCONV-03 státusza továbbra is `pending (dependency-blocked)`.

### 2026-08-25 — M0 source-only kliens és bizonyíték

- A tiszta Doorstar worktree-ben elkészült a nem mountolt
  `identityAuthority` szolgáltatási kliens: all-or-nothing konfiguráció,
  `client_credentials + private_key_jwt` tokenkérés, fix Kernel resolver-út,
  szigorú JSON/cutoff/grant parser és fail-closed hibaosztályok. A production
  factory nem fogad caller-adott transport vagy security override-ot.
- Az M0 nem változtatott `app.ts`-t, Express route-ot, Prisma sémát/migrációt,
  OpenAPI-t, `.env`-et, package-et vagy lockfile-t; jelenleg semmilyen futó
  Doorstar útvonal nem hívja a klienst.
- Fókuszált unit kapu: 3 fájl, **48/48** teszt PASS. TypeScript build PASS;
  OpenAPI ellenőrzés PASS (`3.1.0`, 85 művelet, teljes route coverage);
  `git diff --check` PASS.
- A teljes unit suite jelenleg **122/124**: két változatlan baseline hiba marad
  (`planningInputPack` fixture-SHA pin és `pythonImportTools` RAG dry-run
  validator drift). Ezek nem az M0 regressziói, ezért külön artifact/RAG
  tulajdonosi döntést igényelnek.
- Két független review M0-ra P0/P1 hibát nem talált. Nem történt Keycloak-,
  VPS-, credential-, adatbázis- vagy deploy-művelet; shared próbaüzem továbbra
  nem indítható az M1–M3 és Kernel release-gate-ek előtt.

### 2026-08-25 — M1 control-plane terv (végső review lezárva)

- Elkészült a tiszta, külön M1 döntési dokumentum: egy dedikált Doorstar
  instance egy aktív Kernel tenant bindinggel, tokenmentes resolver-evidence és
  opaque session alap. A teljes legacy üzleti gráf, RLS-migráció és headeres UI
  nem része ennek a slice-nak.
- A terv explicit tiltja a humán/M2M token perzisztálását, naplózását vagy
  böngészőnek/legacy adapternek történő továbbítását, a legacy authority
  adapter extractját, valamint a böngészői tenant/role/station/consumer
  választást. Az M0 memóriában tartott M2M bearerét kizárólag a fix Kernel
  resolver `Authorization` fejlécében küldheti. A perzisztencia csak resolved
  evidence-et fogad.
- A security-, architektúra- és adatmodell-review után P0/P1 nem maradt. A terv
  kötelezővé teszi a minden védett kérés előtti resolver revalidációt, a
  binding disable tranzakciós session-revoke-ját, az egyszeri DB revoke
  állapotgépet, a binding-evidence kompozit FK-t, valamint a `__Host`
  cookie/CSRF/origin/duplicate-cookie fail-closed szerződését.
- Még nincs Prisma schema, migration, cookie, BFF route vagy konfiguráció;
  Keycloak-, Kernel-, DB-, VPS- és deploy-művelet nem történt. M1 kód tiszta,
  külön implementation slice-on indulhat.

## Átadási bizonyíték

_Platform contract verzió, migration, negative-path és RLS tesztek._
