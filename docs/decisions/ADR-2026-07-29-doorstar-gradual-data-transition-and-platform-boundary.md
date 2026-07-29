# ADR — Fokozatos adatátállás és platformhatár

**Dátum:** 2026-07-29
**Állapot:** Elfogadva
**Döntéshozó:** Doorstar Kft. / Doorstar root

## Kontextus

A Doorstar jelenleg Excel-, PDF-, XLSM- és rajzforrásokkal dolgozik. Az új
rendszernek ezeket fokozatosan kell hasznosítania, miközben a napi Exceles
munka átmenetileg megmarad. A JoineryTech platform közös UI- és kontraktus-
eszközöket fog publikálni, de a Doorstarnak bármikor leválaszthatónak kell
maradnia.

## Döntések

1. **Az Excel/PDF/XLSM forrás megmarad.** A rendszer dokumentumbinárist nem
   másol, csak relatív hivatkozást és SHA-256 bizonyítékot tárol. XLSM makró,
   képlet és Power Query szerveren nem fut.
2. **Az átállás DRAFT-alapú.** A kiolvasható adatok új Projekthez tartozó
   `DRAFT`/`SURVEY_PENDING` revízióként kerülhetnek kizárólag a
   `doorstar_test` sémába. Ez nem jelent jóváhagyást, tervezést vagy gyártási
   kiadást.
3. **Eltérés és hiány visszajelzéssé válik.** Sales, felmérő és beépítő
   `OrderFeedback` rekordot hozhat létre; a műszaki előkészítés nyugtázza vagy
   lezárja. A jelzés nem módosítja az eredeti forrást.
4. **A méretek két fogalmat jelentenek.** A falnyílás
   szélesség × magasság × falvastagság, az ajtólap pedig külön
   szélesség × magasság × vastagság. A PDF-ben harmadik falnyílás-érték nem
   tölthető be ajtólapvastagságként.
5. **A Doorstar csak lazán kapcsolódik a JoineryTechhez.** Később fogyaszthat
   verziózott `@spaceos/portal-ui` csomagot és publikált kontraktusokat, de nem
   vehet át `portal-core` auth/tenant függőséget, forrás-submodule-t vagy
   dokumentálatlan végpontot.
6. **Platformcsomag átvételi kapu:** márka- és domain-semleges csomag,
   automatizált CI-őr, stabil importfelület, migrációs/rollback útmutató,
   changelog és federation-alapú támogatási útvonal szükséges.

## Következmények

- Az 24181-es minta `DSMR-24181` néven tesztsémában létezik, 12 pozícióval és
  `SURVEY_PENDING` állapotban.
- A következő adatfeltárképezési/import minta `DSMR-26148`; a vastagság- és
  színeltéréseket visszajelzésként kell megőrizni.
- A platformos UI-primitívek migrációja a publikált, ellenőrzött csomag után
  indul: megerősítések → gombok/státuszok → QueryGate → DataTable/Import Inbox.
