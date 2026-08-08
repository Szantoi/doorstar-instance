# DSFLB-13 — operátori felületpromóció

## Cél

A Flow Lab adatait olyan bemutatófelületen kell megjeleníteni, amelyet egy
üzemi dolgozó középfokú végzettséggel önállóan megért. Az első képernyőnek nem
az integráció bizonyítékát, hanem a gyártási terv jelentését kell elmondania:

1. melyik tervet látja;
2. ellenőrzött-e a terv;
3. átkerült-e már a munkalapra;
4. milyen sorrendben következnek a munkalépések; és
5. van-e rögzített változás vagy akadály.

## Termékdöntés

A külön Doorstar Flow Lab alkalmazás jó irodai mintáját — áttekintés,
állapotkártyák, érthető munkasorrend és egyértelmű következő információ —
átvesszük a Doorstar projekt-kötött nézetébe. Nem ágyazzuk be a Flow Lab
alkalmazást, mert az más adatforrást és saját, nem produkciós authority-határt
használ. A Doorstar nézet továbbra is csak a saját, szerződéses read modeljét
olvassa.

## Információs rétegek

| Elsőként látható | Csak `Technikai ellenőrzési adatok` alatt |
| --- | --- |
| Terv állapota, munkalapi átvétel, munkalépések sorrendje, állomás, mennyiség, tervezett idő és emberi nyelvű akadály | Snapshot-, forrás- és materializációs kulcsok; UUID-k; hash-ek, fingerprint-ek, motor- és mapping-verziók; creator/reviewer principalok; nyers finding-, blocker- és dependency-kódok; korrelációs kulcsok és nyers eltéréspayloadok |

Kötelező, egyszeri jelzés: `Bemutató · csak megtekintés · mintaadat`.
Ez nem írja felül a szerveroldali jogosultsági határt, csak világossá teszi a
felhasználónak, miért nincs szerkesztőgomb.

## Nyelvi szabályok

| Kerülendő alapnézetben | Használandó |
| --- | --- |
| snapshot | terv / tervváltozat |
| evidence | ellenőrzött gyártási terv |
| readiness | terv állapota |
| materializáció / provenance | terv átvétele a munkalapra |
| immutable graph | munkalépések sorrendben |
| append-only eltérésnapló | változások |
| cursoros lista / typed payload / pin | nem jelenik meg alapnézetben |

Az alap-szöveg 14 px vagy nagyobb, a fő munkalépés és a fő státusz ennél is
nagyobb. A státusz soha nem csak színnel kommunikál.

## Elfogadási feltételek

- A projektoldalról a belépési pont neve `Gyártási terv megnyitása`.
- A Flow Lab route továbbra is csak GET kéréseket indít és nem küld böngészői
  identity-headert.
- Nincs review-, materializációs, eltérésíró vagy általános munkalap-módosító
  vezérlő.
- A munkalépés-lista emberi névvel, sorszámmal, állomással, mennyiséggel,
  tervezett idővel és az előző lépés érthető leírásával jelenik meg.
- Az üres és hibaállapotok a technikai infrastruktúra részletei nélkül,
  egyszerű magyarul jelennek meg.
- Az auditadat megmarad vizsgálhatóan, de alaphelyzetben összecsukott.

## Következő határ

Ez a felületpromóció nem nyit írási jogosultságot. Az autentikált review és
materializáció továbbra is DSFLB-12, az OIDC/JWT és név szerinti reviewer
policy után.
