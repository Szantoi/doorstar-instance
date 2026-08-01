# ADR — Dokumentumverziók és változatlan kiadási hivatkozások

**Dátum:** 2026-07-30  
**Státusz:** elfogadott  
**Érintett feladat:** DSORD-08

## Döntés

Az `OrderDocument` továbbra is csak metaadat- és tárhelyhivatkozás: bináris
fájlt nem másolunk az adatbázisba. Minden új dokumentumváltozat új rekord;
egy `documentFamilyKey` összefogja a változatokat, a
`supersedesDocumentId` pedig egyirányú, nem elágazó láncot alkot.

Egy dokumentum a revízió egészéhez és tetszőleges `OrderPosition` rekordhoz
is kapcsolható. A pozíciókapcsolat nem mezőbizonyíték: az evidence továbbra is
egy konkrét érték forrását mutatja, a dokumentumkapcsolat pedig azt, hogy a
dokumentum az adott ajtópozíció műszaki dokumentációjának része.

Kiadáskor `OrderDocumentReleaseReference` rögzíti a külső/majdani
`issuedWorkPackageKey`, a dokumentum konkrét rekordazonosítója, SharePoint
verzióazonosítója és SHA-256 értéke által meghatározott pillanatképet. A
hivatkozás csak `APPROVED` revízióból és hash-elt dokumentumból jöhet létre;
nincs módosító vagy törlő API-ja. A tényleges munkacsomag-aggregate későbbi
feladatban kap saját modellt, de ugyanazt a stabil kiadási kulcsot használja.
