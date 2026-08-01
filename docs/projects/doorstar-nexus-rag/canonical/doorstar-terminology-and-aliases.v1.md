# Doorstar belső szóhasználat és faipari szaknyelv

- Document ID: `doorstar.terminology-aliases`
- Version: `1.0.0`
- Valid from: `2026-07-31`
- Review status: `READY_FOR_HUMAN_REVIEW`
- Owner: `doorstar-root`
- Sensitivity: `INTERNAL`

## Hatókör

A fogalmak minősítése elkülöníti a faipari szaknyelvet, a Doorstar-belső
kifejezést, a szoftveres domainnevet és a review-köteles vagy örökölt aliast.

## Állítások

| Claim ID | Minősítés | Állítás | Forráshely és forráshash |
| --- | --- | --- | --- |
| TERM-001 | VERIFIED | A `CANONICAL` szakmai Doorstar-fogalom elsődleges UI- és dokumentációs címke; a `DOORSTAR_LOCAL` belső kifejezés definícióval és aliasszal használható; a `SYSTEM_TERM` kódban maradhat, de emberi felületen magyar címkét igényel. | SRC-DOMAIN-DOORSTAR-TERMINOLOGY-MD@sha256:2e7c42717d8cc8c111fb98e8a5645d11bd519ec649bf0254aafad26a7a8e305a#minositesek |
| TERM-002 | VERIFIED | A `REVIEW` jelentése forrás- vagy termékfüggő, ezért nem képezhet automatikusan végleges műszaki adatot; a `DEPRECATED` kifejezés csak keresési vagy importalias, új adatként nem keletkezhet. | SRC-DOMAIN-DOORSTAR-TERMINOLOGY-MD@sha256:2e7c42717d8cc8c111fb98e8a5645d11bd519ec649bf0254aafad26a7a8e305a#minositesek |
| TERM-003 | VERIFIED | A Doorstar többdimenziós méretsorrendje szélesség × magasság × vastagság vagy mélység, milliméterben; a harmadik dimenzió neve az objektumtól függ. | SRC-DOMAIN-DOORSTAR-TERMINOLOGY-MD@sha256:2e7c42717d8cc8c111fb98e8a5645d11bd519ec649bf0254aafad26a7a8e305a#kotelezo-meretsorrend |
| TERM-004 | VERIFIED | Az `FNY` Doorstar-belső alias falnyílásméretre; a harmadik érték dokumentált falvastagság vagy falkávamélység, és nem ajtólapvastagság. | SRC-DOMAIN-DOORSTAR-TERMINOLOGY-MD@sha256:2e7c42717d8cc8c111fb98e8a5645d11bd519ec649bf0254aafad26a7a8e305a#meret-oldal-es-megjelenesfogalmak |
| TERM-005 | VERIFIED | A `LAP` csak egyértelmű forrásstruktúrában jelöl ajtólapméretet; nem falnyílás- és nem ajtóegységméret. | SRC-DOMAIN-DOORSTAR-TERMINOLOGY-MD@sha256:2e7c42717d8cc8c111fb98e8a5645d11bd519ec649bf0254aafad26a7a8e305a#meret-oldal-es-megjelenesfogalmak |
| TERM-006 | VERIFIED | A Gyártásmegrendelés Doorstar-belső Sales–műhely átadódokumentum: kiinduló forrás, nem automatikusan végleges gyártásdokumentáció. | SRC-DOMAIN-DOORSTAR-TERMINOLOGY-MD@sha256:2e7c42717d8cc8c111fb98e8a5645d11bd519ec649bf0254aafad26a7a8e305a#uzleti-dokumentacios-es-rendszerfogalmak |
| TERM-007 | VERIFIED | A Kalkulátor alkatrész- és méretkalkulációs réteg, a Folyamatok művelet- és gyártástervezési réteg, a Kiíró pedig verziózott üzemi kiadás; egyik elnevezés sem használható a másik jelentésében. | SRC-DOMAIN-DOORSTAR-TERMINOLOGY-MD@sha256:2e7c42717d8cc8c111fb98e8a5645d11bd519ec649bf0254aafad26a7a8e305a#uzleti-dokumentacios-es-rendszerfogalmak |
| TERM-008 | VERIFIED | A falpanel külön gyártandó falborítási elem lehet; a bútorfront külön bútoripari termék; egyik sem ajtópozíció vagy egymás szinonimája. | SRC-DOMAIN-DOORSTAR-TERMINOLOGY-MD@sha256:2e7c42717d8cc8c111fb98e8a5645d11bd519ec649bf0254aafad26a7a8e305a#ajto-tok-es-kapcsolodo-termekfogalmak |
| TERM-009 | VERIFIED | A rendelési kiegészítő tétel `OrderSupplementaryItem`; nem feltétlen önállóan gyártott elem, és nem azonos a `ManufacturedItem` életciklusával. | SRC-DOMAIN-DOORSTAR-TERMINOLOGY-MD@sha256:2e7c42717d8cc8c111fb98e8a5645d11bd519ec649bf0254aafad26a7a8e305a#ajto-tok-es-kapcsolodo-termekfogalmak |
| TERM-010 | VERIFIED | A fizikai `SIDE_A` és `SIDE_B` oldal nem azonos a tokborítás `FIXED` és `ADJUSTABLE` szerepével, a pánt- vagy zároldallal, illetve a jobbos vagy balos oldalassággal. | SRC-ADR-TWO-SIDED-DOOR-APPEARANCE@sha256:5ef4d4e9f51165eeeb578b923fb52005d54d3dfe855639c6689794153ca16698#dontes |
| TERM-011 | VERIFIED | A legacy „mozgó oldal” kereshető alias; kanonikus feliratként az „állítható tokborítás” használandó, mert az elem beépítéskor állítható, nem használat közben mozog. | SRC-DOMAIN-DOORSTAR-TERMINOLOGY-MD@sha256:2e7c42717d8cc8c111fb98e8a5645d11bd519ec649bf0254aafad26a7a8e305a#ajto-tok-es-kapcsolodo-termekfogalmak |
| TERM-012 | VERIFIED | A „felület” egyetlen örökölt szövegmezőként nem teríthető automatikusan ajtólapra, tokra és tokborításokra; felületképzés, szín vagy dekor, hordozó és célfelület külön értelmezést igényel. | SRC-DOMAIN-DOORSTAR-TERMINOLOGY-MD@sha256:2e7c42717d8cc8c111fb98e8a5645d11bd519ec649bf0254aafad26a7a8e305a#meret-oldal-es-megjelenesfogalmak |
| TERM-013 | VERIFIED | A hatlépcsős workflow Doorstar gyártási makrofolyamat, nem a teljes technológiai műveleti terv; a gép vagy állomás, a művelet, a makroszakasz és a készültségi állapot külön fogalom. | SRC-DOMAIN-DOORSTAR-TERMINOLOGY-MD@sha256:2e7c42717d8cc8c111fb98e8a5645d11bd519ec649bf0254aafad26a7a8e305a#gyartasi-folyamat-es-allapotok |
| TERM-014 | VERIFIED | A „Kiszállításra kész” készültségi állapot; nem bizonyít tényleges kiszállítást, beépítést, átadás-átvételt vagy teljesítést. | SRC-DOMAIN-DOORSTAR-TERMINOLOGY-MD@sha256:2e7c42717d8cc8c111fb98e8a5645d11bd519ec649bf0254aafad26a7a8e305a#gyartasi-folyamat-es-allapotok |
| TERM-015 | OPEN | A `BKM_FIX`, `BKM_MOVING` és `TOK` gyártási méretkód pontos alkatrész- és referenciaél-jelentése profilrajz vagy jóváhagyott BOM nélkül nincs lezárva; automatikus célmező-megfeleltetésük tilos. | SRC-DOMAIN-DOORSTAR-TERMINOLOGY-MD@sha256:2e7c42717d8cc8c111fb98e8a5645d11bd519ec649bf0254aafad26a7a8e305a#nyitott-szakmai-dontesek |
| TERM-016 | OPEN | A blende helyi terméktípusai és a gyártott vagy rendelési kiegészítő osztályba sorolás feltételei még szakmai döntést igényelnek; falpanellel, tokborítással vagy takaróléccel nem azonosítható automatikusan. | SRC-DOMAIN-DOORSTAR-TERMINOLOGY-MD@sha256:2e7c42717d8cc8c111fb98e8a5645d11bd519ec649bf0254aafad26a7a8e305a#nyitott-szakmai-dontesek |
| TERM-017 | OPEN | A helyi nyitásirány-jelölési konvenció és a legacy értékek biztonságos felbontása oldalasságra és térbeli nyitásra nincs lezárva. | SRC-DOMAIN-DOORSTAR-TERMINOLOGY-MD@sha256:2e7c42717d8cc8c111fb98e8a5645d11bd519ec649bf0254aafad26a7a8e305a#nyitott-szakmai-dontesek |

## Minősítési jelmagyarázat

- `VERIFIED`: a verziózott terminológiai baseline-ban vagy elfogadott ADR-ben rögzített jelentés.
- `INFERENCE`: átmeneti, forrásolt értelmezés, amely még nem normatív.
- `OPEN`: profil-, BOM- vagy üzleti döntés hiányában nem automatizálható.
