# DSCONV-06 — Doorstar composition app közös modulcsomagokból

- **Szerep:** frontend
- **Prioritás:** P1
- **Státusz:** pending (dependency-blocked)
- **Függőség:** DSCONV-03, DSCONV-04, DSCONV-05
- **Mutációs határ:** `src/uzemi-tabla-web` composition refaktor és package fogyasztás
- **Tiltott scope:** platform package forkolása, backend/domain módosítás,
  runtime Module Federation, UX-redesign

## Cél

A Doorstar alkalmazás ne önállóan újraimplementált portál legyen, hanem közös
SpaceOS shell/ERP csomagokból és Doorstar instance packból összeálló composition
app. Az Üzemi Tábla egyedi UX-e Doorstar-modulként megmarad.

## Megvalósítási lépések

1. Igazítsd a peer dependency verziókat a platform compatibility manifesthez.
2. Fogyaszd a platform shell/core/UI és szükséges ERP package-eket.
3. Az Instance Context vezérelje a route-ot, menüt, brandet és permissiont.
4. A Doorstar oldalakat publikus Doorstar module entrypoint mögé zárd.
5. Távolítsd el a platformprimitívek lokális másolatait bizonyított ekvivalencia után.
6. Tartsd meg a route- és vizuális baseline-t regressziós teszttel.

## Teszt- és bizonyítékterv

```powershell
cd src/uzemi-tabla-web
npm run build
npm test
npm run lint
```

Kötelező dependency boundary teszt, Instance Context permission matrix és fő
képernyőkre vizuális/screenshot regresszió.

## Elfogadási kritériumok

- [ ] Nincs platformforrás-másolat vagy cross-repo relatív import.
- [ ] A composition root csak modul-listát és instance-konfigurációt ad.
- [ ] Disabled/unentitled modul route-ja nem érhető el.
- [ ] Üzemi Tábla fő UX és mobilhasználat regresszió nélkül működik.
- [ ] React/Router/Query singleton és peer dependency konfliktus nincs.

## Stop / eszkaláció

Package compatibility vagy platform publikus API hiánya esetén a hiba a
JoineryTech felé contract-gapként megy vissza; lokális fork tilos.

## Végrehajtási napló

_Az agent tölti ki._

## Átadási bizonyíték

_Dependency gráf, build/test/lint, route és vizuális diff._
