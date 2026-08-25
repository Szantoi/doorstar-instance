# DSCONV-03 — M2B BFF session, PKCE és atomikus cutover terv

- **Állapot:** tervezett, source-only előkészítés; nem BFF-aktiválás
- **Dátum:** 2026-08-25
- **Előfeltétel:** M0 resolver source, M1A/B control-plane source, M2 logging
  redaction és M2A HTTP/route-manifest kapu

## Cél és határ

Az M2B a Doorstar első valódi, tokenmentes helyi sessionre épülő BFF-belépési
útjának teljes szerződését rögzíti. A BFF PKCE-vel hitelesít embert, a
hitelesített tokenből szerveroldali proofot képez, az M0 service klienssel újra
lekéri a Kernel authority-state-et, és csak exact egyezés után tárol
immutábilis evidence-et és rövid Doorstar-sessiont.

Ez a dokumentum nem aktiválja a rendszert. Nem érinti a futó app route-mountját,
az OpenAPI-t, legacy route-ot, frontendet, CORS-t, Keycloakot, Kernelt, VPS-t
vagy adatbázist. A későbbi mount kizárólag az itt rögzített előfeltételek
teljesülése után, egy külön atomikus cutover commitban történhet.

## Jelenlegi blokkolók

1. **Humán OIDC szerződés nincs Doorstarra release-pinnelve.** A pontos issuer,
   client ID, audience/azp, RS256/JWKS profil, redirect URI, callback-host és a
   native spaceos_tenants claim kiadása még nem Doorstar trial artifact. A régi
   KEYCLOAK_DOORSTAR_CONFIG.md ES256 + flat-claim mintája történeti dokumentum;
   nem implementációs authority. A profile-nak azt is explicit ki kell mondania,
   hogy a code exchange access_token + id_token választ ad-e, és pontosan hogyan
   kötjük nonce-szal a két token subjectjét.
2. **Kanonikus publikus host hiányzik.** A jelenlegi két Doorstar hostname
   __Host-* cookie-t nem tud megosztani. Belépés előtt az edge-nek egyetlen
   HTTPS canonical hostra kell redirectelnie, callback query logging nélkül.
   A majdani BFF raw-header boundary pontosan egy, config-derived Host értéket
   is megkövetel; X-Forwarded-Host, req.hostname vagy requestből képzett
   redirect URI nem authority.
3. **A M1B migration proof és a BFF runtime-principal preflight nem futott.**
   E nélkül sem control-plane adat, sem session repository, sem trial DB nem
   használható.
4. **A component-snapshot resource audit szerepmodellje legacy actorRole.**
   A szűk BFF view/edit/admin capability nem alakítható át implicit legacy
   szereppé. Native audit actor-szerződés vagy explicit üzleti mapping kell.
5. **Kernel snapshot/release attestation és a külön jóváhagyott disposable
   Keycloak–Kernel–Doorstar E2E hiányzik.**

Ezért az M2B első implementációs lépése csak tiszta domain- és adapter-port.
Nincs environmentből betöltött, automatikusan aktiváló BFF-konfiguráció.

## Szerződés és adatfolyam

    browser -- GET /auth/login --> BFF PKCE transaction
    browser <-- redirect (state, nonce, S256 challenge) -- Keycloak
    browser -- GET /auth/callback?code&state --> BFF
      strict ID-token nonce + human access-token validation (memory only)
      -> token-free verified proof
      -> M0 private_key_jwt resolver
      -> exact binding/proof/state comparison
      -> one transaction: immutable evidence + opaque session
    browser <-- __Host-doorstar-session + __Host-doorstar-csrf -- BFF

    protected BFF request
      -> M2A raw-header/cookie/CSRF/origin preflight
      -> session/evidence/binding MAC + lifecycle validation
      -> fresh M0 resolver call (no cache/grace)
      -> exact persisted-evidence/current-state comparison
      -> native BFF handler + narrow capability policy

A raw human access token, refresh token, authorization code, M2M bearer, client
assertion, private key, raw session verifier és raw CSRF value soha nem kerül
adatbázisba, logba, HTTP response bodyba, OpenAPI-ba, legacy handlerbe vagy a
Kernel resolver requestbe. Az M0 request változatlanul csak subject és tenantId
plusz a saját service Authorization header.

### Trusted proof és evidence határ

Az evidence.ts szándékosan nem exportál proof-mint vagy assembler construction
capabilityt. M2B ezt megtartja: a jövőbeli, egyetlen exportált
createDoorstarIdentityBoundary(...) high-level composition root ugyanebben az
evidence module-határban él, így használhatja a private mintet és assemblert,
de proofot, assembler factoryt vagy raw tokent nem ad ki. A boundary runtime
export/import tesztje külön rögzíti, hogy más bff modul nem importálhat
privileged mintelőt. A boundary lesz képes:

1. a strict human-token verifier eredményét fogadni;
2. az opaque M1 VerifiedHumanIdentityProofot belül képezni;
3. M0 resolver és M1 evidence assembler hívására;
4. az evidence/session atomikus repository-írására.

Express handler, teszt fixture, repository, böngésző input vagy caller-supplied
dependency nem mintelhet proofot. Per-request freshnesshez nem kell nyers human
JWT: az immutable evidence subject, tenant, verzió, grant, issue/expiry adatait
hasonlítjuk a friss resolver-state-hez. A session soha nem élhet tovább a
validált human token expirynál.

## PKCE tranzakció

A login tranzakció külön van a DoorstarSessiontől, rövid config-owned TTL-je
van, és callbackkor token exchange előtt atomi egyszeri claimet kap.

- Authorization request: pontosan response_type=code és code_challenge_method=S256.
- Egy 32 byte-os random transaction selector kerül a
  __Host-doorstar-oidc-tx HttpOnly; Secure; SameSite=Lax; Path=/ cookie-ba.
  A callback ezt is megköveteli; a cookie nincs Domain attribútummal.
- Az állapot, nonce és code_verifier nem kerül tartós memóriastore-ba, DB-be
  vagy cookie-ba. A szerver az authorization URL illetve a code exchange
  összeállításának rövid closure-local idejére természetesen előállítja őket,
  majd azonnal eldobja. A selector és az explicit transaction keyVersion alapján
  a deployment secret provider külön HMAC domainjeiből determinisztikusan
  származnak. Így a process restart nem teszi szükségessé nyers PKCE verifier
  perzisztálását.
- A jövőbeli DoorstarOidcTransaction sor csak selector, keyVersion, exact
  issuer/client/redirect snapshot, issued/expires/consumed lifecycle adatot,
  továbbá explicit stateMacKeyVersion és stateMac értéket tárol. A state MAC
  domain-separated, length-prefixed selector/keyVersion/config-snapshot/time
  preimage. A selector unique; a claim predicate atomikusan unconsumed és
  unexpired, a callback pedig a snapshotot a closure aktuális configjával
  exact összeveti. A state queryérték a szerver secret nélküli félnek nem
  képezhető.
- Callback raw queryből pontosan egy code és egy state kötelező. Duplicated
  keys, OAuth error keverése, malformed encoding, unknown/expired/replayed
  state vagy hiányzó OIDC cookie fail-closed.
- A callback előbb a selectorból visszaképzett state-et, state MAC-et és exact
  config snapshotot validálja. Csak ezután hívhat egyetlen
  claimMatching(selector, expectedStateMac, configDigest, now) compare-and-set
  repository műveletet, amely unconsumed + unexpired + exact state feltétellel
  állít lifecycle-t. Hibás callback soha nem égethet el pending login sort.
- A későbbi forward-only migration DB-szinten immutable-vé teszi a selector,
  derivation/state key version, profile snapshot, issued/expires és state MAC
  mezőket; csak a null -> consumed lifecycle átmenet engedett egyszer. A BFF
  runtime role ezt nem resetelheti vagy módosíthatja.
- Callback redirectje rögzített, config-owned belső út; nincs next, returnTo
  vagy host override. A válasz Cache-Control: no-store és
  Referrer-Policy: no-referrer.

Az edge-nek saját reviewed szabály kell callback query (code, state)
kizárására/redakciójára; az application Pino redaction nem védi az ingress
access logot.

## Human token és code-exchange szerződés

A nonce az OpenID Connect ID tokenhez tartozik; ezért a Doorstar profile csak
akkor aktiválható, ha egyetlen, explicit választ ad erre. A javasolt profile
public Authorization Code + S256 PKCE client, exact openid + product-scope,
és kötelező token-endpoint access_token **és** id_token válasz. Az ID token
nonce/issuer/audience/azp/time kötést ad, az access token hordozza az authority
projectiont; subject és issuer exact cross-check kötelező. Refresh tokenet a
profile nem kérhet vagy használhat.

A source-only profile factory pontosan egy config-owned product scope-ot fogad,
és ebből képezi a zárt `openid + productScope` authorization scope halmazt.
`offline_access` és minden további OIDC standard scope tiltott; így a PKCE
authorization request sem kérhet refresh tokent vagy rejtett extra scope-ot.

Mindkét validátor a platform native projection alakját csak exact,
release-pinnelt Doorstar profilon fogadja:

- csak RS256, trusted canonical HTTPS issuer és canonical JWKS endpoint; nincs
  none, symmetric/algorithm confusion, redirect, proxy vagy TLS-bypass;
- exact JOSE/payload type, issuer, audience set és azp; bounded kid/JWKS parser,
  böngésző input nem választhat issuert;
- strict exp, iat, nbf, nonce és clock-skew mindkét tokenen; az ID token
  nonce-a és az access/ID token subjectje exact;
- pontosan egy native spaceos_tenants entry csak tenant_id, permissions és
  enabled_modules mezővel, továbbá pozitív native integer
  spaceos_membership_version és spaceos_projection_version;
- flat/mixed tenant/module/permission claims, multi-tenant authority, duplicate
  JSON key, unsorted/unknown grant, wrong audience vagy hiányzó mező elutasítás.

A validated output nem JWT DTO, hanem opaque server-only claims capability.
Az M1 proof subjectje, tenantja, membership/projection verziója, grantjei,
tokenIssuedAt és tokenExpiresAt **kivétel nélkül az authority-bearing access
tokenből** származnak. Az ID token csak nonce + issuer/client/time companion;
nem adhat authority vagy cutoff/expiry forrást. Session expiry ezért az access
expiry, ID expiry és configured maximum exact minimuma. A raw tokenek
validálás után azonnal eldobandók. JWT header/payload és JWKS parsernek teljes mélységben
rejectálnia kell a duplicate JSON keyt; a jelenlegi csak root-szintet fedő
strict parser erre nem használható változtatás nélkül.

A humanOidcCodeExchangeClient külön, csak a boundary által hívható port:
fix canonical token endpoint, public-PKCE form, redirect:error, TLS/proxy
deny, teljes response-bodyra érvényes bounded shared deadline és strict token
response parser. A raw authorization code és a tokenek csak e port és a
validator közötti rövid memóriában élhetnek.

## Session és MAC szerződés

DoorstarSession opaque, DB-backed session marad:

- browser value pontosan selector.verifier; mindkét rész canonical base64url
  legalább 32 random byte-ból és pontosan egy separatorral;
- CSRF külön 32 byte-os opaque érték a non-HttpOnly
  __Host-doorstar-csrf cookie és X-Doorstar-CSRF header számára;
- session cookie pontosan Secure; HttpOnly; SameSite=Strict; Path=/, Domain
  nélkül; CSRF Secure; SameSite=Strict; Path=/, Domain nélkül és szándékosan
  nem HttpOnly;
- expiry = min(validated authority-bearing access exp, nonce-bound ID exp és
  configured short session maximum), exact UTC triple összevetéssel, nem
  JavaScript milliszekundum-kerekítéssel;
- evidence-state, session-verifier, session-CSRF, session-state, OIDC-state és
  OIDC derivation minden MAC-je explicit keyVersionös, domain-separated,
  length-prefixed binary HMAC-SHA-256;
- csak named deployment secret provider adhat ki kulcsot. A MAC service maga
  kényszeríti ki a current + pontosan egy explicit previous key ringet;
  providerben véletlenül bent maradó régebbi verzió sem valid. Unknown/expired
  previous key vagy MAC mismatch az érintett session static reasonnel
  revoke-olása és generic deny.

A comparison canonical format és equal-length ellenőrzés után constant time.
JSON vagy delimiter-concatenation nem MAC input.

A revokeReason zárt static union (például logout, mac_invalid,
authority_denied, key_expired, binding_disabled, session_expired), sosem
exception-message vagy remote response body. A lastValidatedAt database-owned
audit time, nem caller supplied cache input. Ezt egy következő forward-only
migrationnek DB-szinten is ki kell kényszerítenie.

## Repository és request-döntések

A jövőbeli typed repository az egyetlen Prisma/SQL consumer. Transactional
műveletei:

- OIDC login transaction begin/claim;
- accepted evidence és session együttes perzisztálása;
- egy joined session/evidence/binding snapshot betöltése selector alapján;
- monotonic validation-record vagy static-reason revoke.

Nem fogad human token, authorization code, role, station, consumer, tenant
selector vagy caller audit timestamp értéket. A runtime DB role kizárólag az
M1B-ben leírt, külön bizonyított least-privilege grantokat kapja.

Minden protected BFF requestnél előbb M2A preflight fut. Utána session/evidence/
binding MAC és lifecycle, majd cache/grace nélküli M0 revalidation következik.

| Feltétel | Döntés |
| --- | --- |
| Session/MAC/binding/evidence/expiry mismatch vagy resolver deny | Row megtalálásakor revoke; generic authentication denial |
| Resolver unavailable vagy transport contract failure | 503, nincs revoke és nincs fallback |
| Valid authority, de insufficient native capability | 403, nincs legacy role mapping |
| Valid current authority | Csak native BFF handler fut |

Nincs session-to-header, resolver-to-cache vagy BFF-to-legacy fallback.

## Route és atomikus cutover

Az auth/login, auth/callback és auth/logout nem public-operational és nem
normál protected business route. M2A manifestet explicit BFF auth mode-okkal és
matching topology entryvel kell bővíteni a mountkor. A special auth transport
contract külön tesztelendő, nem alkalmazható rá tévesen a protected resource
preflight. A bootstrap GET-eknél is strict raw Host guard szükséges, mert az
Origin csak mutation kérésnél áll rendelkezésre.

Az auth/logout kizárólag POST: exact raw Host, session cookie, CSRF cookie és
header, exact Origin és session-MAC validáció szükséges, CORS nélkül. Csak a
fresh resolver call alól explicit kivétel (a session megsemmisítéséhez) és az
azonos __Host attribútumokkal történő cookie-clear megengedett.

Az első resource candidate a **teljes négy-operation component-snapshot group**.
Csak egy commitban válhat bff-onlyvá: mind a négy native handler, exact
capability policy, native audit actor contract, frontend BFF client, OpenAPI/
security, manifest, runtime topology és no-legacy-guard negatív tesztek együtt.
Csak mutationt átállítani vagy alternative BFF pathot legacy header route mellett
mountolni tiltott.

| Operation | Jelölt capability | Állapot |
| --- | --- | --- |
| getComponentCalculatorProfiles | view | decision_required |
| listComponentSnapshots | view | decision_required |
| createComponentSnapshot | edit | decision_required |
| reviewComponentSnapshot | admin | decision_required |

Ez még nem policy: a jelenlegi create/review legacy szerepek nem vezethetők le
bizonyíthatóan a három capabilityből, és a ComponentSnapshot ma csak
createdByRole/reviewedByRole auditot tárol, principal-t nem. A future BFF write
előtt ezért audit-schema/service/OpenAPI döntés kötelező. A frontendhez külön
BFF fetch client kell credentials=same-origin és mutation CSRF headerrel; a
jelenlegi globális kliens tiltott X-Role/X-Station headereket küld.

A future mountban a jelenlegi global cors(...) és express.json(...) nem maradhat
BFF határ. Pino lehet global; az auth bootstrap router CORS/body parser nélkül,
a protected native BFF router preflight -> session/revalidation -> route JSON
parser sorrendben, a legacy API pedig scoped CORS/body parserrel működhet.
A runtime OpenAPI verifierhez külön BFF registry/topology kell.

## Source-only implementációs sorrend

1. bff/mac.ts: canonical codecs, HMAC service, mechanikusan korlátozott
   current+previous key ring és token-free test vectors.
2. bff/session.ts: opaque handle/CSRF parser-generator, pairwise-distinct
   credential validation, cookie plans, access+ID+maximum exact expiry és
   trusted session snapshot types.
3. bff/humanOidcProfile.ts: a teljes release-pinnelt statikus human OIDC
   profile factoryja és minden verifier-releváns mezőből képzett canonical
   SHA-256 fingerprint. A profile factory még nem runtime-config loader;
   kiadás-pinnelés továbbra is külön trial gate.
4. bff/pkceTransaction.ts: selectorből levezetett state/verifier/nonce,
   strict raw callback parser, start-before-redirect repository port, és CAS
   utáni closure-only secret callback. Nincs public decision-to-secret accessor.
5. bff/humanJwtVerifier.ts: strict profile parser/validator adapter teljes
   mélységű duplicate-JSON scannerrel; a nyers parser/JWK/claim pipeline
   module-local, ezért nem importálható megkerülési API. A
   bff/humanOidcCodeExchangeClient.ts külön bounded transport port. Mindet csak
   későbbi reviewed composition root konfigurálja.
6. bff/boundary.ts: closure-only proof/evidence/session orchestration és fresh
   resolver revalidation, csak in-memory fake-ekkel.
7. Külön reviewed migration/repository/route-cutover slice a M1B proof,
   runtime-principal preflight és exact human OIDC/canonical-host döntés után.

## Kötelező negatív evidence

- HMAC domain, length-prefix, key-version, current/previous rotation,
  constant-time mismatch;
- malformed/duplicate/replayed/expired PKCE state, nonce és callback query;
- alg=none, algorithm/key confusion, issuer/audience/azp/nonce/time/JWKS és
  native claim grammar hibák;
- raw token/code/key/verifier/CSRF hiánya DTO/DB-write-port/log/response scanből;
- session expiry minimum, MAC/state mismatch, binding disable, exact resolver
  drift, resolver unavailable 503 és no-cache proof;
- forbidden authority header és jövőbeli BFF handlerben getRequester/legacy
  guard absence;
- később mind a négy component-snapshot operation együtt manifest/topology/
  OpenAPI-ban.

## Stop feltételek

- Retired flat/ES256 Keycloak dokumentum Doorstar human profileként használata;
- raw bearer/code persistence, token Kernel felé továbbítása, session/header
  fallback vagy browser-selected authority;
- mount, cookie issuance, DB provisioning, Keycloak/Kernel call, CORS
  relaxáció, frontend login vagy legacy route reclassification ebben a
  source-only foundationben;
- route cutover mind a négy component-snapshot operation és native audit actor
  döntés nélkül;
- bármely production vagy disposable integration explicit emberi jóváhagyás
  előtt.
