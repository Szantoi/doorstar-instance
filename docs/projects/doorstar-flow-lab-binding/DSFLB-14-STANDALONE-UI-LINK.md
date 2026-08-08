# DSFLB-14 — Önálló Flow Lab felület belépési pontja

**Állapot:** telepítve; hitelesített böngészős elfogadásra vár
**Gazdák:** Flow Lab (szintetikus web/API) + Üzemi Tábla (belépési pont)
**Kapcsolódik:** DSFLB-10, DSFLB-11, DSFLB-13

## Cél

A Doorstar Flow Lab munkateréből legyen egyértelműen megnyitható a Flow Lab
saját tervezői felülete, de a két rendszer ne olvadjon össze.

Az új felület a különálló, szintetikus Flow Lab bemutató. Nem a Doorstar
FlowLabPlanSnapshot materializációjának szerkesztője, nem importfelület és nem
gyártási authority.

## Megállapodott alak

- Link: `https://doorstar.asztalostech.hu/flow-lab-demo/`.
- A Doorstar felületből új lapon nyílik: `target="_blank"` és
  `rel="noopener noreferrer"`.
- A link csak a determinisztikus read-only demo buildben szerepel; normál
  buildben nem maradhat benne.
- Iframe, credential-átadás, identity-header átadás és Doorstar API-proxy
  nincs.
- A célfelületnek meglévő Basic Auth mögött, kizárólag szintetikus adatokkal,
  csak GET/HEAD útvonalakkal kell futnia.

## Előfeltételek

1. A Flow Lab SyntheticDemo alkalmazás app-szinten kizárja a workbook-,
   editable- és író útvonalakat.
2. Az nginx a cél route-ot a meglévő vhostban, Basic Auth mögött, egy
   loopback-only `4622` szolgáltatásra teszi ki.
3. A telepítési artefaktum nem hordoz normál Flow Lab konfigurációt, forrásadatot
   vagy workbookot.

## Elfogadás

- A Doorstar demo buildben a hivatkozás látszik, a normál buildben nincs benne.
- A link új tabon megnyitja a Flow Lab szintetikus felületét.
- Anonymous kérés 401, hitelesített GET 200, hitelesített író metódus 405.
- A két felület bármelyike visszaállítható a másik módosítása nélkül.

## Kiadási állapot (2026-08-08)

- A Doorstar read-only demo `ff82448` commitja a VPS-en ki van építve a
  determinisztikus `build:readonly-demo` paranccsal.
- A különálló Flow Lab API `127.0.0.1:4622`-n fut; az nginx publikus útvonalai
  névtelen GET-re `401`-et, minden író metódusra `405`-öt adnak.
- A kiadási csomag és a proxy mögötti olvasó végpontok ellenőrzöttek; valós
  workbook, adatbázis és termelési authority nincs a bemutatóban.
- A Basic Auth hitelesítő adatát nem olvastuk, nem rögzítettük és nem
  változtattuk meg. Emiatt egyetlen elfogadási lépés maradt: egy meglévő,
  jogosult felhasználói böngészőben a négy magyar nézet betöltésének igazolása.

Részletes, nem titkos kiadási bizonyíték:
[DSFLB-14 standalone UI link evidence](evidence/DSFLB-14-STANDALONE-UI-LINK-20260808.md).

## Következő termékes lépés

DSFLB-12 marad a következő authority-növelő increment: az OIDC/JWT és név
szerinti reviewer-policy után, nem a bemutatólink révén nyílnak meg az esetleges
review/materializáció műveletek.
