# Doorstar — Üzemi Tábla

A Doorstar Kft. ajtógyártási folyamataihoz készült, ügyfél-specifikus termelésirányító felület. Egy alkalmazásban kezeli a heti ütemezési táblát, az állomásonkénti kanbant, a kapacitástervezést és a projekt-munkalapokat.

Éles felület: <https://doorstar.asztalostech.hu>

## Funkciók

- Heti **Tábla**: állomás × nap nézet, konkrét tervezett naphoz kötött feladatokkal.
- Állomásonkénti **Kanban**: élő státusznézet; a régi, aktuális és jövőbeli feladatok is látszanak.
- **Munkalapok**: projekt, epik és lépés szintű tervezés; mennyiség, egységnyi munkaidő és teljes munkaidő.
- **Projektkezelés**: létrehozás, név/munkaszám módosítás, epik törlés és soft archive.
- **Kiadási szabály**: csak teljesen, napra tervezett munkamenet adható ki a Táblára.
- **Kapacitás**: mennyiség × egységnyi idő alapján számol.
- **Read-only MCP/RAG**: helyi, lekérdező MCP adapter és kurált Doorstar tudástár-keresés agentek számára.

## Architektúra

| Rész | Hely | Technológia | Szerep |
| --- | --- | --- | --- |
| Frontend | `src/uzemi-tabla-web` | React, Vite, TypeScript | Üzemi Tábla felület |
| Backend | `src/production-service` | Node.js, Express, Prisma | Production REST API |
| Adatbázis | PostgreSQL | Prisma migrációk | Projekt-, munkalap- és feladatadatok |
| MCP | `src/doorstar-production-mcp` | TypeScript, stdio MCP | Olvasási API és lokális RAG |

A backend lokálisan a `4610`, a frontend a `4611` portot használja. Élesben nginx szolgálja ki a frontendet, és az `/api/` útvonalat a backendhez proxyzza.

## Gyors helyi indítás

Előfeltétel: Node.js, Docker és az `.env.example` alapján létrehozott helyi `.env`.

```powershell
cd src/production-service
npm ci
docker compose up -d
npm run prisma:deploy
npm run prisma:seed
npm run dev
```

Másik terminálban:

```powershell
cd src/uzemi-tabla-web
npm ci
npm run dev
```

A felület: <http://localhost:4611>. A backend healthcheckje: <http://localhost:4610/healthz>.

## Ellenőrzés

```powershell
cd src/production-service
npm test
npm run build

cd ../uzemi-tabla-web
npm run lint
npm run build

cd ../doorstar-production-mcp
npm test
npm run build
```

A backend tesztjei elkülönített `doorstar_test` PostgreSQL-sémát használnak; nem módosítják a helyi vagy éles üzemi adatokat.

## Élesítés

Az alkalmazás VPS-en fut. A pontos szolgáltatás-, nginx- és jogosultsági előírások az [AGENTS.md](AGENTS.md) fájlban vannak. Minden élesítés része a teszt és build, a Prisma migráció, a backend újraindítása, a frontend build jogosultságának ellenőrzése, valamint a publikus health- és API-ellenőrzés.

## Fontos döntések

- A **Tábla** heti dátumnézet, a **Kanban** nem dátumszűrt státusznézet.
- A munkalap az ütemezés forrása. Automatikus „mai naptól” dátumkiosztás nincs; hiányzó tervezett nap esetén a teljes kiadás elutasított.
- A Projekt/Epik/EpicStep a tervet, a Task a kiadott táblakártyát jelenti. Kiadáskor a mennyiség és az `óra/db` feladat-szintű snapshotot kap.
- A projekt törlése archiválás: a történeti feladatok megmaradnak.
- Az MCP adapter szándékosan csak olvas. Író agent-képesség külön jogosultsági és audit-tervet igényel.

## Dokumentáció

- [A 2026-07-22-es kiadás összefoglalója és döntései](docs/UZEMI_TABLA_RELEASE_2026-07-22.md)
- [Részletes architekturális döntési napló](docs/knowledge/architecture/DOORSTAR_SPACEOS_MAPPING_2026-07-18.md)
- [Backend README](src/production-service/README.md)
- [Frontend README](src/uzemi-tabla-web/README.md)
- [MCP/RAG README](src/doorstar-production-mcp/README.md)

## Ismert korlát

Az `X-Role` és `X-Station` fejléc csak ideiglenes kezelőfelületi védőháló, nem valódi hitelesítés. Bejelentkezés bevezetésekor JWT-alapú tenant- és állomásjogosultság-kezelésre kell cserélni.
