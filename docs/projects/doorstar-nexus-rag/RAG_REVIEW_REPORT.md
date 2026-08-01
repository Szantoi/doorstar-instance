# Doorstar Nexus RAG dry-run és review-jelentés

**Állapot:** `HUMAN_APPROVAL_REQUIRED — STOP`  
**Csomag:** `doorstar-controlled-knowledge-rag@1.0.0`  
**Cél-sziget:** `doorstar`  
**Mód:** `dry-run`  
**Érvényesség kezdete:** `2026-07-31`

## Eredmény

A kontrollált csomag szerkezetileg és biztonsági szempontból átment a helyi,
determinista dry-runon. A futás nem hívott hálózatot, nem írt Nexusba,
ChromaDB-be vagy adatbázisba, és csak a helyi jelentésfájlt hozta létre.

| Ellenőrzési adat | Eredmény |
| --- | --- |
| Kanonikus dokumentum | 6 |
| Forrásolt claim | 98 |
| `VERIFIED` | 88 |
| `INFERENCE` | 1 |
| `OPEN` | 9 |
| Determinisztikus chunk | 41 |
| Eval kérdés | 35 |
| Hiba | 0 |
| Figyelmeztetés | 0 |
| Tervezett művelet üres baseline mellett | 6 × `CREATE`, tényleges írás nélkül |
| Package hash | `34110af5a9ea4c129467034fa3d181cbba6c5601b908abd87be89d078fbae116` |
| Dry-run report SHA-256 | `c4e74c696495c96b3ee649d26003ef54fedbbacf28a8b7a2f5c1e320729e5cc2` |
| Source inventory SHA-256 | `bd7844df8024d7fb96bdd37293872d88f19ebb0eac2975cf876fce439c27aa50` |
| Manifest SHA-256 | `4c3f3cf612a4b118981a094204fbbc64ad03dfe4ca0ed16dc050d40d1e72dd72` |
| Eval SHA-256 | `b3d42264ddbfe68b610611813f50d46280c241ad5a825f70491ad77085f7812d` |
| Validator unit teszt | 12/12 PASS |
| Backend build | PASS |
| OpenAPI ellenőrzés | 3.1.0, 83 művelet, teljes route-lefedettség |
| Teljes backend teszt | 39 fájl, 127 teszt, PASS |
| Független biztonsági QA | PASS, P0/P1: 0 |

Az üres idempotencia-baseline miatt a `CREATE` csak offline terv. A validátor
nem kérdezte le a Nexus jelenlegi dokumentumállapotát. Betöltés előtt külön,
jóváhagyott baseline vagy kontrollált read-only összevetés szükséges.

## Forrásleltár

| Minősítés | Darab | Közvetlen RAG-indexelés |
| --- | ---: | --- |
| `PROCESS` | 30 | nem; csak kanonizálási bemenet |
| `HUMAN_REVIEW` | 9 | nem |
| `EXCLUDE` | 6 | tilos |
| Kizárt forrásosztály | 11 szabály | tilos |

Mind a 45 tétel aktuális repository-fájljának SHA-256 értéke ellenőrzött.
A leltár egészében `ragIndexable:false`; 8 tétel személyes, 6 ügyfél- és 9
rendelésadat-lehetőséget jelöl. Ezek a jelzések csak a korlátozott auditfájlban
maradnak, nem a kanonikus RAG-szövegben.

A manifest két `HUMAN_REVIEW` forrást használ általános állítások
kanonizálására:

- `SRC-ORDER-SALES-SURVEY-WORKFLOW`;
- `SRC-ORDER-IMPORT-MAPPING`.

E fájlok teljes tartalma nem kerül betöltésre. Embernek külön meg kell
erősítenie, hogy a kiválasztott, általános claim-ek helyesek és nem emelnek át
rendelés-specifikus jelentést.

## Kanonikus réteg

| Dokumentum | Claim | Chunk | Review státusz |
| --- | ---: | ---: | --- |
| Dokumentumtípusok és forrásmezők | 19 | 7 | `READY_FOR_HUMAN_REVIEW` |
| Import-, evidence- és review-szabályok | 19 | 8 | `READY_FOR_HUMAN_REVIEW` |
| Rendeléstől az üzemi kiadásig | 14 | 6 | `READY_FOR_HUMAN_REVIEW` |
| Gyártási szakaszok, állapotok és dátumok | 16 | 7 | `READY_FOR_HUMAN_REVIEW` |
| Szerepkörök és döntési authority | 13 | 6 | `READY_FOR_HUMAN_REVIEW` |
| Doorstar-belső és faipari terminológia | 17 | 7 | `READY_FOR_HUMAN_REVIEW` |

Minden claim `VERIFIED`, `INFERENCE` vagy `OPEN` állapotú, és legalább egy
inventory source ID-t, teljes SHA-256 forráshash-t és lokátort tartalmaz. A
validátor a claim-hivatkozás és a manifest forráskészlet egyezését is
ellenőrizte.

## Biztonsági eredmények

- Nincs nyers PDF, XLSX, XLSM, DWG, kép vagy nagy import-preview a csomagban.
- Nincs abszolút Windows-út a manifestben vagy kanonikus dokumentumban.
- A PII- és rendelésazonosító-mintavizsgálat nem talált tiltott értéket a
  kanonikus dokumentumokban vagy eval-kérdésekben.
- Minden forrás- és kanonikus hash egyezik az aktuális fájllal.
- A chunking policy mind a hat dokumentumnál azonos és determinisztikus:
  Markdown H1–H3 + bekezdés, legfeljebb 1600 karakter, 0 átfedés.
- A dokumentumkulcs az `id`, verzió, kanonikus hash és policy-verzió SHA-256
  kombinációja; azonos `id` + verzió eltérő hash mellett blokkol.
- A dry-run report ismételt futásban bájtszinten azonos.

A validátor a lokátor kötelező jelenlétét és biztonságos szintaxisát ellenőrzi,
de a különböző Markdown-, JSON-, Prisma- és konfigurációs forrástípusokban nem
bizonyítja automatikusan, hogy a megadott szemantikai szakasznév ténylegesen
létezik. A claim tartalmi és lokátor-szemantikai egyezése ezért az emberi
review része marad.

## Nyitott, nem igazolt tudás

Az alábbi témák `OPEN` állapotban maradnak, és jóváhagyáskor sem szabad őket
automatikus tényként vagy műszaki defaultként használni:

1. végleges Entra-csoport és Doorstar-szerepkör megfeleltetés;
2. valódi OIDC, szerveroldali RBAC, projekt-hozzárendelés és dokumentum-ACL;
3. jóváhagyott DWG–DXF konverziós és rajzi mértékegység-review folyamat;
4. élő SharePoint connector authority-, identity- és üzemeltetési kapui;
5. az `Egyéb` munkaállomás szakmai jelentése;
6. a teljes dátumtaxonómia első osztályú runtime mezői;
7. a `BKM_FIX`, `BKM_MOVING` és `TOK` profil- vagy BOM-jelentése;
8. a blende típusai és gyártott vagy kiegészítő osztályba sorolása;
9. a nyitásirány helyi konvenciója és biztonságos strukturált felbontása.

## Emberi review checklist

- [ ] A hat kanonikus dokumentum üzleti tulajdonosa elfogadja a claim-eket.
- [ ] A két `HUMAN_REVIEW` forrásból származó általános állítás külön
      ellenőrzést kapott.
- [ ] A `VERIFIED` policy-állításokat nem értelmezzük automatikusan már
      implementált autentikációként vagy adatmezőként.
- [ ] Az `INFERENCE` és `OPEN` állítások keresési válaszban látható minősítést
      kapnak, és nem válhatnak automatikus döntéssé.
- [ ] Meg van nevezve a Nexus-betöltés jóváhagyója és a későbbi visszavonás
      felelőse.
- [ ] Elkészült vagy jóváhagyott a Nexus aktuális baseline összevetése.
- [ ] A package hash és a hat dokumentumhash a jóváhagyás pillanatában még
      egyezik.

## Leállási döntés

**A folyamat itt megáll.** A csomag review-ra kész, de nincs jóváhagyva és nincs
betöltve. Nexus- vagy ChromaDB-módosítás csak új, explicit emberi jóváhagyás
után, külön végrehajtási tervvel és változatlan package hash mellett kezdhető.
