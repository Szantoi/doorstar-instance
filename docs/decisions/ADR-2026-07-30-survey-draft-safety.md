# ADR — Felmérési piszkozat és mentetlen módosítások védelme

**Dátum:** 2026-07-30  
**Státusz:** elfogadott  
**Érintett terület:** Doorstar frontend, felmérési munkatér

## Kontextus

A felmérés több ajtópozíció terepi adatait egyetlen rendelési revízióban
szerkeszti. A backend jelenleg teljes DRAFT revízió-`PUT` műveletet biztosít,
pozíciónkénti részmentést és concurrency tokent nem.

A korábbi felület csak a véglegesítés pillanatában mentett, majd ugyanabban a
hibaágban próbálta `SURVEY_COMPLETED` állapotba léptetni a revíziót.
Háttér-refetch azonos revízió mellett is újrainicializálhatta a helyi
pozíciótömböt, a navigáció pedig figyelmeztetés nélkül eldobhatta a munkát.

## Döntés

- A lokális draft pozíciónként követi a mentetlen módosítást.
- Pozícióváltás nem ment automatikusan és nem dob el adatot.
- Külön „Piszkozat mentése” művelet küldi a teljes DRAFT revíziót. Ez nem
  workflow-átmenet.
- A véglegesítés két explicit lépés:
  1. dirty draft mentése;
  2. csak sikeres mentés után az intake-stage léptetése.
- A két kérés hibája külön kommunikálódik. Sikeres PUT és sikertelen
  stage-váltás után a felület nem állíthatja, hogy az adat nem mentődött.
- Azonos `revision.id` refetch nem írhatja felül a lokális draftot.
- Mentetlen állapotban a data-router `useBlocker` védi a belső navigációt,
  `beforeunload` pedig a frissítést, bezárást és külső navigációt.
- Sikeres terminális művelet explicit bypass után navigálhat.
- A Pozíció 360° az adatgazda munkatérre a konkrét pozícióazonosítóval
  mélylinkel.

## Következmények

- A terepi munkát nem veszélyezteti egy ablakfókusz miatti query-refetch.
- A felhasználó látja, mely pozíciókon van még helyi, nem mentett adat.
- Nem keletkezik minden mező- vagy pozícióváltásnál nagy teljes-replacement
  kérés.
- A kliensoldali védelem nem oldja meg a párhuzamos böngészők lost-update
  problémáját. A backend revision concurrency token / ETag továbbra is
  szükséges.
- A teljes SPA navigációs védelemhez a belépési pont `createBrowserRouter` és
  `RouterProvider` alapú; az alkalmazás saját route-fája ettől változatlan.

## Ellenőrzés

- Unit teszt fedi a belső navigáció „maradok / elhagyom” ágait és a
  cancelable `beforeunload` eseményt.
- Élő böngészőben ellenőrzött a pozíció-mélylink, dirty jelzés, elvetés
  utáni szerverérték és a navigációs megerősítés.
