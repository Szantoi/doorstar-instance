# ADR — Exact-revíziós művelettervi munkatér

**Dátum:** 2026-07-31  
**Státusz:** elfogadott frontend-határ; az autoritatív backend-szerződés nyitott  
**Érintett terület:** Doorstar rendelési adatút, irodai UI, DSORD-06

## Kontextus

A VERIFIED `ComponentSnapshot` után a projektcockpit eddig ugyanarra az
örökölt epik/task munkalapra vezette a műveleti és tervezési kaput. Ez
összekeverte a kézi segédadatot a még nem létező, verziózott műveleti
authorityvel, és nem adott kényelmes áttekintést arról, melyik alkatrészből
milyen gyártási útvonalnak kell majd készülnie.

A felhasználó által megadott nyers faipari korpusz read-only vizsgálata
megerősítette, hogy a technológiai sorrend alkatrészhez kötött, és külön
kezeli a műveletet, eszközt/szerszámot, gépet, csatlakozó alkatrészeket és
időnormákat. A korpusz elkülöníti a technológiai megmunkálást, a nem
technológiai mozgatást/tárolást/ellenőrzést és a természeti folyamatot, például
a kötést vagy száradást. A beállítási idő nem azonos a darabidővel. A vonalas
folyamatábra alkatrészenként eltérő útvonalat és többes összevezetési pontokat
ír le.

A munkautasítás és a minőség-ellenőrzési kritérium tervbeli, kontrollált
bemenet. A tényleges mérési eredmény, ellenőr, bizonyíték és nemmegfelelőségi
döntés csak a későbbi végrehajtási rétegben jöhet létre. A vásárolt alkatrész
pedig alaphelyzetben ellátási ágat — beszerzés, beérkező ellenőrzés,
tárolás/kittelés, szerelési átadás — igényel; nem automatikusan gyártási
megmunkálási útvonalat.

Elsődleges helyi források:

- `G:\Saját meghajtó\Tudástár\Faipar\Tudástár\faipari_gyartasszervezes_output\rag\rag_v002.md`, 1683–1697 és 4098–4137;
- `G:\Saját meghajtó\Tudástár\Faipar\Tudástár\faipari_muszaki_dokumentacio_rag.md`, 1066–1078 és 1207–1217;
- `G:\Saját meghajtó\Tudástár\Faipar\Tudástár\szega_futasi_tapasztalatok_2026-07-30.md`, 164–178 (OCR/RAG minőségi korlát).

## Döntés

Új, exact-revíziós irodai útvonal készül:

`/orders/:projectKey/revisions/:revision/operations`

A munkatér:

- csak a legfrissebb, APPROVED rendelési revízióhoz tartozó, approval-hash,
  snapshot-séma, aktív profil-, profil-fingerprint- és műszaki
  katalógus-fingerprint szerint aktuális VERIFIED
  `ComponentSnapshot` rekordot fogadja el bemenetként;
- az alkatrészsorokat kattintható, read-only forrásböngészőben mutatja;
- a gyártandó alkatrész műveleti útját és a vásárolt alkatrész ellátási útját
  külön, explicit ágnak tekinti;
- megmutatja a jövőbeli műveleti rekord szerkezeti mezőit, de nem generál
  műveletet, standardot, erőforrást, normaidőt vagy függőséget;
- külön mezőként kezeli a tételbeállítási időt, darabidőt, nem technológiai
  munkaidőt és természeti folyamat időtartamát;
- a munkautasítást és minőség-ellenőrzési tervet nem nevezi végrehajtási
  evidence-nek;
- a technológiai sorrendet tudatosan elválasztja a naptári
  kapacitástervezéstől és az üzemi kiadástól;
- az örökölt `Project.epics/EpicStep` adatot külön, összecsukható,
  read-only összevetési blokkban tartja. A legacy station, unitHours,
  planDate vagy task soha nem nyit ki kaput;
- az autoritatív create/review API hiányában látható, magyarázott és
  `aria-disabled` létrehozási akciót mutat.

A projektcockpit `OPERATIONS` kapuja erre az útvonalra vezet. A `PLANNING`
kapu többé nem navigál az örökölt munkalapra. A Kalkulátor footer szintén az
exact revíziós művelettervhez ad átjárást.

## RAG és authority-határ

A nyers korpusz és a Nexus találatai terminológiai, dokumentációs és UX
evidence-ként használhatók. Nem választhatnak automatikusan műveleti
standardot, gépet, szerszámot, tűrést, képletet vagy normaidőt. A korpusz OCR-
és modelljavított export; számérték csak eredeti oldalképpel és szakértői
review-val válhat autoritatívvá.

Runtime tudástári segítség később kizárólag ACL-es, auditált
`knowledge/search` web API-n keresztül kapcsolható a UI-hoz. Az MCP nem
böngészőalkalmazás-szerződés.

## Következmények

- A felhasználó már most megérti a ComponentSnapshot utáni következő
  folyamatot és megvizsgálhatja annak pontos bemenetét.
- A kliens nem hoz létre párhuzamos műveleti modellt vagy hamis készültséget.
- Amíg a backend nem publikálja a profil és műszaki katalógus aktuális
  fingerprintjét, az előzetes művelettervi bemeneti kapu zárva marad.
- DSORD-06 backend feladata marad a verziózott `OperationPlan`, a
  standardkatalógus, resource mapping, readiness, review és concurrency
  authority.
- A Planning/Gantt és az immutable `IssuedWorkPackage` továbbra is külön,
  zárt kapu.
