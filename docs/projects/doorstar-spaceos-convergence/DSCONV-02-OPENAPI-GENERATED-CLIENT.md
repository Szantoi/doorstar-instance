# DSCONV-02 — Doorstar OpenAPI 3.1 és generált frontend kliens

- **Szerep:** backend, frontend reviewer
- **Prioritás:** P0
- **Státusz:** pending (dependency-blocked)
- **Függőség:** DSCONV-01
- **Mutációs határ:** production-service API spec/contract teszt és
  uzemi-tabla-web generált API-réteg
- **Tiltott scope:** route-viselkedés, domainmodell, auth-migráció, UI-redesign

## Cél

A futó Doorstar API legyen formális source of truthból fogyasztható. A kézzel
szinkronban tartott frontend típusok helyét generált kliens vegye át úgy, hogy a
jelenlegi API és UI viselkedése ne változzon.

## Megvalósítási lépések

1. A tényleges route-okból készíts OpenAPI 3.1 specifikációt, példákkal és hibákkal.
2. Dokumentáld az authot jelenlegi és célállapotként, de ebben a taskban ne cseréld.
3. Készíts backend contract testet a route/spec driftre.
4. Vezess be Orval generálást fix verzióval és determinisztikus scriptből.
5. Migráld a frontend service-eket a generált típusokra fokozatosan.
6. A szabad JSON ProjectSheethez verziózott schema-discriminatort írj le; a
   backendvalidáció a DSCONV-04/05 része.

## Teszt- és bizonyítékterv

```powershell
cd src/production-service
npm run build
npm test
cd ../uzemi-tabla-web
npm run build
npm test
npm run lint
```

Kötelező CI drift-check: clean generation után `git diff --exit-code` a generált
contract területre.

## Elfogadási kritériumok

- [ ] Minden tényleges route, query, body, response és hibaalak szerepel.
- [ ] A kliens generálható egy paranccsal.
- [ ] A kézi API DTO-k eltűntek vagy kizárólag UI view-modelként maradtak.
- [ ] OpenAPI/client drift CI-ben bukik.
- [ ] Backend és frontend build/teszt zöld, fő UX változatlan.

## Stop / eszkaláció

Spec és futó API eltérésnél ne „javítsd” találomra az API-t; rögzítsd a
contract-döntést és kérj root jóváhagyást breaking change-hez.

## Végrehajtási napló

- **2026-07-28 — helyi OpenAPI baseline kész:** a futó production-service
  38 Express-műveletét lefedő, OpenAPI 3.1 JSON szerződés a
  `src/production-service/openapi/production-service.openapi.json` fájlban
  található. A `npm run verify:openapi` route-deklarációkból ellenőrzi a teljes
  route-lefedettséget és a stale operationöket; az első futás zöld volt.
- A specifikáció rögzíti a jelenlegi, login nélküli `X-Role` / `X-Station`
  fejléc-viselkedést, de ezt nem állítja be authként. Orval-generálás és a
  kézi frontend DTO-k kiváltása a DSCONV-GATE-SECURITY és
  DSCONV-GATE-INSTANCE feloldása után indulhat, ezért a teljes DSCONV-02 státusz
  továbbra is dependency-blocked.
- **2026-07-28 — futásidejű kontraktus-kiszolgálás:** a production-service a
  változatlan, buildkor a `dist/openapi/` mappába másolt specifikációt
  `GET /openapi.json` útvonalon szolgálja ki. A külön unit teszt a válasz teljes
  tartalmát a forrásfájllal hasonlítja össze.

## Átadási bizonyíték

_OpenAPI hash, route coverage, generation/drift log, build/test._
