# ADR — SharePoint csak olvasható forráskatalógus

**Dátum:** 2026-07-30  
**Státusz:** snapshot-döntés elfogadott; élő connector nem engedélyezett  
**Érintett terület:** Doorstar rendelési adatfeltérképezés

## Kontextus

A Doorstar üzleti dokumentumai SharePoint-szinkronizált mappastruktúrában élnek.
A jelenlegi `.iqy`-export fájl- és mappanevet, relatív szerverútvonalat,
módosítási időt és módosítót tartalmaz, de nincs benne stabil site/drive/item
identity, verziótörténet, törlési esemény vagy létrehozási idő.

Az alkalmazás `OrderDocument` rekordja review-zott rendelési bizonyíték. A
SharePoint teljes forrásindexe ennél jóval nagyobb, és tartalmazhat üzletileg
irreleváns, nem kapcsolt vagy ellentmondó fájlokat is.

## Döntés

1. A jelenlegi exportból determinisztikus, csak olvasható
   **Source Catalog snapshot** készül. Nem nevezhető élő szinkronnak.
2. Az exportált mappasorokat megőrizzük; csak a hiányzó ősöket vezetjük le a
   dokumentumútvonalakból. Üzleti binárist nem másolunk a repositoryba vagy
   adatbázisba.
3. A snapshot relatív útvonalat, forrásmetaadatot, SHA-256 fingerprintet és
   stabil source-snapshot kulcsot ad. A külön transzformációs fingerprint a
   source hash + input profil + parser/szimulátor profil + kanonikus payload
   alapján képződik, ezért mappingváltozáskor új katalógusfutás-kulcs készül.
   Abszolút/traversal vagy duplikált dokumentum-/mappaútvonalnál a futás
   fail-closed.
4. A relevancia, identity, projektlink-review, verzió és lifecycle külön
   állapottengely. Fájlnév-/útvonal-munkaszám eltérés mindig review.
5. A Source Catalog külön bounded context. Nem az Import Inbox és nem az
   `OrderDocument` teljesít több szerepet. Csak ember által megerősített,
   pontos verziójú katalóguslinkből készülhet később metadata-only
   `OrderDocument`.
6. Élő Microsoft Graph connector nem készül addig, amíg nincs:
   - valódi Entra/OIDC hitelesítés és szerveroldali RBAC;
   - tenant-admin által kijelölt site/library és read-only grant;
   - üzleti owner és projektlink-reviewer;
   - tartós catalog/run/cursor/folder/document/version/link/tombstone modell;
   - jóváhagyott reconciliation-, retry-, rollback- és adatmegőrzési terv.
7. Az élő connector sem hozhat létre Projectet, rendelési DRAFT-ot vagy
   gyártási rekordot. Feltöltés, átnevezés, mozgatás és törlés nem része a
   connector szerződésének.

## Snapshot elfogadási feltétele

A golden futás akkor elfogadott, ha:

- mind a 9 297 forrássor elszámolt;
- 5 855 dokumentum, 2 974 exportált mappa, 14 levezetett ős és 271 erős
  munkaszámcsomag-jelölt reprodukálható;
- 468 lock/backup rekord kizárt;
- nincs abszolút Windows-út, traversal, duplikált dokumentumút vagy árva parent;
- `databaseWrite:false` és `macroExecution:false`;
- külön QA-futás egyezteti a kódot, a fingerprintet és a JSON-összesítőket.

## Következmények

- A webalkalmazás már most kaphat tesztelhető mappafa- és keresési fixture-t,
  de a felület kötelezően „pillanatfelvétel, nem élő SharePoint” jelzést mutat.
- A fájl `Módosítva` értéke dokumentumverzió-metaadat marad; nem határidő,
  kiszállítás, beépítés vagy teljesítés.
- A path-only és konfliktusos munkaszám emberi döntés nélkül nem lesz
  projektkapcsolat.
- Rename/move/törlés/verzió csak stabil Graph identity és delta feldolgozás
  után követhető.
- A jelenlegi opcionális `X-Role` fejléc nem alkalmas élő katalógus
  jogosultságkezelésére; ez P0 blokkoló.
