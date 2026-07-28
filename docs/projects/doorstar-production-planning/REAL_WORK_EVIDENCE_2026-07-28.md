# Valós Doorstar gyártási munkák — tervezési bizonyíték kivonat

**Forrás (nem kerül repóba):** `C:\Users\szant\Doorstar Kft\Gyártás-Dokumentumok - Dokumentumok\2026\07_Július`

## Vizsgált minta

- Kilenc `02 - Folyamatok.xlsm` munkafüzetet olvastunk, csak olvasási módban.
- A kivonat nem tartalmaz ügyfélnevet, személynevet, címet, rajzot vagy gyártási specifikációt.
- Minden megfigyelt munkafüzet beállítás-verziója: `00.0.01`.

## Valós overload-jelölt

A cache-elt `Tervezettidő` terhelések dátum/részleg szerinti összevonásában a
legnagyobb jelölt a fóliázónál 68,91 tervezett munkaóra egy napon
(`2025-06-27`). Egyetlen nyolcórás erőforrás mellett ez túlterhelés.

Végleges platform-fixture csak a fóliázó akkori kapacitásának, műszakjának és
lezárás/karbantartás/túlóra kivételeinek megerősítése után készülhet. A meglévő
naptárdraft csak CNC-re vonatkozik, ezért nem vetíthető át erre a példára.

## Függőségi bizonyíték és korlátja

- A tényleges folyamatokban 233 `SS` és 171 `FS` kapcsolat, valamint 1, 3, 4
  és 5 egységnyi lag fordul elő.
- 413 művelet `partial release` mezője minden esetben `1` (100%).

Ez igazolja az FS/SS és lag valós használatát, de nem döntheti el a
`partialRelease` prioritását vagy a naptár-tudatos perc-képzését: nincs valós,
100% alatti példa.

## Hiányzó bemenetek

1. Standard verzióváltás-pár: a fájlok eltérő megrendelések, nem ugyanazon
   standard előtte/utána revíziói.
2. Overload-fixture lezárása: fóliázó kapacitás, műszak és kivételek.
3. CNC naptárdraft jóváhagyása.
4. Partial-release üzleti szabály vagy 100% alatti valós példa.

## Dátumfigyelmeztetés

A 2026 júliusi könyvtárban tárolt munkafüzetek cache-elt tervei 2025
június–júliusra mutatnak. Regressziós/overload példának alkalmasak, de nem
aktuális gyártási naptárak vagy élő kapacitásadatok.
