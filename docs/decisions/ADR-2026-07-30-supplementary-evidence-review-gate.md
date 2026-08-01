# ADR — Supplementary evidence review gate

- Dátum: 2026-07-30
- Státusz: Elfogadva
- Érintett feladat: Doorstar order-data-chain P0 safety remediation

## Kontextus

A `SOURCE_REVIEW` kiegészítő tétel forrásbizonyítékból származik, ezért nem
elegendő azt ellenőrizni, hogy legalább egy evidence rekord létezik. A jelenlegi
backend még egy `REVIEW` vagy `UNVERIFIED` evidence mellett is engedné a szülő
tétel `VERIFIED` állapotát. A frontend ezt már fail-closed módon tiltja, de a
kliensoldali tiltás nem biztonsági határ.

Az evidence nyers tartalma és normalizált értéke forráslineage. A review-döntés
külön auditadat; nem írhatja át sem a forrást, sem a szülő tétel üzleti
mezőit.

## Döntés

1. Új evidence csak `UNVERIFIED` vagy `REVIEW` állapotban hozható létre.
   A create payload nem állíthat be végállapotot.
2. Külön review command kezeli az evidence-döntést:

   `PATCH /api/production/production-orders/{projectKey}/revisions/{revision}/supplementary-items/{itemId}/evidence/{evidenceId}/review`

3. A command kizárólag DRAFT rendelésre és még `REVIEW` állapotú szülő
   tételre fut. A normatív reviewer szerepek `technical_preparation` és
   `order_approver`; a login nélküli átmeneti jogosultsági modell miatt az
   `administrator` és `vezeto` audit-identitás is elfogadott. Más szerep
   (például `sales`) nem teljesítheti a readiness-kaput.
4. Az evidence döntése `RESOLVED` vagy `REJECTED`, kötelező 3–2000 karakteres
   indoklással. A végállapot egyirányú és utána megváltoztathatatlan.
5. Az evidence megőrzi a `resolution`, `createdByRole`, `reviewedByRole` és
   `reviewedAt` auditmezőket.
6. `SOURCE_REVIEW` tétel csak akkor lehet `VERIFIED`, ha legalább egy evidence
   tartozik hozzá, és mindegyik:
   - `reviewState = RESOLVED`;
   - nem üres döntési indokot;
   - review-szerepkört és review-időpontot őriz.
7. A DRAFT revízió, a szülő tétel és az evidence módosító parancsai azonos
   sorrendű adatbázis-sorzárakat használnak. Párhuzamos létrehozás, módosítás,
   törlés vagy véglegesítés ezért nem írhat egy már lezárt tétel vagy revízió
   után; az elkésett művelet stabil 409 választ kap.
8. A szülő tétel `REJECTED` döntése nem követeli meg az evidence-ek
   `RESOLVED` állapotát. Így a hibás vagy nem alkalmazható forrást indokoltan,
   auditálhatóan le lehet zárni.

## Jóváhagyási hash kompatibilitás

Az éles előtti történeti v1 hash-boríték még a supplementary tételeket sem
tartalmazta, és a manufactured evidence relációt sem töltötte be. A v1
projekció ezért pontosan ezt a régi borítékot reprodukálja; még egy üres
`supplementaryItems` kulcsot sem ad hozzá. Az új `REVIEW_REQUESTED` és
`APPROVED` auditok
`contentHashSchemaVersion = 2` értéket kapnak; a v2 projekció már a döntési
indokot, a létrehozó és review-szerepkört, valamint a review-időpontot is
kriptográfiailag köti. A komponens-materializálás az approval auditban tárolt
verzióval ellenőrzi újra a tartalmat.

## Kiterjesztés gyártott tételekre

Ugyanez az invariáns vonatkozik minden `ManufacturedItem` forrásbizonyítékára.

- Evidence review:
  `PATCH /api/production/production-orders/{projectKey}/revisions/{revision}/manufactured-items/{itemId}/evidence/{evidenceId}/review`
- A create parancs csak `UNVERIFIED` vagy `REVIEW` evidence állapotot fogad.
- `ManufacturedItem → VERIFIED` csak legalább egy, teljesen auditált és kivétel
  nélkül `RESOLVED` evidence mellett lehetséges.
- A régi, reviewer-audit nélküli végállapotokat a migráció `REVIEW` állapotba
  nyitja vissza; a korábbi `VERIFIED` szülőket szintén karanténozza. Ha az
  érintett rendelés már `REVIEW` állapotban volt, a migráció `DRAFT` állapotba
  nyitja vissza, különben a kizárólag DRAFT-on futó javító parancsokkal nem
  lehetne feloldani a karantént. Ez supplementary oldalon a már eleve `REVIEW`
  (MANUAL is) és a `SOURCE_REVIEW + VERIFIED`, manufactured oldalon a
  `CANDIDATE`, `REVIEW` és `VERIFIED` eseteket fedi. A korábbi review audit
  megmarad.
- A rendelés review/approval kapuja és a komponens-snapshot forrásvalidációja
  a szülőállapottól függetlenül újra ellenőrzi az evidence-invariánst.
- A komponens-snapshot létrehozása és `VERIFIED` review-ja a revízió összes
  source-derived tételére futtatja az aggregate kaput. Egy karanténos tétel
  tehát akkor sem kerülhető meg, ha az explicit kalkulátor-payload kihagyja.
  Ez különösen a legacy v1 approvaloknál fontos, amelyek hash-borítéka még
  teljesen kihagyta a supplementary ágat.

## Stabil hibakódok

- `source_review_item_evidence_required`
- `source_review_item_evidence_unresolved`
- `supplementary_item_evidence_not_found`
- `supplementary_evidence_review_final`
- `supplementary_item_requires_draft`
- `supplementary_item_review_final`
- `manufactured_item_evidence_required`
- `manufactured_item_evidence_unresolved`
- `manufactured_item_evidence_not_found`
- `manufactured_evidence_review_final`
- `component_source_evidence_unresolved`

## Következmények

- A frontend evidence-soronként mutathat döntési műveletet és auditot.
- A tétel elfogadása szerveroldalon is fail-closed.
- A stabil 404/409 hibakódok a supplementary mutation/review és a component
  snapshot create/review OpenAPI-válaszaiban gépileg enumeráltak. A component
  hibák `details` mezője öt, egymást kizáró `oneOf` alakot dokumentál:
  row-level evidence, aggregate revision, source-reference, profile-conflict
  és state.
- A review nem jelent gyártási kiadást, alkatrészképzést vagy munkacsomagot.
- A közös, olvasható order-revision readiness projekció külön következő szelet
  marad; a review és approval írási kapu már közvetlenül ugyanazt a
  source-evidence invariánst ellenőrzi.

## Sikerfeltétel

- Döntetlen evidence mellett a `SOURCE_REVIEW → VERIFIED` kérés 409.
- Minden evidence indokolt `RESOLVED` döntése után ugyanaz a kérés sikeres.
- `REJECTED` evidence mellett a tétel nem verifikálható, de indokoltan
  elutasítható.
- Evidence- vagy tétel-végállapot nem írható felül.
- Karanténos approved revízión a snapshot `VERIFIED` review 409, a
  `REJECTED` döntés viszont sikeresen és auditáltan lezárható.
- A valódi PostgreSQL sorzár-versenytesztek igazolják az evidence → parent,
  parent → update/delete és parent → revíziófagyasztás szerializációját.
- Docker/PostgreSQL integrációs teszt, build és OpenAPI route-coverage zöld.
