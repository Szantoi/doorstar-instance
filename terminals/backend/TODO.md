# Backend TODO — prioritási sorrend

## Következő

- [x] Reprodukálható helyi UX-referencia projekt: stabil
      `UX-REFERENCE-RETROFIT-001`, két order revision, három current pozíció,
      auditált dokumentum/evidence, reviewed falpanel és tartozék, `VERIFIED`
      ComponentSnapshot + OperationPlanSnapshot. Loopback/séma/confirmation
      guard, projektkulcs-szintű idempotens újraépítés, célteszt és build zöld.

- [x] DSORD-11: a backend faipari domainmegfelelési auditja dokumentálva a
      `DO3-DOMAIN-CONFORMANCE` milestone-ban. Részletes baseline:
      `docs/projects/doorstar-order-data-chain/DSORD-11-WOODWORKING-DOMAIN-AUDIT.md`.
      Friss Docker/Postgres teljes suite: 36 fájl / 119 teszt zöld. Az audit
      read-only volt; implementációs szerződést vagy üzleti adatot nem módosított.
- [x] `OrderSupplementaryItem` modell és API két rögzítési móddal:
      `SOURCE_REVIEW` evidence-alapú ritka/importált tételhez, valamint
      `MANUAL` általános kézi rögzítéshez. Kilincs, zártest, lábazat, takaró-
      és egyéb Sales-tartozék külön lane-ben marad; forrásos mennyiség nem
      következtethető, csak explicit értékből tárolható. A teljes
      update/review/delete életciklus, auditindok, evidence-jelenlétkapu és
      rendelési review-blocker elkészült.
- [x] P0: SOURCE_REVIEW és manufactured evidence külön review-életciklusa.
      `VERIFIED` csak legalább egy és minden soron teljesen auditált `RESOLVED`
      evidence mellett lehetséges. A tranzakciós revízió-/tételzár, legacy
      karantén, hash-v2, aggregate component-source kapu, gépi OpenAPI
      hibakódok/`details` oneOf, VERIFIED-409/REJECTED-success ágpár,
      régi-sémás migration truth table és valódi lock-versenytesztek is
      elkészültek.
- [x] P0: teljes order-revision readiness read model és
      `GET .../revisions/:revision/readiness`. A source-derived aggregate
      és a position-evidence predicate már közös a review, approval,
      component-snapshot és document-release kapuban. Az exact read endpoint
      strukturált, ownerRole/entity/detail blockerrel, canonical szerepkörre
      szűrt valós parancsokkal és egy determinisztikus nextActionnel elkészült.
      A stale exact revision minden folytatást tilt; a superseded dokumentumlink
      a közös review-predikátumban is blokkol. Component/operation profil-,
      katalógus-, séma- és hash-staleness az eredeti authority evaluatorokból
      jön. A production release PlanningProposal/IssuedWorkPackage hiányában
      explicit `NOT_AVAILABLE`. Páros read-only projekt-workflow projekció is
      kész; planning/work package/6-stage/handover `CONTRACT_REQUIRED`. Mindkét
      multi-read projekció egyetlen `REPEATABLE READ` snapshotban fut, közös
      transaction clienttel és exact/latest snapshot-invariánssal; párhuzamos
      revision- és component-snapshot write-race regresszió védi.
- [x] P0: `OrderPositionEvidence` ugyanazt az egyirányú review-életciklust,
      reviewer principal/idő/indok auditot és final-state guardot kapja, mint a
      source-derived evidence. Minden nyitott/elutasított releváns sor blokkolja
      a review/approval/materialization kaput; új approval hash-sémaverzió köti
      a position evidence-et és dokumentum–pozíció kapcsolatot. Elkészült a
      revision-first zár, `revision_version_conflict`, cascade-retention guard,
      legacy karantén, hash-v3, v1/v2 kompatibilitás, OpenAPI enum, valódi
      PostgreSQL concurrency és migration truth table. Teljes suite: 38 fájl /
      126 teszt zöld.
- [ ] P0: DRAFT mezőtulajdon sales/survey/technical parancsokra bontva,
      projekt-hozzárendelés ellenőrzéssel és optimista konkurenciavédelemmel;
      stale írás: `409 revision_version_conflict`. Minden revision writer ugyanazt
      a row-lock/CAS protokollt használja. A hash-t érintő full PUT, intake-stage,
      dokumentum/link és position-evidence writer revision-first zárása, továbbá
      az evidence-review kontra review/approval versenyteszt elkészült; a
      szerepkör szerinti mezőtulajdon és általános kliens concurrency token maradt.
- [ ] P0: valódi, hiteles Doorstar principal és separation of duties az order
      review/approval, evidence resolution, component/operation review és
      dokumentum-/work-package release parancsokhoz. Hiányzó identity legyen
      fail-closed; az `X-Role` + implicit `vezeto` csak demo-kompatibilitás és
      nem production audit.
- [x] P0: azonnali átmeneti guard minden legacy Task-materializáló és
      laundering út elé: `POST /tasks`, project/epic attach `PATCH /tasks/:id`,
      bulk schedule és step issue. A guard serializable, stabil 409 blocker
      contractot ad, megőrzi a validation/role/not-found/planning/no-op
      precedenciát, vegyes bulk kérésnél sem ír részlegesen, és valódi
      supersession lock-race teszt védi. PlanningProposal és valós immutable
      IssuedWorkPackage hiányában szándékosan nincs success path.
- [ ] P0: az üzemi kiadás szerveroldalon is maradjon fail-closed, amíg nincs
      APPROVED rendelés, VERIFIED komponens-snapshot, jóváhagyott terv,
      immutábilis `IssuedWorkPackage` és dokumentumverzió-lineage.
      A jelenlegi `OrderDocumentReleaseReference.issuedWorkPackageKey` csak
      szabad string referencia, nem hiteles IssuedWorkPackage authority; ezt a
      release-authority szeletben valódi FK/hash/állapot-életciklussal kell
      kiváltani.
- [ ] P0: autoritatív 6-STAGE runtime state machine. Közvetlen `stepIndex`
      ugrás helyett parancsalapú transition, kötelező predecessor/QC gate,
      actor és időbélyeg, jó/selejt mennyiség, nonconformance/rework és
      QUEUED→IN_PROGRESS→SHIPPING_READY projekció. A dependency modell kezeljen
      többes tok/ajtólap/vasalat/üveg összevezetést, és tiltsa a ciklust.
- [ ] DSORD-07: további importprofilok és emberi jóváhagyási workflow; nincs
      éles adatbázis-írás a jelenlegi határon túl.
- [ ] DSORD-05: a jóváhagyott és legfrissebb rendeléshez kötött, verziózott,
      idempotens explicit snapshot-határ elkészült, hash- és emberi
      review-kapuval. Nyitott rész: a felderítésből jóváhagyott, tesztelt
      Doorstar alkatrész-/szabászati képletprofilok és az ezekből számoló
      automatikus adapter.
- [x] DSORD-06 P0 authority-szelet: exact-revision, verziózott `OperationPlanSnapshot` authority a
      `2026-07-31_014_frontend-operation-workspace-contract.md` szerint:
      idempotens create, egyszer lezárható review, active profile/catalog/
      standard/resource fingerprint, többes dependency, technological /
      non-technological / natural folyamat, work instruction, QC checkpoint,
      evidence/quarantine és enumerált 409 blocker szerződés. VERIFIED
      OperationPlan sem gyártási kiadás. Build, OpenAPI 83 route, DSORD-06
      céltesztek 3/3, valódi create/review concurrency és izolált kétfázisú
      migrációs dry-run zöld. A legacy fail-closed guardhoz igazított board- és
      authority-tesztekkel az aktuális teljes backend suite 40 fájl / 129 teszt
      zöld.
- [ ] DSORD-06 automatikus bővítés: a formális DSORD-05 függőség lezárása után
      jóváhagyott Doorstar BOM-/műveletszabályok és tényleges normakatalógus
      köthető az explicit authority elé. RAG/legacy adat nem választhat
      standardot, normaidőt, resource mappinget vagy final review-t.

## DSORD-11 P1 faipari domainmélység

- [x] A survey readiness a tényleges kész falvastagságot (`openingDepthMm`),
      a konfigurációs `doorTypeKey` / `wallSolutionKey` / `glassKey` drivereket,
      legalább egy `SURVEY` dokumentumot és pozíciónként exact dokumentumlinket
      követel. Meglévő position evidence csak teljes, auditált `RESOLVED`
      állapotban enged lezárást; a kézi flow nulla evidence mellett is működik.
- [ ] Strukturált handing, handing convention, nézeti/nyitási tengely és
      kétoldali ajtólap-/tok-/borításfelület kerüljön a domainbe és az
      evidence/hash láncba.
- [ ] Workflow-fázisonként kötelező, aktuális és tartalmi hash-sel azonosított
      dokumentumcsomag vagy auditált kivétel; tetszőleges `OTHER` dokumentum ne
      teljesíthesse a review-kaput. Work package-enként egy document family
      egy aktuális verziója legyen kiadható.
- [ ] A műszaki katalógus kulcslistából verziózott kompatibilitási modellé
      bővüljön: méret, anyag/vastagság, finish, üveg, vasalat cikkszám és
      darabszám, oldalasság, megmunkálás, kölcsönös kizárás és alkalmazhatóság.
- [ ] Component snapshot BOM-completeness: minden releváns forrástétel minden
      kötelező CUT_PART/PURCHASED_PART sora, egysége és mennyisége legyen jelen;
      profilvezérelt, tesztelt kész→szabász mérettranszformáció és reviewkori
      aktív profil-/katalógus-staleness kapu szükséges.
- [ ] Kindfüggő `WallPanelSpec`, `FurnitureFrontSpec` és supplementary
      `PHYSICAL_GOOD/HARDWARE/SERVICE/NOTE` teljességi szabályok, kétoldali
      finish-, élenkénti élképzés-, furat-/kivágás-, SKU-, mennyiség- és
      mértékegység-követelménnyel.
- [ ] A kapacitás heatmap ne legyen planner authority. Későbbi szeletben
      verziózott műszaknaptár, gép- és emberkapacitás, setup, karbantartás,
      száradás/pihentetés, anyagmozgatás, foglalás és QC/nonconformance adatok
      szükségesek; a csendes 1 óra/task fallback nem használható kiadáshoz.

## Katalógus-karbantartás

- [x] Az igazolt fóliás értékek külön aktív `finishKey`-ként szerepelnek:
      Magnolia Supermatt Classic, Stone Grey Suedette Matt, Supermatt Kashmir.
- [ ] Festett RAL/NCS és furnér opciók konkrét választéka csak ellenőrzött
      gyártói forrás vagy Doorstar jóváhagyás után aktiválható.
