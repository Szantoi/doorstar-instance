# DSCONV-03 — Identity Authority M2M próbaüzemi terv

- **Státusz:** tervezett; a `DSCONV-03` és a platform security gate státuszát
  nem módosítja
- **Határ:** Doorstar fogyasztóoldali BFF és adapter; platform hosting vagy
  Keycloak éles konfiguráció nem része
- **Cél:** a Doorstar által már hitelesített humán felhasználó tenantjogosultságát
  a SpaceOS Kernel kanonikus identity-authority szolgáltatásától kérje le úgy,
  hogy a humán JWT soha nem hagyja el a Doorstar BFF-et

## Kiinduló szerződés és státusz

A kontrollált integrációs szerződés a Kernel
`codex/kernel-identity-authority` ágának `9fa208e` commitjára épül. Ez a commit
lokális, eldobható PostgreSQL rehearsal bizonyítékkal rendelkezik, de még nincs
beolvasztva a Kernel `develop` ágába, ezért **nem** platform release-artifact és
nem zárja a `DSCONV-GATE-SECURITY` kaput.

A shared/end-to-end próbaüzem jelenleg a Kernel globális EF snapshot-parity
NO-GO miatt sem indítható: a kanonikus Npgsql modell és az
`AppDbContextModelSnapshot` eltér. Ezt külön, forward-only reconciliation
migrationnel kell rendezni; Doorstar ezt nem javíthatja a saját repositoryjában.

## Biztonsági modell

1. A böngésző a Doorstar BFF-fel PKCE alapú humán bejelentkezést végez.
2. A BFF lokálisan validálja a humán tokent, majd a már validált claim-ekből
   rövid életű, tokenmentes bizonyítékot képez.
3. A BFF/adapter a saját, nem böngészős `doorstar-identity-authority` M2M
   kliensével `client_credentials + private_key_jwt` tokenkérést végez.
4. Kizárólag ezzel a szolgáltatási tokennel hívja a Kernel resolverét.
5. A Kernel válaszát az adapter a helyi bizonyítékhoz köti; csak egyezés után
   ad ki vagy frissít Doorstar-sessiont.

Az M0 kliens nem tárol humán tokent. A későbbi control-plane/BFF szelet sem
perzisztálhat nyers humán access tokent a resolverhez: a már létező legacy
sessionöket érvényteleníteni kell, és új belépést kell kérni. A feloldó kliens
request típusában nyers JWT mező nem szerepelhet, és a Kernel felé sem headerben,
sem bodyban, sem logban nem kerülhet humán token.

### Tokenmentes bizonyíték

Az adapter bemenetének minimuma:

```ts
{
  subject: string;
  tenantId: string;
  requiredLevel: string;
  membershipVersion: number;
  projectionVersion: number;
  permissions: string[];
  enabledModules: string[];
  tokenIssuedAt: CanonicalUtcInstant;
}
```

Ezt kizárólag a már signature-validated Doorstar auth context képezheti. A
böngésző vagy route-paraméter nem írhatja felül. `CanonicalUtcInstant` csak
UTC `Z` alakú, a másodperc tört részét megőrző, nem kerekített időpont lehet;
a resolver cutoffjával `tokenIssuedAt >= acceptTokensIssuedAtOrAfter` pontos
összevetés szükséges. A szerveroldali subject→tenant mapping és az engedett
Doorstar grant-párok explicit allowlistből jönnek. Bármely membership- vagy
projection-version eltérés deny + új bejelentkezés, nem „legközelebbi” egyezés.

## Kernel resolver-szerződés

Az adapter egyetlen Kernel útvonalat használhat:

```http
POST /api/internal/identity-authority/resolve
Authorization: Bearer <doorstar-identity-authority M2M token>
Content-Type: application/json

{"subject":"<subject>","tenantId":"<lowercase-d-guid>"}
```

### Doorstar → Keycloak client assertion

Ez nem azonos a Kernelnek küldött access tokennel. A Doorstar által aláírt
`private_key_jwt` assertion RS256, `typ=JWT` headerrel, egyedi `jti`-vel,
szűk `nbf`/`exp` időablakkal és pontosan a konfigurált Keycloak token-endpointot
célzó `aud` claimmel készül. A tokenkérés pontosan `client_credentials` grantet,
ezt az assertiont és az `identity-authority.resolve` scope-ot tartalmazza.

### Keycloak → Kernel service access token

Az issued access token (nem a client assertion) elvárt profilja:

| Tétel | Követelmény |
|---|---|
| Grant | `client_credentials` |
| Client authentication | a fenti `private_key_jwt`, RS256 assertion |
| JWT header / payload type | `typ=JWT` / `typ=Bearer` |
| `aud` | pontosan egy: `kernel-identity-authority` |
| `azp` | `doorstar-identity-authority` |
| `sub` | `service-account-doorstar-identity-authority` |
| Scope | `identity-authority.resolve` |
| Élettartam | legfeljebb 300 másodperc |
| Issuer/JWKS | pontos, HTTPS kanonikus origin |

Tilos a tokenben a `tid`, `spaceos_tenants`, bármely `consumer*` selector vagy
nem kanonikus scope. A trial realm ezt a tiltott-claim listát is bizonyíthatóan
érvényesíti.

A válasz parsernek egyszerre és pontosan kell validálnia a következő mezőket:
`schemaVersion`, `subject`, `tenantId`, `tenantStatus`, `membershipStatus`,
`membershipVersion`, `projectionVersion`, `acceptTokensIssuedAtOrAfter`,
`permissions`, `enabledModules`.

Elfogadáskor kötelező:

- `schemaVersion === "spaceos.online-identity-authority/v1"`;
- subject és kanonikus lowercase GUID tenant egyezik a helyi bizonyítékkal;
- mindkét státusz `active`;
- a két verzió safe integer és pontosan egyezik a helyi bizonyítékkal;
- a permission/module listák kanonikus, duplikációmentes sorrendben egyeznek;
- minden module/permission pár a `spaceos.online-identity-authority/v1`
  publikus, verziópinelt grant-grammatikájában szerepel; ismeretlen grant
  szerződéssértés, nem bővülő implicit jogosultság;
- a cutoff kanonikus, törtmásodperc-pontos UTC időpont és nem enged régebbi
  humán tokent.

`404` authorization-denied eredmény. `400`, `401`, `5xx`, timeout, redirect,
túl nagy vagy hibás JSON, illetve szerződéssértő válasz availability-hiba:
fail-closed, session-kiadás nélkül. Legacy `/api/tenant-access/authorize` útvonal
és fallback nem maradhat.

## Megvalósítási szakaszok

### M0 — source-only M2M adapter

A jelenlegi Doorstar fő munkafából a tenant/RLS/BFF foundation nem emelhető át
tiszta M0-ként: a hét jelölt migráció 35, `origin/main`-ben nem létező relációt
és további tizenegy vegyes üzleti migrációt feltételez. Fájlonkénti extraction,
legacy adapter-átvétel és production compose használata tiltott.

Ezért az M0 a tiszta `origin/main`-re épülő, alapból nem mountolt és nem
konfiguráció-aktivált source-only kliens:

- Node beépített `crypto` és `fetch` használatával készülő service-token broker;
- szigorú client assertion, token endpoint és resolver request/response parser;
- csak belső `{ subject, tenantId }` bemenet; humán bearer paraméter nincs;
- nincs Express route, Prisma, BFF, `app.ts`, OpenAPI, `.env` vagy package/lock
  módosítás;
- külön unit teszt a token-formra, a fix resolver-útra és minden fail-closed
  hibakategóriára.

### M0 megvalósított határ (2026-08-25)

Az implementáció kizárólag a
`src/production-service/src/services/identityAuthority/` könyvtárban és a hozzá
tartozó három unit tesztfájlban van. A komponens használati és konfigurációs
határa a helyi [README](../../../src/production-service/src/services/identityAuthority/README.md)-ben
is rögzített. A négy konfigurációs kulcs:
`SPACEOS_IDENTITY_AUTHORITY_ISSUER`,
`SPACEOS_IDENTITY_AUTHORITY_KERNEL_ORIGIN`,
`SPACEOS_IDENTITY_AUTHORITY_PRIVATE_KEY_PATH` és
`SPACEOS_IDENTITY_AUTHORITY_PRIVATE_KEY_KID`. Mind a négy üresen hagyva
`disabled`; részleges vagy nem kanonikus HTTPS konfiguráció hiba, nem fallback.

A production factory saját process-transportot használ, a külön exportált
függőség-injektálás csak unit-test seam. Az enabled kliens a konfigurációt
újraérvényesíti és befagyasztja a privát kulcs beolvasása előtt; tiltott TLS- és
proxy-környezetben fail-closed. Natív Node `crypto`-val kizárólag legalább
2048-bites RS256 kulccsal ír `private_key_jwt` assertiont. A két másodperces
közös határidő a token- és a resolver-válasz body-jának olvasására is él.
Ez továbbra sem alkalmazás-integráció: nincs route, BFF wiring, Keycloak-kérés,
adatbázis-migráció vagy runtime-konfiguráció.

### M1 — új, keskeny control-plane foundation

Külön tervezett és reviewzott slice hozza létre a szükséges Doorstar-oldali
evidence/session adatmodellt és BFF határt. Nem használja újra a 66 táblás
legacy RLS migrációt. Elfogadásához eldobható PostgreSQL-en `prisma migrate
deploy`, a friss schema, RLS/tenant negatív smoke és a raw access-token
perzisztencia megszüntetése szükséges.

### M2 — BFF, route és helyi ellenőrzési kapu

Kötelező bizonyíték:

- private-key assertion header/payload/form unit teszt;
- token nem kerül browserválaszba vagy naplóba;
- Kernelhez kizárólag M2M bearer jut;
- resolver 200, 404, 400/401/429/5xx, timeout, TLS/CA hiba, redirect,
  body-limit, hibás content type és malformed/extra/duplikált JSON negatív tesztek;
- stale/revoked humán token, hibás tenant, nem engedett grant-set és
  projection-verzió eltérés tesztek;
- `prisma generate`, TypeScript build, fókuszált Vitest és OpenAPI drift gate.

### M3 — eldobható lokális integráció

Csak M0–M2 zöld, a Kernel snapshot-parity feloldott, a Kernel release
attestálható, és külön emberi jóváhagyás után. A provisioning idempotens,
test-only tervének előbb bizonyítania kell a teljes
`IdentityAuthorityServiceJwt` profilt, a deny-all alapról induló Kernel
identity registryt, az aktív tenantot és membershipet, a
`doorstar-portal` consumer projectiont, továbbá a NodeAuth key-lifecycle és
authority-reader/RLS korlátait. Külön, nem perzisztens stack szükséges: local
CA/TLS, friss Keycloak realm, RS256 kulcsok, két demó tenant és semmilyen
production volume, port vagy credential újrahasználata nélkül. A meglévő
`docker-compose.yml` `doorstar-production-db` szolgáltatása erre tiltott.

### M4 — E2E bizonyíték és takarítás

Két tenantos PKCE + M2M resolver próba: happy path, hibás géptoken,
deaktiválás/revoke, rossz tenant, stale humán token és kulcsrotáció. A futás után
a realm, konténerek, eldobható adatbázis és test-kulcsok takarítása, majd a
parancsok és eredmények tasklogba rögzítése kötelező.

## Stop feltételek

- nincs tiszta, source-only M0 kliens- és unit-test bizonyíték;
- nincs külön reviewzott M1 control-plane/BFF alap;
- a Kernel resolver vagy snapshot-parity gate nincs reviewzott release-szinten;
- nem HTTPS vagy nem kanonikus issuer/JWKS;
- production Keycloak, Doorstar VPS, persistent volume vagy valódi ügyféladat
  érintése külön emberi jóváhagyás nélkül.

E dokumentum tervezési és ellenőrzési keret; nem igazolja a DSCONV-03 vagy a
DSCONV-GATE-SECURITY teljesítését.
