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

_Az agent tölti ki._

## Átadási bizonyíték

_Platform contract verzió, migration, negative-path és RLS tesztek._
