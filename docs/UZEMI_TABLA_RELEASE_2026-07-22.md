# Üzemi Tábla — fejlesztési és kiadási összefoglaló

**Dátum:** 2026-07-22  
**Kiadott Git commit:** `72d5e96`  
**Éles URL:** <https://doorstar.asztalostech.hu>

## Cél

A próbadesign alapján használható, adatbiztos termelési táblát készítettünk Doorstar számára. A hangsúly a munkalapból történő, tervezett napi kiadásra, a régi feladatok kanbanos követhetőségére és a vezetői projektkezelésre került.

## Elkészült fejlesztések

### Projekt és munkalap

- A vezető a munkalapon módosíthatja a projekt nevét és munkaszámát.
- A projekt archiválható; a történeti feladatok megmaradnak.
- Egy epik külön is törölhető; a már kiadott kártyák története nem vész el.
- A szabadon felvitt táblafeladat a feladatlapján projekthez és közvetlenül epikhez is köthető.
- Munkalaplépésenként kezelhető a tervezett nap, mennyiség és egységnyi munkaidő (`óra/db`). A teljes idő számított érték.

### Tábla, Kanban és kapacitás

- A Tábla a kiválasztott hétre szűr, mert ez az ütemezési nézet.
- A Kanban nem szűr hétre: minden múltbeli, aktuális és jövőbeli feladat a tényleges státusza szerinti oszlopban jelenik meg.
- A terhelési nézet feladat-szintű mennyiségből és `óra/db` értékből számol; régi feladatoknál az EpicStep értéke fallback.
- Törlés után a Tábla, Kanban, kapacitás és projekt-összesítések cache-e is frissül.

### Kiadási szabály: tervezett nap kötelező

**Döntés:** a Táblára kiadott munkalapfeladatnak kötelező tervezett nappal rendelkeznie.

**Indok:** automatikus, „mai naptól” kiosztott dátummal olyan feladat kerülhetett volna a Táblára, amelyet a vezető még nem ütemezett be. Ez hibás kapacitásképet és félrevezető napi tervet okozna.

**Megvalósítás:**

- A frontend azonnal jelzi a hiányzó lépéseket.
- A backend a kiadás előtt minden aktív, még ki nem adott EpicStepet ellenőriz.
- Hiányzó nap esetén `409 missing_plan_dates` választ ad a hiányzó lépések listájával.
- Az ellenőrzés az első Task létrehozása előtt történik, így nem jöhet létre részlegesen kiadott munkamenet.
- A korábbi automatikus munkanap-generálás megszűnt.

### MCP és RAG

- Elkészült a `doorstar-production-mcp` helyi, stdio-alapú MCP adapter.
- Kilenc olvasási eszközt ad az Üzemi Tábla API-jához és a kurált tudástárhoz.
- Nincs benne író HTTP művelet, adatbázis-kapcsolat vagy credential-kezelés.
- A RAG csak engedélyezett Markdown-dokumentumokat indexel; bináris, módosított, konfigurációs és secret-mintát tartalmazó dokumentumokat kizár.

## Élesítési eredmény

- A backend és frontend production build sikeresen lefutott.
- A Prisma migrációk sikeresen lefutottak: projekt archiválási mező, valamint Task epik-, mennyiség- és egységidő mezők.
- A `doorstar-production-service` újraindult, és az új processz hallgat a 4610-as porton.
- A publikus `/healthz` és a `/api/production/projects` végpont ellenőrzése sikeres volt.
- A production függőségi audit mind a backendnél, mind a frontendnél **0 sebezhetőséget** jelzett.

## Minőségbiztosítás

| Ellenőrzés | Eredmény |
| --- | --- |
| Backend integrációs teszt | 12/12 sikeres |
| Backend build | sikeres |
| Frontend TypeScript lint | sikeres |
| Frontend production build | sikeres |
| MCP teszt | 7/7 sikeres |
| Független kódreview | PASS |

## Következő, tudatosan nyitva hagyott lépések

1. Valódi hitelesítés és jogosultságkezelés az `X-Role` / `X-Station` védőháló helyett.
2. Formális OpenAPI dokumentáció a production-service API-hoz.
3. Író MCP csak külön jóváhagyott identitás-, jogosultság- és auditmodell után.
4. Demóadatok lecserélése valódi üzemi adatokra megrendelői döntés szerint.

## Kapcsolódó anyagok

- [Gyökér README](../README.md)
- [Döntési napló](knowledge/architecture/DOORSTAR_SPACEOS_MAPPING_2026-07-18.md)
- [Backend dokumentáció](../src/production-service/README.md)
- [MCP/RAG dokumentáció](../src/doorstar-production-mcp/README.md)
