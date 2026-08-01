# ADR — Konfigurációvezérelt műszaki katalógus

**Dátum:** 2026-07-30  
**Státusz:** elfogadott  
**Érintett feladat:** DSORD-03

## Döntés

A Doorstar műszaki választék egy verziózott backend JSON-konfigurációból
származik. Az `OrderPosition` a stabil katalóguskulcsokat tárolja
(`doorTypeKey`, `finishKey`, `glassKey`, `hardwareKeys`, `wallSolutionKey`,
`materialKey`, `machiningKeys`, `technicalNotes`), nem frontend-szöveget.

A backend update útvonalon ellenőrzi minden nem üres kulcs létezését és a
konfigurációból visszatölti a jelenlegi, kompatibilis megjelenítő mezőket
(`productType`, `surface`, `wallTreatment`, `glazing`,
`glazingSpecification`). A konfiguráció API-n olvasható, ezért a felmérési UI
ugyanazokat az értékeket jeleníti meg. Régi/importált DRAFT-ok, amelyekhez még
nincs katalóguskulcs, szerkeszthetők maradnak; a későbbi műszaki jóváhagyási
kapu már a kulcsokat használhatja.

Ez nem kalkulációs vagy gyártási szabályrendszer: az adott katalógusverzió csak
a jóváhagyott későbbi generátor bemenetének része.
