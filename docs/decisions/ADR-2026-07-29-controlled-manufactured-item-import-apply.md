# ADR — Gyártási tétel importjelöltek kontrollált alkalmazása

- Dátum: 2026-07-29
- Állapot: elfogadva
- Projekt: Doorstar Order-to-Production Data Chain
- Feladat: DSORD-07

## Kontextus

A determinisztikus Excel-preview már elő tudja állítani a falpanel és
bútorfront `ManufacturedItem` API-payloadját, az `ImportCandidate` pedig
kereshetően őrzi a payloadot és a forráshelyet. A payload alkalmazása eddig
csak egyedi API-hívásokkal volt lehetséges. Ez nem biztosított egységes emberi
kaput, fingerprint-ellenőrzést vagy igazolt idempotenciát.

Az átállási időszakban az Excel marad a domináns forrás, ezért a rendszernek
ismételhetően és auditálhatóan kell kezelnie ugyanazt az előnézetet. Production
adatbázisba történő import továbbra sem engedélyezett.

## Döntés

Új kontrollált művelet készül:

`POST /api/production/import-runs/:importRunId/apply-manufactured-items`

A kérés kötelező elemei:

- `orderRevisionId`: az ImportRunhoz tartozó célrevízió;
- `sourceFingerprint`: a felhasználó által látott előnézet pontos SHA-256
  fingerprintje;
- `candidateIds`: az ember által egyenként kiválasztott READY jelöltek;
- `confirmation`: fix `APPLY_READY_MANUFACTURED_ITEMS` megerősítés.

A művelet csak akkor fut, ha:

1. a runtime adatbázis-kapcsolat `doorstar_test`;
2. a célrevízió ugyanahhoz az ImportRunhoz tartozik és `DRAFT`;
3. minden kiválasztott jelölt `ManufacturedItemImportPreview`, `READY`,
   hibamentes és az adott ImportRunhoz tartozik;
4. a normalizált payload megfelel az aktuális
   `createManufacturedItemSchema` szerződésnek;
5. a forrás fingerprint változatlan.

Az alkalmazás egy adatbázis-tranzakció. A `ManufacturedItem.importCandidateId`
egyedi kulcsa az idempotencia végső védőhálója. Egy már alkalmazott, érvényesen
kapcsolt jelölt ismételt beküldése sikeres, `existing` eredményt ad; nem hoz
létre második tételt. A teljes batch meghiúsul, ha bármely új jelölt érvénytelen
vagy nem READY.

Az új tétel `REVIEW` állapotú marad, és csak a meglévő emberi
`VERIFIED`/`REJECTED` döntéssel zárható le. Az uploader nem hoz létre
gyártási feladatot és nem módosít határidőt.

## UI-szándék

Az ImportRun bizonyítékoldal:

- csak jogosult műszaki előkészítőnek/jóváhagyónak/vezetőnek mutatja a kaput;
- megmutatja a kapcsolt DRAFT revíziót;
- READY jelöltenként külön jelölőnégyzetet ad;
- a felhasználó által begépelt `BETÖLTÖM` szóval kér megerősítést;
- nem ad „mindent elfogadok” vagy production cél lehetőséget;
- siker után újraolvassa az evidence oldalt és megmutatja az APPLIED tételeket.

## Következmények

- Az ImportCandidate állapot és a létrejött ManufacturedItem kapcsolat
  ugyanabban a tranzakcióban változik.
- A kliens nem küldhet tetszőleges tétel-payloadot az apply végpontra; a szerver
  mindig az eltárolt, fingerprinttel azonosított payloadot validálja.
- A batch mérete korlátozott, így egy importfutás feldolgozása mérhető és
  naplózható.
- A production-import engedélyezése későbbi, külön ADR és emberi döntés tárgya.
