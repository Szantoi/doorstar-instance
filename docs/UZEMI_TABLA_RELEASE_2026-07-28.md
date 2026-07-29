# Üzemi Tábla — 2026-07-28 fejlesztési zárás

## Elkészült

- A Planning compatibility/preflight csomag célzott tesztparancsa és a
  frontend alap `npm test` parancsa is megbízhatóan fut.
- A production-service teljes, 40 műveletes OpenAPI 3.1 szerződést kapott;
  a `npm run verify:openapi` a tényleges Express-route-okkal ellenőrzi a
  driftet.
- A projekt-munkalap egyedi lépésenkénti **Kiadás**, **Munkalap**,
  **Visszavon** és sorrendezés kezelőket, valamint egy `(epik nélkül)`
  csak megtekinthető virtuális sort kapott.

## Üzleti korlátok

- Egyedi kiadáshoz tervezett nap és a közvetlen aktív előzmény már kiadott
  táblafeladata kell.
- Visszavonás nem lehetséges kész feladatnál, vagy ha egy későbbi kiadott
  lépés függ tőle.
- Egy epik lépéseinek sorrendje az első kiadás után zárolt: a kiadott
  függőségi lánc története nem írható át.

## Ellenőrzés

- `src/production-service`: `npm run build`, `npm run test:unit`,
  `npm run verify:planning-input-pack`, `npm run verify:openapi` — zöld.
- `src/uzemi-tabla-web`: `npm run build`, `npm test`, `npm run lint` — zöld.

Az adatbázist igénylő régebbi integrációs tesztcsomag nincs ebben az
ellenőrzésben: lokális PostgreSQL kapcsolat nélkül nem futtatható.
