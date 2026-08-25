# DSCONV-03 M2B — profile-bound OIDC code-exchange source port

**Állapot:** source-only elkészült; nincs HTTP-hívás, route-mount, cookie,
Keycloak-, Kernel- vagy adatbázis-művelet.

## Cél és határ

A `humanOidcCodeExchangePort.ts` a PKCE callback sikeres, egyetlen CAS claimje
után rövid ideig létező `authorizationCode` + `codeVerifier` + `nonce` érték és
egy későbbi, release-pinnelt token-endpoint adapter közötti szűk határ. Nem
OAuth kliens és nem BFF composition root.

Két public factory/operation van:

```ts
createDoorstarHumanOidcCodeExchangeSource({ profile, loader })
exchangeDoorstarHumanOidcCodeAndConsume(source, claimedDelivery, onTokens)
```

A factory egy factory-issued teljes `DoorstarHumanOidcProfile` capabilityt és
egy exact `{ exchange }` loader alakot fogad. Az opaque source egy `WeakMap`-
ben tárolja a capabilityt és ebből készített immutable kötést:

```text
releaseId, issuer, tokenEndpoint, clientId, redirectUri, profileDigest
```

Browser, callback query vagy hívó nem választhat issuer-t, token endpointot,
clientet, redirect URI-t, grantet vagy byte-korlátot.

## Canonical loader-handoff

A loader kizárólag ezt a frozen kérést kapja:

```ts
{
  releaseId, issuer, tokenEndpoint, clientId, redirectUri, profileDigest,
  grantType: "authorization_code",
  authorizationCode,
  codeVerifier,
  signal,
  maximumResponseBytes: 64 * 1024,
}
```

A `nonce`, `state`, `scope`, refresh token, client secret/assertion, Cookie és
Authorization header nincs a port inputján. A loader kimenete itt tudatosan
`unknown`; csak a strict, exact own-data `{ accessToken, idToken }` projection
fogadható el. Mindkét érték korlátos compact-JWS alakú string. Ez nem a végső
HTTP/JSON szerződés: a későbbi adapternek a teljes upstream választ bounded,
duplicate-key-safe parserrel kell feldolgoznia, majd ebből adhatja át ezt a
kétmezős projectiont. Refresh-token vagy extra mező nem szivároghat át.

Egy hívás pontosan egyszer indítja a loadert. A teljes kísérlet 2 másodperces
`AbortController` + `Promise.race` határidőt kap. Timeout, loader throw vagy
hibás kimenet után nincs retry, mert az authorization code addigra esetleg már
felhasználódott. A jel a sikeres befejezés után is abortált lesz, így a loader
nem tarthat vissza élő I/O-kapcsolatot.

## PKCE és token-átadási invariánsok

Az operation második inputja nem strukturális secret-objektum, hanem csak a
PKCE boundary által sikeres CAS után adott opaque, one-use `claimedDelivery`.
A port a `pkceTransaction` guarded consumerén keresztül fogyasztja el. A
`WeakMap`-állapot a secretet még a consumer indulása előtt lezárja, ezért
ugyanazt a deliveryt két párhuzamos exchange sem használhatja: pontosan egy
loader-hívás indulhat. A boundary a megkezdett consumption promise-át akkor is
megvárja, ha a hívó hibásan fire-and-forget módon indította.

A delivery belsejében lévő input az alábbi exact own-data snapshot:

- a code nem üres, 4 KiB alatt van és whitespace/control karaktertől mentes;
- a verifier és nonce canonical, pontosan 32 byte-os base64url secret;
- a teljes callback-profile snapshot exact egyezik a source factory-issued
  profile capabilityjével.

Eltérő profile, extra/malformed mező, idegen/replay delivery vagy idegen source
esetén a loader nem fut. Az eredmény csak statikus, tokenmentes `accepted` vagy
`unavailable` döntés.

A tokenek nem return value-k. Az `onTokens` callback egy one-use deliveryt kap,
amely a következőket csak egy `consume` hívásban mutatja meg:

```ts
{ accessToken, idToken, expectedNonce, claimedProfile }
```

A port az `onTokens` visszatérése után megvárja a megkezdett `consume`
completionját is. Ezért egy fire-and-forget token-validáló consumer nem adhat
korai `accepted` eredményt; consumer-hiba statikus
`doorstar_oidc_code_exchange_delivery_failed`, és a delivery promise-a sem
utasítódik el kezeletlenül. Ha az `onTokens` callback fogyasztást indít, majd
hibával tér vissza, a port akkor is kivárja a megkezdett consumptiont, majd
statikus `delivery_failed` eredménnyel zár; nincs háttérben maradó token-oldali
mellékhatás.

`accepted` itt kizárólag azt bizonyítja, hogy a trusted callback sikeresen
elfogyasztotta a deliveryt. Nem jelenti, hogy JWT-verifikáció, M0 resolver,
evidence-írás vagy session-kiadás megtörtént. A jövőbeli privát composition
rootnak a deliveryt közvetlenül a strict verifierbe kell továbbadnia, majd csak
elfogadott, tokenmentes facts után képezhet evidence-et és sessiont.

## Tudatosan nyitva hagyott adapter-szerződés

A valódi token-endpoint adapter csak az alábbi, release-pinnelt humán OIDC
artifact után épülhet meg:

- public/confidential client és az exact client-auth mód;
- canonical `POST` form és tiltott mezők;
- success/error HTTP státusz, content type és strict JSON grammar;
- refresh-token policy;
- redirect/proxy/TLS tiltás, streaming 64 KiB cap és query-log redakció.

Ezért ez a checkpoint nem indít próbaüzemet. Az M1B/M2B disposable migration
proof, runtime DB-principal preflight, canonical edge `/auth/*` proxy és
callback-query redakció, Kernel release-attestáció, privát evidence/session
composition, native audit actor, atomikus első BFF resource-cutover és külön
jóváhagyott izolált E2E továbbra is kötelező.

## Bizonyíték

Az `identityAuthorityBffHumanOidcCodeExchangePort.unit.test.ts` ellenőrzi az
exact loader requestet, nonce-mentességet, profile/delivery fail-closed
viselkedést, ugyanazon CAS delivery párhuzamos újrahasználatának tiltását,
malformed/extra/oversized tokenpár elutasítását, timeout+abort+no-retry szabályt,
one-use deliveryt és a szűk runtime/import felületet.
