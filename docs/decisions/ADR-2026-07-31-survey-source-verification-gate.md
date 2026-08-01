# ADR — Felmérési forrás és strukturált adat külön kapuja

**Dátum:** 2026-07-31  
**Státusz:** elfogadott  
**Érintett terület:** rendelési adatlap, felmérési munkatér, production-service

## Kontextus

A DSMR-26148 forrásmappában egy Sales-megrendelés és egy kézzel kitöltött
felmérési kép található. A kontrollált tesztimport csak a Sales PDF-et és az
ütemterv adatát használta; a képi lap nem része a DSMR-26148 import-lineage-nek.
A Salesből származó két pozíció ezért strukturált forrásadatot tartalmaz, de nem
tekinthető igazolt felmérésnek.

A korábbi UI a pozícióméreteket feltétel nélkül „Felmért fizikai tények” címen
mutatta. A backend `SURVEY_COMPLETED` kapuja csak a kitöltött mezőket vizsgálta,
így egy Sales-adatokkal kitöltött revízió felmérési dokumentum és pozíciókapcsolat
nélkül is továbbléphetett.

## Döntés

1. A fájl jelenléte, a strukturált mező és az ellenőrzött felmérés három külön
   tény marad. Egyik sem következik automatikusan a másikból.
2. A rendelési összefoglaló alapértelmezett címe **Rögzített forrásadatok**.
   „Felmért” állítás csak a teljes felmérési kapu után jelenhet meg.
3. Nulla mezőszintű evidence esetén az UI mindig kimondja, hogy az adatok nem
   igazolt felmérési tények. Egy dokumentumkártya azt is megkülönbözteti, hogy a
   forrásfájl rögzítve van-e, illetve kapcsolódik-e pozícióhoz.
4. `SURVEY_COMPLETED` csak akkor engedélyezett, ha:
   - minden kötelező strukturált mező teljes, beleértve a kész falvastagságot
     (`openingDepthMm`);
   - van legalább egy `SURVEY` dokumentumverzió;
   - minden ajtópozíció közvetlenül kapcsolódik legalább egy ilyen verzióhoz;
   - ha van pozíció-evidence, minden sora teljes, auditált `RESOLVED` döntés.
5. A kézi felmérési folyamat miatt új evidence-sor nem kötelező. A regisztrált
   felmérési dokumentum és a közvetlen pozíciókapcsolat viszont kötelező. Evidence
   jelenléte esetén a hiányos audit blokkol.
6. A kapu szerveroldali authority. A frontend ugyanazokat a feltételeket előre
   jelzi, de a kliensoldali állapot nem jogosít workflow-átmenetre.
7. A meglévő `SURVEY_EXCEPTION_REVIEW` út marad az egyetlen felmérés nélküli
   továbblépési lehetőség; névvel és indoklással auditált emberi döntést igényel.

## Forrás és bizonytalanság

- A Sales PDF munkaszáma, tartalma és SHA-256 ujjlenyomata közvetlenül
  ellenőrzött.
- A képi lap DSMR-mezője üres. A 26148-as kapcsolatot a szülőmappa, valamint a
  vizuálisan egyező név és cím támasztja alá, ezért review-köteles forrásjelölt,
  nem automatikus workflow-authority.
- A kézírás pontos tartalma nem került automatikusan strukturált adatként
  elfogadásra.
- Faipari háttérállítás nem része ennek a döntésnek; a szerződés kizárólag a
  helyi forrás-, API- és workflow-bizonyítékokra épül.

## Következmények

- A DSMR-26148 `DRAFT / SURVEY_PENDING` marad, amíg a felmérési forrást ember
  nem regisztrálja, nem kapcsolja a megfelelő pozíciókhoz, és a strukturált
  adatokat nem zárja le.
- Egy JPG vagy PDF puszta regisztrálása nem lépteti előre a rendelést.
- A normál kézi felmérés végrehajtható marad mezőszintű import-evidence nélkül.
- A backend strukturált blokkoló részleteket ad, így a felület nem csak általános
  véglegesítési hibát mutat.

