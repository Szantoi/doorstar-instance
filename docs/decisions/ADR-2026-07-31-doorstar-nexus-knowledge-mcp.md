# ADR — Doorstar Nexus faipari tudássziget bekötése

**Dátum:** 2026-07-31  
**Státusz:** részben felülírva; az egy közös identitású migrációs döntést a
hat szerepidentitásos ADR váltotta fel  
**Érintett terület:** Codex fejlesztői környezet, Doorstar RAG, Nexus-dev

## Aktuális státusz — 2026-07-31

Ez az ADR az első működő Nexus–Codex kapcsolat történeti döntése. Az itt
szereplő közös `doorstar-codex` principal és `DOORSTAR_NEXUS_TOKEN` már nem él:
a sikeres cutover után vissza lett vonva. Az aktuális, kanonikus döntés a
[`ADR-2026-07-31-codex-agent-identities.md`](ADR-2026-07-31-codex-agent-identities.md):
hat külön, szerepenként visszavonható principal, külön credential és
szerveroldali knowledge-only RBAC.

## Kontextus

A `doorstar-knowledge` Chroma-kollekció 1998 faipari tudásdarabot tartalmaz,
de a Doorstar Codex-kliens nem rendelkezett külön hitelesített
sziget-hozzárendeléssel. A megosztott Nexus 3466-os `/mcp` végpontja régi,
kézzel kezelt JSON-RPC-over-HTTP felület; nem a Codex által elvárt modern
Streamable HTTP MCP-átvitel. A közvetlen Codex-regisztráció ezért
`invalid transport` hibával bukott, miközben a hitelesített HTTP-keresés maga
már működött.

## Eredeti átmeneti döntés

- A Nexus az első migrációs lépésben külön, visszavonható `doorstar-codex`
  identitást kapott, amelyet a
  szerver `doorstar` szigetre, azon keresztül a `doorstar-knowledge`
  kollekcióra old fel.
- A hozzáférési token kizárólag a Windows felhasználói
  `DOORSTAR_NEXUS_TOKEN` környezeti változóban él; nincs repóban, TOML-ban,
  argumentumban vagy naplóban.
- A projekt `.codex/config.toml` fájlja külön `doorstar_knowledge` STDIO MCP-t
  indít. Az abszolút entrypoint miatt a kapcsolat a repó gyökeréből és a
  `terminals/frontend` munkakönyvtárból is elindul.
- A helyi bridge pontosan egy `search_knowledge` toolt regisztrál az official
  MCP SDK-val. A régi upstreamhez fix, típusos JSON-RPC POST-ot küld; nincs
  általános tool-, URL-, method-, domain-, island- vagy collection-proxy.
- A bridge csak 2–500 karakteres kérdést és 1–10 közötti találatszámot fogad.
  Redirectet, nem JSON választ, hibás ID-t, upstream tool-hibát, túl nagy vagy
  hibás szerkezetű választ, illetve nem `doorstar` szigetet fail-closed módon
  elutasít. A teljes választestre határidő és streaming méretkorlát vonatkozik.
- A visszaadott metadata engedélyezett provenance-mezőkre szűkül. A híd
  `readOnly`, nem romboló, idempotens és nyitott világú keresésként deklarált.

## Authority-határ

A RAG-találat fejlesztési, terminológiai és dokumentációs segítség. Nem válhat
automatikus anyag-, felület-, méret-, tűrés-, képlet-, normaidő-, gép- vagy
kiadási döntéssé. Számértékhez továbbra is eredeti forrásoldal, verzió/locator
és szakértői review szükséges. A Codex MCP nem böngészőalkalmazás-API.

## Biztonsági követés — lezárva

A korábbi globális/default `all` policy ki lett vezetve. A standard Nexus
identitások explicit allowlistet kaptak, a hat Doorstar principal pedig
kizárólag a `search_knowledge` szabályban szerepel; minden más explicit és
unlisted művelet fail-closed. A régi közös principal vissza lett vonva.

A forrásoldali első policy-betöltési hiba alapértéke szintén `none`. Az élő
szolgáltatás systemd `ExecStartPre` validátora hiányzó, sérült, globális
`all`-t tartalmazó, hibás szerepszámú vagy knowledge-only határt sértő policy
esetén még folyamatindítás előtt hibázik. A guard telepítésekor nem történt
szolgáltatásrestart; a futó PID változatlan maradt.

## Eredeti migrációs bizonyíték

- MCP-csomag: 18/18 teszt PASS, TypeScript build PASS, production dependency
  audit 0 finding.
- Hermetikus SDK-integráció: pontosan egy tool látható, a deklarált read-only
  annotációkkal.
- Hitelesítéskontroll: token nélkül 401, hibás tokennel 403.
- Valódi `codex exec` a projekt gyökeréből: `island=doorstar`, 1 találat,
  `szega_book_134_oldal_008.jpg`.
- Valódi `codex exec` a `terminals/frontend` könyvtárból:
  `island=doorstar`, 1 találat, `szega_book_134_oldal_124.jpg`.
- Nexus napló: `caller=doorstar-codex`; a kollekciófeloldás
  `doorstar-knowledge (island: doorstar)`.
- Workspace secret scan: PASS.

## Üzemeltetés

A projekt MCP-konfiguráció változása után új Codex task szükséges, mert egy
meglévő task tool-inventoryja nem frissül menet közben. Windows alatt a bridge
az abszolút System32 `reg.exe` segítségével a friss user-szintű
`HKCU\\Environment` értéket tekinti autoritatívnak, és csak ennek hiányában
használ örökölt process-változót. Így egy régebbi háttérhost és a tokenrotáció
sem blokkolja a hitelesítést. A Nexus
agent–sziget mapping hot-reloados; az eredeti összekötéshez nem kellett service
restart, build vagy deploy. A későbbi hatos cutover és a restart-preflight
üzemeltetési bizonyítéka a kanonikus identitás-ADR-ben van. A régi, auth
nélküli 3460-as Doorstar Nexus példány nem része
ennek a kapcsolatnak.
