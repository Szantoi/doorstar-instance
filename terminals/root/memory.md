# Doorstar Root memória

## Tartós döntések

- A Doorstar ügyfél-sziget: nem építi és nem birtokolja a platformmagot.
- A Scheduling platformmodul neve `spaceos.scheduling`; az API útvonala
  `/api/scheduling/v1`.
- Doorstar felelőssége: saját frontend, OpenAPI-ból generált TypeScript-kliens,
  `doorstar.scheduling-import` adapter, fixture-ök és kontraktus-review.
- Platform felelőssége: C# mag, tenant-feloldás, RLS-bizonyíték, entitlement,
  OpenAPI-kontraktus, publikáció és sandbox.
- 2026-07-28 döntés: a PLAN-03 M1 részlegesen elindítható; a `partialRelease`
  precedence és a naptár-tudatos küszöbidő számítása külön policy, Doorstar
  pontosításig nem véglegesíthető.

## Operatív tudnivalók

- A root mailbox: `terminals/root/inbox/`; itt érkeznek a Doorstar-rootnak
  címzett üzenetek.
- A federation mailbox szigetközi továbbításra való; üzenet-formátuma
  frontmatterrel és SHA-256 tartalomhassel védett.
- Az Üzemi Tábla éles címei: `https://doorstar.asztalostech.hu` és
  `https://doorstar.joinerytech.hu`.
- Frontend újraépítés után a VPS-en ellenőrizni kell a `dist/` nginx-olvasási
  jogosultságait.
- A Doorstar production-service formális API-szerződése a
  `src/production-service/openapi/production-service.openapi.json`; a futó
  szolgáltatás `GET /openapi.json` alatt ezt a build-assetet adja vissza.
- A `2026/07_Július` valós munkafüzeteiből a fóliázó 68,91 órás napi
  terhelési jelöltje kinyerhető. A fájlok ugyanakkor csak `00.0.01`
  beállítás-verziót és kizárólag 100%-os partial-release értékeket mutatnak.
- A munkafüzet üzleti referencia, nem implementációs másolási cél. A
  `folyamatOperationPreflight` a Power Query `Folyamat` eredményét ellenőrzött
  műveletdrafttá teszi; csak jóváhagyott, minősített standardot enged át.
- A teljes üzleti adatfolyam megerősítve: Gyártásmegrendelő rögzíti a
  projektet, a Kalkulátor alkatrészt/kész- és szabászati méretet képez, a
  Folyamatok műveletet és munkaidőt tervez, a Kiíró üzemnek adja ki az adatot.
- A Doorstar gyártási láncának kötelező kernelkapcsolata van: Project,
  FlowEpic és Task csak publikált platform-contracton, revíziózott
  kézfogással használható. Doorstar nem birtokolhat vagy másolhat kernel
  életciklust.
- A `spaceos-modules-scheduling` C# modulban a Task és a teljes Kernel scope
  értékobjektumai elkészültek. Ezek nem helyettesítik a kézfogást: csak a
  tárolható, ellenőrizhető hivatkozási alapot adják a későbbi contracthoz.
- A Doorstar root platformállapot-jelentést tett a root outboxba a
  `99adad0` (kernel scope), `5f403d0` (kapacitásfoglalás) és `2da68b1`
  (verziózott standard/import-karantén) C# előrehaladásról. A fogyasztói
  adapter M3 OpenAPI + sandbox nélkül továbbra sem indíthat importot vagy
  ütemezést.
- A Doorstar `folyamatOperationPreflight` teljes adatvonalat kér:
  megrendelés-kulcs+revízió, Kalkulátor alkatrész-kulcs+revízió, Folyamat
  kulcs+revízió és jóváhagyott standard. Így a későbbi platformimport
  visszavezethető marad a négy munkafüzetes láncon át.
- Az atomikus `planningImportBatchPreflight` a standard- és Folyamat-ellenőrzés
  közös Doorstar adapterhatára. Csak a standard-preflightből ready állapotú
  norma kapcsolható művelethez; a batch kulcsa+revíziója és a batchen belüli
  függőség-előd kötelező. Ez staging-formátum, nem platform-import vagy
  ütemező.
- A partial-release üzleti policy az ADR-069 §4-ben jóváhagyott; a
  `releaseThresholdPercent` naptár-tudatos értelmezését továbbra is a platform
  C# resolver valósítja meg, Doorstar nem másolja.
- Az ADR-069 §4 üzleti döntés megszületett: partial release mindig felülírja
  az FS alsó korlátot, későbbi eredmény esetén pedig
  `partial_release_delays_fs_start` warning kötelező. A százalékot munkaidő
  arányában, az előd erőforrás-naptárán a C# platform számolja; Doorstar ezt
  nem másolja. A korábbi `9DC80...` hash hibásan módosított v1 fájlra utalt;
  azt a v1/v2 korrekció érvénytelenítette.
- Input-pack immutabilitás: `v1` nem írható át. Pin:
  `D7D84A3E54016108CDDB9E1686DF108D0A1C1DBA39855ADA0628ABF3C87BC837`.
  A partial-release bővítés önálló `v2` (`schemaVersion: 2.0.0`) fájlban él,
  pinje `7BB8A9243D19E1A5E28979CBBE795E8A99AC259B4F24A63A65C8BF572F822A55`.
- A fixture pineket a `doorstar-planning-input-pack.manifest.json` és a
  `npm run verify:planning-input-pack` ténylegesen ellenőrzi. A tesztsuite is
  azonos tartalomhassel ellenőrzi a v1/v2 fájlokat; módosítás csak tudatos
  verzió- és hash-frissítéssel engedhető át.
- Doorstar saját operációs API-ja: `/healthz` kizárólag liveness, `/readyz`
  pedig adatbázis-készültséget is ellenőrző readiness. A readiness nem
  Planning- vagy kernelkapcsolat, ezért nem sérti a JoineryTech platformmag
  ownershipét.
- A `/readyz` HTTP-teszt seam-je explicit `runDatabaseProbe` app-dependency;
  csak tesztelhetőségi határ. Productionben a Prisma `SELECT 1` fut. Hiba
  esetén a kliens mindig csak `{ status: "not_ready" }` választ kap.
- A Scheduling M3 read-only kontraktus 2026-07-28-án publikálva érkezett a
  federation inboxba. Forrás: `Szantoi/spaceos-modules-scheduling` `main`,
  `docs/openapi.yaml`; OpenAPI 3.1, `/api/scheduling/v1`, SHA-256:
  `3fc6c57d4ec6d768c432bb023e5ca98f4a960c70f7331f482e276729adfc0756`.
  A 8 read-endpoint, az opak `scope { projectId, epicId, taskId }`,
  `standardRevision`, `sourceRevisions` és a
  `partial_release_delays_fs_start` warning publikus szerződésrészek.
- Doorstar ebből kizárólag generált TypeScript klienst és shadow fogyasztást
  készíthet. A Tailnet-only sandbox base URL, demo tenant és Keycloak-token
  igénylése még nincs meg; ezekig nincs élő hívás. Auth: kernel-api audience
  Bearer JWT, szerveroldali `enabled_modules` gate; idegen tenant 404.

## Munkaritmus

- Az automatikus root mailbox-heartbeat 2026-07-28-án a kevés feladat miatt
  törölve lett; ellenőrzés csak szükség esetén történik.
- Éles, törlő vagy kifelé ható lépés előtt emberi jóváhagyás kell.
