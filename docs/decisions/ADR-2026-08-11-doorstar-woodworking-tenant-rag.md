# ADR-2026-08-11 — Elkülönített Doorstar-faipari RAG tenant

**Státusz:** Elfogadva

**Dátum:** 2026-08-11

## Kontextus

A Doorstar agenteknek faipari segítségre van szükségük, de nem szabad a
fejlesztői repó, infrastruktúra, kód vagy vállalati folyamat tudásanyagát a
faipari RAG-on keresztül elérhetővé tenni. A rendelkezésre álló faipari könyvek
és OCR-kivonatok szerzői jogi és üzleti szempontból privát források: azok sem
nyilvános URL-re, sem MCP resource-ba, sem indexbe nem kerülhetnek változatlan
formában.

A korábbi `doorstar-knowledge` útvonal a megosztott Nexus-dev `:3466`
szolgáltatásra és vegyes korpuszra mutatott. Ezt a történeti rendszert és annak
ingest-bizonylatait nem írjuk át, nem töröljük, és nem használjuk az új
faipari tenant forrásaként.

## Döntés

Külön, privát Doorstar-faipari tenant fut a Nexus-dev VPS-en:

| Elem | Rögzített érték |
| --- | --- |
| Runtime | `/opt/doorstar-woodworking-rag` |
| systemd unit | `nexus-dev-doorstar-woodworking.service` |
| Bind | `100.82.133.87:3467` (csak Tailnet) |
| Logikai korpusz | `doorstar-woodworking` |
| Tenant / scope | `doorstar` / `woodworking` |
| MCP felület | pontosan egy, olvasó `search_knowledge` tool |
| Jogosult principalok | a hat `doorstar-*-codex` identitás |

A tenant egy kis, determinisztikus, hash-elt, eredeti magyar faipari
tudáskártya-manifesztet szolgál ki. A kártyák ajtólap, tok, borítás, anyag,
gyártási dokumentáció, a hat gyártási lépés és minőségellenőrzés témáit fedik
le. A keresés BM25-szerű, csak ezen a manifesten fut; nem olvas repót,
meghajtót, könyvtárat vagy hálózati forrást kérés közben.

## Adat- és szerzői jogi határ

- Nyers könyv, PDF, szkennelt oldal, kép, OCR-szöveg, könyvcím, oldalszám és
  forrásfájl-útvonal nem kerül a runtime-ba, a gitbe vagy MCP-kimenetbe.
- A tenant csak eredeti, tömör összefoglalókat és szintetikus
  `tenant:doorstar;scope:woodworking;card:<id>` hivatkozásokat ad vissza.
- Minden kártya saját SHA-256 azonosítóval szerepel; frissítéskor a manifestet,
  hash-eket és a negatív (fejlesztői kérdés) teszteket együtt kell felülvizsgálni.

## Hozzáférési és hálózati határ

- A tenant külön, master/default identitás nélküli token-konfigurációt kap. A
  token csak a hat névhez rendelhető; ismeretlen vagy hiányzó Bearer token
  elutasított.
- `tools/list` kizárólag `search_knowledge`-t ad vissza; minden más
  `tools/call` 403 / `-32003` választ kap.
- Nincs nginx site, publikus DNS, Let's Encrypt tanúsítvány vagy publikus UFW
  nyitás. A `doormanufacturing.joinerytech.hu` nem RAG-végpont.
- A tenant saját, minimális Node runtime-ot és dedikált rendszerfelhasználót
  használ; nem indítjuk újra, nem módosítjuk a közös `nexus-dev-ks.service`
  folyamatot.

## Bridge-szerződés

A helyi Codex bridge kódban rögzítetten a `:3467/mcp` végpontot hívja, és
minden keresés előtt ellenőrzi a `:3467/health` választ. A health-nek igazolnia
kell a `doorstar-woodworking` korpuszt, a `doorstar` tenantot, a
`woodworking` scope-ot, a nem üres korpuszt, a `3467` portot és a
korpusz-ujjlenyomatot.

A health és a keresési válasz ujjlenyomatát, dokumentumszámát, rendezett
kártyalistáját, kártya-metaadatát és a kérdéshez tartozó kivonatot a bridge a
helyi statikus manifestből számolja újra. Így a helyesnek látszó tenant-címke
sem enged könyvszöveget, fejlesztői tartalmat vagy más korpuszból származó
szöveget átjutni.

A bridge a szervernek kizárólag a rögzített
`{ query, limit, domain: "woodworking" }` keresést küldi. Csak olyan választ
fogad el, amelyben `island: "doorstar"`, `collection:
"doorstar-woodworking"`, `domain: "woodworking"`, a megfelelő scope és a
szintetikus kártya-metaadat szerepel. Hiba esetén nem tér vissza a `:3466`
végpontra.

## Üzemeltetés és visszaállítás

Token-rotáció után a privát tenant `agents.json` fájlja frissítendő, majd a
tenant unit újraindítandó; token érték nem kerül naplóba vagy repóba. A kiadás
előtt a `npm run build`, `npm test` és `npm run verify:nexus-identities`
futtatandó.

Az első tenant-credential készletet nem a korábbi `:3466` konfigurációból
másoljuk. A Doorstar Windows user saját környezetében futó
`src/doorstar-production-mcp/scripts/provisionTenantWoodworkingCredentials.ps1`
hat új, csak ehhez a tenanthoz kötött értéket generál, a távoli
`agents.json`-t root-owned módban telepíti, majd frissíti a hat helyi
user-environment változót. A script nem ír ki credential értéket, és hiba
esetén leállítja az új unitot. Új Codex task szükséges, hogy ne maradjon
memóriában korábbi bridge-folyamat.

Hiba esetén a tenant unit leállítható. A bridge ekkor fail-closed hibát ad,
nem pedig a korábbi vegyes tudástárat használja. A helyi statikus faipari RAG
változatlanul elkülönítve marad. A korábbi `doorstar-knowledge` gyűjteményhez
vagy annak történeti ingest-anyagaihoz nincs automatikus rollback vagy
törlési művelet.
