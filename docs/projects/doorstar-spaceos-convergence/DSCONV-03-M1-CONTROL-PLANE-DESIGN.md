# DSCONV-03 M1 — Doorstar identity-authority control-plane terv

- **Állapot:** `PROPOSED — independent security, architecture and data review complete; no P0/P1 remains`
- **Dátum:** 2026-08-25
- **Kiindulás:** Doorstar M0 `6589fb7` (`codex/doorstar-identity-authority-m2m`)
- **Kapcsolt Kernel candidate:** `9fa208e` — nem release-artifact
- **Határ:** Doorstar `production-service` tiszta baseline-ja; nincs Keycloak-,
  Kernel-, VPS-, valós adatbázis- vagy deploy-művelet

## Cél

Az M1 olyan keskeny, tokenmentes control-plane alapot készít elő, amelyre az
M2 később valódi PKCE BFF-et és az M0 M2M resolver-hívást köthet. A cél nem a
mai teljes üzemi API átmeneti `X-Role`/`X-Station` védelmének „fél-átírása”,
hanem egy biztonságosan tesztelhető új belépési varrat.

Az első Doorstar próbaüzem egy **dedikált Doorstar instance** és pontosan egy
explicit Kernel tenant közötti kapcsolat. Ez deployment-szintű instance
izoláció, nem a meglévő 33 üzleti Prisma modell tenantizálása, és nem állít
magáról multi-tenant/RLS készültséget.

## Kötelező bemenetek és források

- [M0 M2M kliens](../../../src/production-service/src/services/identityAuthority/README.md):
  kizárólag `{ subject, tenantId }` resolver-bemenet, saját
  `client_credentials + private_key_jwt` géptoken.
- [M0–M4 próbaüzemi terv](DSCONV-03-IDENTITY-AUTHORITY-TRIAL-DESIGN.md):
  a tokenmentes evidence, az exact cutoff és a shared E2E stop-feltételek.
- ADR-061: tenant nem érkezhet hitelesítetlen headerből; az auth boundary
  által hitelesített identity az egyetlen forrás.
- ADR-062: a jövőbeli valódi többtenant-os üzleti adatokhoz
  `app.current_tenant_id`, `FORCE RLS`, nem-superuser szerep és valós
  PostgreSQL-bizonyíték szükséges. M1 ezt nem helyettesíti.

## Explicit nem-célok

- nincs humán bearer, access token, refresh token, authorization code vagy M2M
  token tárolása, naplózása vagy böngészőnek/legacy adapternek történő
  továbbítása. Az M0 memóriában tartott M2M bearerét kizárólag a fix
  Kernel resolver `Authorization` fejlécében szabad elküldeni;
- nincs `/api/tenant-access/authorize` fallback vagy legacy adapter átvétel;
- nincs `TenantMembership`, federált principal-binding, Office/Calc/Flow/Plant
  evidence vagy a korábbi 66 táblás RLS migráció extract;
- nincs változtatás a meglévő üzleti modelleken, `requester.ts`-en, a
  `X-Role`/`X-Station` UI-küldésen, a route-okon vagy OpenAPI-n;
- nincs saját szerep-, station- vagy consumer-választás a böngészőből;
- nincs hamis „login” vagy teszt-only bearer-exchange endpoint.

## Döntés: egy-instance tenant binding

Az M1 egy Doorstar adatbázisban egyetlen aktív, explicit tenant-bindinget
enged. A M2 által már signature-validated humán identity által adott `tenantId`
csak akkor használható, ha pontosan egyezik ezzel a bindinggel; query, cookie,
`X-*` header vagy böngésző-state nem választ tenantot.

Ez szándékosan kisebb, mint a teljes multi-tenant átállás:

| Kérdés | M1 döntés |
|---|---|
| Meglévő 33 üzleti tábla | változatlan, nem tenantolt |
| Első trial izolációja | dedikált instance DB + egy aktív Kernel tenant binding |
| RLS állítás | nincs; későbbi tenantizálási külön migration és nem-superuser PG proof kell |
| Humán auth | M2 PKCE/JWT-validáció, M1 csak a belső proof szerződését készíti elő |
| Kernel hívás | csak az M0 saját M2M service tokenével |

Ha a binding deaktiválódik vagy a belső proof tenantja eltér, a login fail-closed
és a hozzá tartozó sessionök visszavonódnak. Tenantváltás nem update: a trial
instance-et újra kell provisionálni vagy külön, auditált binding-change döntés
szükséges.

## Belső evidence szerződés

Az M2 humán token-ellenőrzése után *kizárólag szerveroldalon* képzett
`VerifiedHumanIdentityProof` értéket ad át az M0 resolver orchestrationnek:

```ts
{
  subject: string;
  tenantId: CanonicalLowercaseGuid;
  membershipVersion: bigint;
  projectionVersion: bigint;
  permissions: readonly CanonicalGrant[];
  enabledModules: readonly CanonicalModuleId[];
  tokenIssuedAt: CanonicalUtcInstant;
  tokenExpiresAt: Date;
}
```

Ez nem JWT és nem tartalmaz JWT-nyersanyagot. A `subject`, tenant, verziók,
grantok, `iat` és `exp` a signature-validated humán tokenből vagy a rögzített
platform identity-contractból származnak. Route-paraméter, cookie, query vagy
hitelesítetlen header ezek közül semmit sem írhat felül.

Az M0 `resolved` állapota csak akkor válik `ResolvedIdentityAuthorityEvidence`
értékké, ha egyszerre teljesül:

1. a binding aktív, és tenantja pontosan egyezik;
2. a proof és Kernel `subject`, tenant, membership- és projection-verziója
   pontosan egyezik;
3. a Kernel tenant- és membership státusza `active`;
4. `tokenIssuedAt >= acceptTokensIssuedAtOrAfter` nanoszekundumos összevetéssel;
5. a két rendezett, egyedi grant-lista pontosan egyezik;
6. van pontosan egy `joinerytech.door` grant-pár. Ebből csak
   `joinerytech.door.view`, `.edit` vagy `.admin` Doorstar capability képezhető;
   más modul grantja nem öröklődik át és nem jelent implicit admint.

Az M0 már szigorúan validálja a Kernel v1 tízmezős válaszát. A `consumerId`
nem válaszmező: azt a Kernel a hitelesített M2M service-JWT profiljából vezeti
le, ezért Doorstar proofban, sessionben vagy böngészőben nem szerepelhet.

## Állapotkimenetek

| Esemény | M1/M2 viselkedés |
|---|---|
| `resolved` + minden evidenciaegyezés | rövid, opaque session kiadható |
| Kernel 404, inaktív tenant/membership, tenant/subject/verzió/grant/cutoff eltérés | `denied`; session nem jön létre vagy visszavonódik; új belépés kell |
| 400/401/429/5xx, timeout, TLS/CA/redirect, hibás content type/JSON | `unavailable`; fail-closed, nincs fallback és nincs részleges session |
| M2M profil hibája vagy service-JWT elutasítása | `unavailable`; nem humán login hiba, de session nem adható ki |

`denied` és `unavailable` esethez csak redaktált, korrelációs azonosítós
operációs log tartozhat. Nyers subject, token, cookie, authorization header vagy
resolver-body nem kerül naplóba és nem lesz perzisztált „negatív evidence”.

## Javasolt M1 perzisztencia

Az alábbi három modell új, a jelenlegi üzleti gráftól független control-plane.
A Prisma név és a végső SQL migration külön reviewban pontosítandó; az itt
leírt invariánsok kötelezőek.

### 1. `DoorstarInstanceTenantBinding`

| Mező | Típus / szabály |
|---|---|
| `id` | saját technikai kulcs; singleton/aktív-binding invariant védi |
| `tenantId` | PostgreSQL `uuid`, input csak lowercase D-GUID lehet |
| `status` | `ACTIVE` vagy `DISABLED` |
| `bindingVersion` | `bigint`, kizárólag admin/provisioning auditáltan növelheti |
| `createdAt`, `disabledAt`, `disabledReason` | audit- és lifecycle mezők |

Az adatbázisban részleges unique index vagy egyenértékű singleton constraint
biztosítja, hogy legfeljebb egy `ACTIVE` binding legyen. A `tenantId` nem
származhat environmentből és az alkalmazás nem upsertelheti automatikusan.
Az SQL trigger `tenantId`-módosítást, valamint `DISABLED → ACTIVE` átmenetet
elutasít. Az egyetlen engedett lifecycle-változás az `ACTIVE → DISABLED`;
ennek ugyanabban a tranzakcióban növelnie kell a `bindingVersion`-t és vissza
kell vonnia minden még élő, hozzá tartozó sessiont.

### 2. `IdentityAuthorityEvidence`

Csak elfogadott `resolved` evidenciát tárol, append-only módon. A sor nem a
humán token helyettese; egy konkrét, szerveroldalon ellenőrzött login-döntés
összefoglalója.

| Mezőcsoport | Kötelező tartalom |
|---|---|
| Binding | `tenantBindingId` FK, a binding tenantjának és `bindingVersion`-jának exact snapshotja |
| Identity | `subject`; sem token, sem e-mailből kitalált identitás |
| Resolver-state | v1 schema-verzió, membership/projection `bigint`, kanonikus module és permission JSON-listák |
| Cutoff | wire érték + `epochSeconds bigint` + `nanoseconds int` (0–999 999 999) |
| Humán proof | token-issued-at wire + seconds/nanos és `tokenExpiresAt`; nincs JWT |
| Integritás | szerveroldali, kulcsverziózott HMAC-SHA-256 state-fingerprint; korrelációs azonosító |
| Audit | `createdAt`, immutable `evidenceVersion` |

`DateTime` önmagában nem helyettesítheti a cutoff vagy `iat` teljes pontosságát.
Az evidence grant-listája a Kernel response pontos, rendezett listája; a
Doorstar capability az ebből származtatott, szűk érték.

### 3. `DoorstarSession`

| Mezőcsoport | Kötelező tartalom |
|---|---|
| Cookie lookup | nem titkos session selector + legalább 256 bites véletlen verifier; a verifier kulcsverziózott HMAC-SHA-256-ja unique indexen |
| CSRF | külön legalább 256 bites véletlen token HMAC-SHA-256-ja és saját kulcsverziója; a nyers érték nem perzisztálható |
| Binding/evidence | `tenantBindingId`, `evidenceId`, `subject`, szűk Doorstar capability, verziósnapshot; kompozit FK garantálja, hogy az evidence ugyanahhoz a bindinghez tartozik |
| State integrity | a session authorization-mezőinek külön, kulcsverziózott HMAC-SHA-256 state-MAC-ja; a nyers authority-evidence nem pótolható a cookie-ból |
| Életciklus | `issuedAt`, `expiresAt`, `revokedAt`, `revokeReason`, `lastValidatedAt` |
| Kapcsolt szabály | `expiresAt = min(humán token exp, konfigurált rövid session maximum)` |

A böngészői session értéke `<session-selector>.<verifier>`: mindkét rész opaque,
de csak a legalább 256 bites verifier hitelesít. A session selector a DB-sor
kereső kulcsa, a verifier csak HMAC formában szerepel. A böngésző csak az opaque
HttpOnly/Secure/SameSite=Strict cookie-t láthatja. A DB-ben nincs access token,
refresh token, client assertion, M2M access token, privát kulcs, `jti`, `role`,
`station`, `consumerId` vagy authorization code.

Az M1 session tábla sem ad átjárást a jelenlegi üzleti API-hoz. A session query
csak az M2 identity boundaryban használható. A session valid predicate egyetlen
adatbázis-műveletben az `(evidenceId, tenantBindingId)` kompozit kapcsolaton
joinolja az evidence-et, majd megköveteli a nem visszavont, nem lejárt sessiont,
az `ACTIVE` bindinget és a session/evidence/binding `bindingVersion`
egyezését.

## Kötelező M2 cookie-, CSRF- és authority-frissesség szerződés

M1 nem állít be cookie-t, de az adatmodell csak a következő M2 szerződéshez
használható:

- a session-cookie neve `__Host-doorstar-session`; értéke a 256 bites opaque
  handle, és kötelező attribútumai: `Secure`, `HttpOnly`, `SameSite=Strict`,
  `Path=/`, valamint **nincs** `Domain` attribútum;
- a külön `__Host-doorstar-csrf` cookie ugyanilyen `Secure`/`SameSite=Strict`/
  `Path=/`, Domain nélküli, de nem `HttpOnly`, mert a same-origin kliens ebből
  küldi a `X-Doorstar-CSRF` fejlécet. A szerver csak HMAC-olt változatát tárolja;
- minden állapotmódosító BFF kérésnél pontosan egy session- és egy CSRF-cookie,
  egy egyező CSRF header, valamint a konfigurált kanonikus originre illeszkedő
  `Origin` kötelező. Hiányzó, duplikált vagy eltérő cookie/header/origin: 403;
- a cookie parser névduplikációt fail-closed elutasít. A request semmilyen
  `Authorization`, `X-Role`, `X-Station`, `X-Principal`, tenant-, station- vagy
  consumer-selector headerből nem képez identity contextet;
- a trialban **minden védett üzleti kérés előtt** új M0 resolver feloldás és
  exact proof/state összevetés kötelező. Nincs csendes authority-cache vagy
  grace window. Resolver unavailable esetén 503/fail-closed; a logout és a
  health endpoint nem minősül védett üzleti kérésnek.

Ez a per-request szabály szándékosan konzervatív. Későbbi bounded freshness
cache csak külön design, konfigurált szigorú felső korlát, új negatív tesztek és
security review után vezethető be.

## M2 legacy-header cutover manifest

M2 előtt egy forrásvezérelt route manifest minden `/api/production` route-ot
`legacy-only`, `bff-only` vagy `public-operational` kategóriába sorol. Egy trial
által érintett üzleti resource teljes route-csoportja atomikusan `bff-only`:
ugyanaz a mutation nem maradhat párhuzamos legacy headeres úton.

`bff-only` route-on az identity middleware még a handler előtt elutasítja az
`Authorization`, `X-Role`, `X-Station`, `X-Principal`, `X-Tenant-Id`, illetve
bármely tenant/station/consumer selector headert. Nem importálhatja vagy
hívhatja a `getRequester`, `hasRole`, `requireRole` vagy `requireManager`
legacy guardot. Hiányzó/hibás session nem eshet vissza header-alapú contextre:
401; capability-hiány: 403; resolver unavailable: 503. Ellentmondó headeres,
de egyébként valid session request is elutasított contract-sértés, nem „utolsó
érték nyer".

`legacy-only` route-ok az M2 trial resource-csoportján kívül átmenetileg
változatlanok maradnak, de nem kaphatnak M1 sessionből képzett role/station
értéket. `public-operational` csak health/readiness és más explicit, authority
nélküli route lehet. A manifest és az import/viselkedés tesztjei minden M2
route-hoz kötelezőek.

### DB-szintű invariánsok

- `IdentityAuthorityEvidence`-re a migration explicit `UPDATE`/`DELETE`-tiltó
  triggerét és `RESTRICT` hivatkozási szabályait hozza; a sor append-only, nem
  ORM-konvencióból „immutable”.
- `DoorstarSession.expiresAt > issuedAt`, a nanoszekundum `0..999999999`, a
  selector/verifier/CSRF/state HMAC-formátum, a hozzájuk tartozó key-version
  és az aktív-binding singleton mind DB constraint/index is.
- Binding deaktiválásakor a DB trigger tranzakciósan beállítja a függő sessionök
  `revokedAt`/`revokeReason` értékét; a végleges migration test ezt és a tiltott
  binding-módosításokat is bizonyítja.
- A `DoorstarSession` revoke DB-állapotgép: `BEFORE UPDATE` trigger csak
  `NULL → non-NULL` `revokedAt` átmenetet enged kötelező, immutable
  `revokeReason`-nel. Visszavont sor nem tehető újra aktívvá, a reason nem
  írható át; nem visszavont soron csak a monoton `lastValidatedAt` frissíthető
  ezen életciklusmezők mellett. A binding-disable trigger ugyanennek az
  engedélyezett revoke-átmenetnek megfelelően dolgozik.
- A migration a `DoorstarSession(evidenceId, tenantBindingId)` mezőt
  `IdentityAuthorityEvidence(id, tenantBindingId)` kompozit, `RESTRICT` FK-val
  köti; az evidence oldalon ezt explicit `UNIQUE(id, tenantBindingId)` teszi
  referálhatóvá. A session evidence-, subject-, capability-, bindingVersion-,
  issued- és expiry-mezői insert után immutable-ek; azonosítókat vagy
  authorityt nem lehet más binding/evidence sorra átfűzni.
- A bindinget az alkalmazáskód nem hozza létre vagy váltja át automatikusan.
  Tesztadat csak a későbbi, külön jóváhagyott local provisioningben jöhet létre.
- A control-plane migration önmagában nem hoz létre app-szerepet és nem kapcsol
  be RLS-t a meglévő vagy új táblákon. Egy jövőbeli multi-tenant/RLS slice-nak
  külön kell bevezetnie a nem-owner runtime szerepet és az ADR-062 teljes proofját.

### HMAC kulcs- és ellenőrzési szerződés

Minden evidence-state-, session-state-, session-verifier- és CSRF-MAC
**HMAC-SHA-256**. A kulcsot az
`IdentityAuthorityMacKeyProvider` kizárólag névvel és `keyVersion`-nel kérheti
le a deployment secret providerből; a nyers kulcs nem kerül configba, adatbázisba,
repositoryba, logba, környezeti példafájlba vagy böngészőbe. Tesztben csak
explicit dependency-injection adhat determinisztikus kulcsot.

A MAC input domain-separated és binárisan hossz-prefixelt: minden mező elé a
UTF-8 bytehossza, a számok elé kanonikus tizedes ASCII alak, a nyers verifier/
CSRF érték elé dekódolt bytehossz kerül. Az evidence domainje
`doorstar-identity-evidence-v1`, és sorrendben tartalmazza: binding azonosító,
bindingVersion, subject, schema/evidence verzió, membership/projection verzió,
rendezett module- és permission-listák, cutoff, humán `iat` és `exp` exact
értékei. A session verifier domainje `doorstar-session-verifier-v1`, a CSRF-é
`doorstar-session-csrf-v1`; mindkettőben a session selector, binding azonosító,
bindingVersion és a saját nyers érték szerepel. A külön
`doorstar-session-state-v1` MAC a session selector, binding azonosító/
bindingVersion, evidenceId, subject, capability, issuedAt és expiresAt
kanonikus értékeit fedi; ezért egy manipulált sor nem cserélhet
authority-evidence-et. JSON-serializáció, sima string összefűzés vagy nem
rendezett grantlista MAC-inputként tiltott.

Olvasáskor a row saját `keyVersion`-ével számított elvárt MAC-okat constant-time
összehasonlítás (`timingSafeEqual`) validál. Ismeretlen/state-, verifier- vagy
CSRF-MAC-eltérés → deny, az érintett session tranzakciós revoke-ja és redaktált
audit; nem keletkezhet fallback vagy új session. A rotáció csak az aktuális és
egy explicit, lejárati idővel rendelkező előző keyVersiont engedi. Az előző
ablak lejárta után a vele kiadott session az első használatkor revoke + új
bejelentkezés; rotációs pozitív és negatív teszt kötelező.

## Implementációs sorrend

1. **Pure domain előbb:** `evidence.ts` és `controlPlane.ts` tiszta, dependency
   nélküli típusokkal és negatív unit tesztekkel.
2. **Adatmodell:** Prisma schema + egy új, forward-only migration csak e három
   control-plane táblára. A 33 üzleti modellhez nem nyúl.
3. **Perzisztencia:** repository csak belső typed inputot fogad; minden
   immutability/unique/FK invariant DB-szinten is megjelenik.
4. **Cookie és middleware:** source-only session cookie és identity context;
   még nincs callback/login route és nem mountolható automatikusan.
5. **Migration proof:** új, eldobható PostgreSQL `prisma migrate deploy` teszt,
   nem a meglévő `db push`-ra épülő unit suite helyett.
6. **M2 külön slice:** PKCE, strict humán JWT-validáció, exact callback/redirect,
   CSRF/origin, M0 orchestration, route/OpenAPI és csak ekkor a legacy headeres
   útvonalak kontrollált kiváltása.

## M1 teszt- és minőségi kapu

- evidence assembly: subject/tenant/version/grant/cutoff minden eltérése deny;
- törtmásodperces és .NET teljes dátumtartományú cutoff összevetés;
- `resolved` nélkül, aktív binding nélkül vagy `joinerytech.door` grant nélkül
  nincs evidence/session;
- a binding `tenantId` immutable, `DISABLED → ACTIVE` tiltott, és `ACTIVE →
  DISABLED` ugyanabban a tranzakcióban revoke-olja az élő sessionöket;
- a session revoke egyszeri: revoke után minden un-revoke vagy
  `revokeReason`-átírás hibázik; az `(evidenceId, tenantBindingId)` kompozit
  kapcsolat nem enged cross-binding evidence-cserét;
- M2 contract teszt: `__Host` cookie-attribútumok, cookie-névduplikáció,
  CSRF/origin/header eltérés és resolver-unavailable mind fail-closed;
- minden védett üzleti kérés authority revalidációja kötelező; revoke,
  lifecycle-, version- vagy cutoff-változás az első következő kérésnél deny;
- HMAC-SHA-256 domain/key-version/preimage/constant-time/rotation teszt, és
  ismeretlen vagy hibás state-/verifier-/CSRF-MAC → revoke + deny; nyers kulcs
  repository/log/DB scanje üres;
- M2 route manifest: BFF-only route nem importál legacy requester guardot,
  session nélküli vagy ellentmondó authority-headeres kérés nem kap fallbacket,
  minden mutation capabilityje kizárólag current evidence-ből ered;
- nincs raw token a TypeScript DTO-kban, Prisma modellben, log eventben vagy
  HTTP-válaszban; statikus secret/header-redaction teszt;
- egy aktív binding, unique HMAC, evidence immutability és session revoke
  eldobható PostgreSQL `migrate deploy` + constraint/trigger smoke-ban;
- `prisma generate`, célzott Vitest, TypeScript build, OpenAPI drift gate és
  `git diff --check`;
- a teljes meglévő suite két baseline hibája (`planningInputPack` pin és RAG
  candidate validator) külön marad; M1 nem változtatja az artefactokat.

## M2/M3 előfeltételek, amelyeket M1 nem zár le

- a Kernel snapshot-parity forward-only reconciliation és reviewzott release
  attestation, beleértve a NodeAuth key-lifecycle és authority-reader/RLS
  korlátainak név szerinti release-bizonyítékát;
- test-only Keycloak service client a teljes `IdentityAuthorityServiceJwt`
  profillal, local CA/TLS-szel és tiltott claim-ek nélküli issued access tokennel;
- aktív Kernel tenant-state, membership és `doorstar-portal` consumer projection;
- PKCE human client, exact redirect URI és humán token identity-contract;
- külön emberi jóváhagyás az eldobható local Keycloak–Kernel–Doorstar stack
  indítása előtt.

## Stop feltételek

- bármely legacy human-token forward/storage út vagy migration beemelése;
- tenant, subject, grant, cutoff vagy session input böngészői authorityból;
- M1 késznek nevezése RLS, teljes legacy route-védelem vagy E2E nélkül;
- shared/VPS/production adatbázis, Keycloak vagy credential érintése;
- független security/architecture review nélküli implementation commit.

Ez a dokumentum kizárólag az M1 tervezési döntése. Még nem hoz létre táblát,
cookie-t, route-ot, sessiont vagy tesztkörnyezetet.
