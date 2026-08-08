# DSFLB-14 — különálló Flow Lab UI link: kiadási bizonyíték

**Dátum:** 2026-08-08
**Állapot:** telepítve; hitelesített, kézi böngészős elfogadásra vár.

## Telepített kapcsolat

- Doorstar belépési pont: `ff82448`, `build:readonly-demo` build-markerrel.
- Cél URL: `https://doorstar.asztalostech.hu/flow-lab-demo/`.
- Kapcsolat: új lap, `noopener noreferrer`; nincs iframe és nincs hitelesítő,
  principal- vagy szerepfejléc-továbbítás.
- Cél szolgáltatás: külön `doorstar-flow-lab-standalone-demo.service`, csak
  `127.0.0.1:4622` listenerrel.

## Megfigyelt bizonyíték

| Ellenőrzés | Eredmény |
| --- | --- |
| névtelen UI és API GET | `401` (Basic Auth) |
| publikus POST/PUT/PATCH/DELETE | `405` |
| belső szintetikus source-set, terv- és ütemezési GET-ek | `200` |
| belső író endpoint | `405` |
| nem publikált preview endpoint | `404` |
| workbook és normál appsettings a külön kiadásban | nincs |

Az eredeti Basic Auth credential változatlan maradt, és semmilyen formában nem
került Gitbe vagy kiadási dokumentumba. Emiatt az utolsó emberi elfogadási jel
egy jogosult böngészős betöltés; a mechanikai és adatvédelmi határ ettől
függetlenül bizonyított.
