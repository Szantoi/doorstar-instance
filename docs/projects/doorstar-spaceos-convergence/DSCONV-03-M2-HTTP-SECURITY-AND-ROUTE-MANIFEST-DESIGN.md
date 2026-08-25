# DSCONV-03 — M2 HTTP security és route-manifest terv

- **Státusz:** source-only M2A implementáció; nem aktivál BFF route-ot
- **Dátum:** 2026-08-25
- **Előfeltétel:** M0 resolver source, M1A/B control-plane source és a HTTP/
  operációs log-redakciós gate elkészült

## Cél és szűk scope

Ez a slice két, még nem mountolt alapot készít el:

1. egy tiszta HTTP-határ szerződést a későbbi BFF-only route-okhoz;
2. a jelenlegi OpenAPI minden műveletének explicit access-mode manifestjét.

Nem ad ki sessiont vagy CSRF cookie-t, nem olvas adatbázist, nem hív Keycloakot
vagy Kernelt, nem változtat legacy route-ot, frontend klienst, CORS-konfigurációt
vagy OpenAPI security-sémát. A jelenlegi `/api/production` routerek továbbra is
legacy-only-k; a `getRequester` default `vezeto` viselkedését ezért ez a slice
nem teheti BFF elé.

## Canonical BFF origin

A majdani BFF kizárólag egy új, explicit
`DOORSTAR_BFF_CANONICAL_ORIGIN` konfigurációból kaphat originértéket. Nem
örökölhet a többértékű legacy `CORS_ORIGIN`-ból. Az érték csak kanonikus,
perjel nélküli HTTPS origin lehet:

- pontosan `new URL(value).origin` alakú;
- nincs userinfo, path, query vagy fragment;
- nincs több origin, CSV vagy fallback;
- hiánya/hibája future BFF mountkor fail-closed.

A TypeScript-brand önmagában nem bizalmi határ: a BFF composition factory
induláskor validálja ezt az explicit konfigurációt, és a kapott értéket closure
formájában zárja a request-preflightba. A preflight request-bemenete nem
tartalmaz origin paramétert, ezért browser `Origin`, castolt érték vagy hibás
per-request adapter sem cserélheti le a deployment-owned összehasonlítási
értéket.

Az `__Host-` session cookie Domain nélküli, ezért két publikus hostname nem
osztozhat ugyanazon sessionön. A kanonikus host és az esetleges redirect
külön deploy/edge döntés; ennek a source slice-nak nem feladata.

## Nyers HTTP bemenet és döntési sorrend

A security utility kizárólag a Node `rawHeaders` alternáló név/érték listáját
fogadja. Nem használhat `req.header()`-t vagy normalizált `req.headers`-t,
mert azok az ismételt header-sorokat összevonhatják vagy elrejthetik.

Minden későbbi BFF-only védett kérés sorrendje:

1. a composition factory canonical BFF-origin konfigurációt validál és zár be;
2. kérésenként a raw header-alak, a tiltott authority-header és a tényleges
   HTTP metódus ellenőrződik;
3. a Cookie sorok strict, veszteségmentes parseren mennek át;
4. `GET`/`HEAD` olvasásnál hiányzó session selector `401`; mutációnál a
   hiányzó session/CSRF/origin is egységesen `403` (M1 transport-szerződés),
   malformed vagy duplikált Cookie transport hiba `403`;
5. mutációnál pontosan egyszeri `Origin`, `__Host-doorstar-csrf` cookie és
   `X-Doorstar-CSRF` header kell; eltérés `403`;
6. csak ezután futhat a session-MAC, per-request resolver, current evidence és
   capability döntés.

A utility csak az 1–5. lépésre ad tiszta accepted/denied eredményt. Nem tekinti
érvényesnek a sessiont, nem választ tenantot, nem képez capabilityt, és nem
ad autentikációs fallbacket.

### Cookie és CSRF szabályok

- Cookie-név vagy -érték nem lehet üres, vezérlő karakteres, idézett vagy
  ambiguus; a parser minden Cookie sort és minden `;`-szegmenst ellenőriz.
- Bármely cookie-név duplikációja fail-closed (`403`). Olvasásnál a session
  célcookie teljes hiánya külön, determinisztikus `401`; mutációnál ez is
  egységes transport-`403`.
- A session neve `__Host-doorstar-session`, a CSRF neve
  `__Host-doorstar-csrf`; ezek konstansok, nem request/config értékek.
- Csak a tényleges `GET` és `HEAD` védett olvasás. Minden más támogatott HTTP
  metódus mutáció; ezt nem döntheti el egy handler által átadott
  `read`/`mutation` címke.
- Védett olvasás csak session cookie-t kér. Mutáció session + CSRF cookie +
  pontosan egy CSRF header + exact Origin nélkül nem indul.
- A CSRF cookie és header azonos, valid cookie-octet érték kell legyen;
  ennek későbbi DB-MAC ellenőrzése külön M2 session repository feladat.
- Az accepted preflight objektum kizárólag `{ kind: "accepted" }`; a session
  selector és CSRF érték module-private `WeakMap`-ben marad, és csak egy
  explicit server-oldali callbacken keresztül fogyasztható. Így a döntés
  önmagában nem szerializálható vagy logolható cookie-secretté.

### Tiltott authority-header

BFF-only route-on még a resolver előtt tiltott a `Authorization`,
`Proxy-Authorization`, illetve bármely headernév, amelynek a kötőjel/alsó
vonal nélküli alakja tartalmazza a `role`, `station`, `principal`, `tenant`
vagy `consumer` authority-fragmentet. Ez szándékosan konzervatív: tiltott
például az `X-Station-Id`, `X-StationId`, `X-TenantFoo`,
`X-SpaceOS-Tenant-Id`, `X-Doorstar-Consumer`, `X-DoorstarTenant` és bármely
case-variant. Tiltott header vagy
duplikált/hibás raw header alak `403`; a kérés nem eshet vissza legacy
`X-Role`/`X-Station` logikára.

## Route-manifest

Az OpenAPI a forrása a path/method/operationId hármasnak. A manifest saját
policyja kizárólag az `operationId → accessMode` kapcsolatot tartalmazza; nem
duplikál URL stringeket.

Lehetséges access mode-ok:

| Mode | Jelentés |
|---|---|
| `legacy-only` | Csak a mai router szolgálja ki; BFF security nem alkalmazható elé. |
| `bff-only` | Csak későbbi, BFF-native handler szolgálhatja ki; nincs legacy guard/fallback. |
| `public-operational` | Authority-mentes, nem üzleti operational endpoint. |

Kezdeti policy: a 82 `/api/production` művelet mind `legacy-only`; csak
`getHealth`, `getReadiness` és `getOpenApiContract` `public-operational`.
`bff-only` még nincs. A manifest construction fail-closed, ha az OpenAPI
operationId nem egyedi, hiányzik belőle policy, vagy a policyben elavult kulcs
marad.

Az `httpRouteTopology.ts` a három operational root route-ot, a legacy mount
pathot és mind a 16 legacy route-forrást egyszer deklarálja. Az `app.ts` ezt
mountolja. A verifier egyrészt TypeScript AST-val rekurzívan olvassa a pontosan
ugyanehhez a registryhez tartozó 16 legacy route-forrást, másrészt adatbázis
kérés nélkül létrehozza az alkalmazást és rekurzívan kiteríti a tényleges
Express runtime-stacket. A teljes 85 runtime method+path inventoryt hasonlítja
az OpenAPI-hoz. Dinamikus path/mount, scoped middleware, nested ismeretlen
route, nem támogatott HTTP metódus, stale/missing source vagy duplikált
method+path azonnali hiba. Így feltételes mount, `app.route`, computed route
vagy jövőbeli BFF mount nem kaphat véletlenül zöld OpenAPI-verifikációt; a
majdani atomikus cutoverhez külön topológiai deklaráció kell.

A build a fordított `dist/openapi.js` mellé másolt OpenAPI assetet izolált,
dist-only ideiglenes csomagban is importálja. Nincs source-checkout fallback.

Az első jövőbeli atomikus BFF cutover-jelölt a négy component-snapshot művelet;
átállítása csak akkor történhet, ha mind a négy BFF-native handlerrel, explicit
capability policyval, frontend BFF klienssel és az átírt OpenAPI contracttal
együtt kész.

## Kötelező tesztek

- canonical origin: hiányzó, HTTP, trailing slash/path/query/fragment/userinfo,
  CSV és nem kanonikus érték fail-closed, beleértve a TypeScript cast-bypassot
  a composition factorynál;
- raw header páratlanság, nem string, case-variant és duplikált Origin/CSRF/
  authority header;
- malformed, üres, quoted vagy duplikált Cookie; request több Cookie sor;
- védett `GET`/`HEAD` hiányzó session selectorral `401`; mutáció hiányzó
  session/CSRF/origin esetén `403`; malformed/duplikált Cookie és tiltott
  authority-header esetén resolver előtti `403`;
- CSRF cookie/header exact egyezés pozitív és mismatch negatív;
- a GET/HEAD versus mutáció a valós HTTP metódusból származik, az accepted
  preflight JSON/object mezői nem tartalmaznak selector vagy CSRF secretet;
- az OpenAPI 85 egyedi operationId-ja pontosan egyszer kerül manifestbe, a
  82 production operation legacy-only, csak a három root operational public,
  és kezdetben nulla bff-only;
- a route source registry, a tényleges recursive Express runtime-stack
  inventory, duplikált/scoped/dinamikus route-mount és a dist-only OpenAPI
  asset külön regressziós kaput kap.

## Stop feltételek

- normalized Express headerből duplikáció-ellenőrzés;
- cookie/session/tenant/capability browser-inputból való képzése;
- manifest nélkül vagy csupán egyes mutation route-ok BFF-only-ra állítása;
- legacy `getRequester` import/mount BFF-only handlerben;
- topológia-registry nélküli root/BFF mount vagy dinamikus/nested router;
- Keycloak, adatbázis, VPS, cookie-kiadás vagy route-mount ebben a slice-ban.
