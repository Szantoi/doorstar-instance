# DSCONV-09 — Doorstar vállalatközi kézfogás pilot

- **Szerep:** backend/frontend
- **Prioritás:** critical
- **Státusz:** blocked
- **Függőség:** `DSCONV-GATE-HANDSHAKE`, `DSCONV-03`, `DSCONV-05`, `DSCONV-06`
- **Platformforrás:** JoineryTech `B2B-09` publikált conformance artifact
- **Jelleg:** fogyasztói integráció és pilot; platformimplementáció tilos

## Cél

Bizonyítani, hogy a Doorstar egy valós műhelyre szabott SpaceOS instance-ként a
közös Collaboration protokollon át tud munkacsomagot kiadni egy másik demo
vállalatnak, miközben mindkét fél a saját állapotait kezeli és csak a számára
engedett információt látja.

## Pilot forgatókönyv

1. A Doorstar tenant egy meglévő projekt/epik elemre hivatkozva munkacsomagot
   állít össze egy demo partner tenant számára.
2. A felajánlás rögzíti a scope-ot, határidőt, deliverable/proof követelményt,
   visibility policy-t és a pontos terms revision hash-t.
3. A partner saját bejelentkezéssel látja a beérkező ajánlatot, de Doorstar-belső
   mezőket, más projektet és más tenant adatait nem.
4. A partner elfogad, visszautasít vagy — ha a platformverzió támogatja — új
   revisiont kér.
5. Elfogadás után a partner `InProgress`, majd `Submitted` állapotot állít és
   dokumentum/teljesítési bizonyíték referenciát ad át.
6. A Doorstar módosítást kér vagy elfogadja a teljesítést.
7. Mindkét fél nézetében egyezik az agreement/work package ID, revision hash és
   eseménysorrend, miközben a mezők actor-policy szerint redaktáltak.
8. Attacker tenant, revoked grant, stale revision, replay és duplicate mutation
   minden esetben fail-closed.

## Doorstar tulajdon

- Doorstar terminology/brand és route-kompozíció;
- platformsemleges Project/FlowEpic adapter konfigurációja;
- demo partner tenant és szintetikus, személyes/üzleti titkot nem tartalmazó seed;
- Doorstar-specifikus work-package template és visibility policy;
- platform generált kliens/bundle fogyasztása;
- pilot Playwright/UAT és runbook.

## JoineryTech/SpaceOS tulajdon — itt tilos javítani

- agreement/work package aggregate és állapotgép;
- participant grant, authz és RLS;
- terms canonicalization, hash és acceptance evidence;
- exchange envelope, outbox/inbox és replay;
- OpenAPI/event schema és Collaboration UI package belseje.

Platformhiba esetén a pontos contract-verzióval, correlation ID-val és minimális
reprodukcióval vissza kell adni a JoineryTech owning tasknak.

## Mutációs határ

- Doorstar instance descriptor, pack/template/policy konfiguráció;
- Doorstar composition app publikus modulregisztrációja;
- saját adapterkonfiguráció és generált kliens-fogyasztás;
- szintetikus seed, Playwright/E2E és runbook;
- ez a tasknapló.

Tiltott: sibling repository, platform package forrása, kézi API DTO, cross-tenant
DB írás, trusted `X-Role`/`X-Station` vagy tenant header.

## Kötelező platform input

```yaml
platform_commit: <sha>
collaboration_package: <id@version-or-digest>
openapi_sha256: <hash>
event_schema_sha256: <hash>
terms_schema_sha256: <hash>
conformance_runner: <version>
security_verdict: PASS
contract_verdict: PASS
e2e_verdict: PASS
```

## Elfogadási kritériumok

- [ ] Nincs platformforrás-másolat vagy lokális handshake-lifecycle.
- [ ] A Doorstar és partner külön hitelesített tenant/user contexttel fut.
- [ ] Offer/accept/start/submit/change-request/complete fő út zöld.
- [ ] Revision hash és event sequence mindkét fél nézetében egyezik.
- [ ] Partner csak a policy szerint engedett mezőt/dokumentumot látja.
- [ ] Attacker tenant és másik work package nem látható.
- [ ] Revoked grant, stale ETag/revision, replay és duplicate negatív út zöld.
- [ ] A UI Doorstar arculatú, de a közös Collaboration package-et fogyasztja.
- [ ] Playwright, contract check, a11y és UAT reviewer verdict PASS.

## Validáció

- instance descriptor/schema validation;
- package lock/digest és OpenAPI hash ellenőrzés;
- backend adapter integration szintetikus host/guest/attacker fixture-rel;
- Playwright külön browser contexttel mindkét félhez;
- platform conformance runner Doorstar konfigurációval;
- log/tracing/reconciliation smoke payload-szivárgás nélkül.

## Stop / eszkaláció

- A gate hiányzó vagy eltérő hash-e esetén nem indulhat implementáció.
- Cross-tenant adatszivárgás azonnali P0 blocker.
- Valós partner, valós szerződés, külső aláírás/időbélyeg vagy production deploy
  külön emberi, security és jogi kapu.
- Ha a platform contract Doorstar use case-et nem tud semleges adapterrel kezelni,
  nem készül Doorstar-fork; a hiány visszakerül JoineryTechbe.

## Végrehajtási napló

_Kitöltendő: Doorstar HEAD/dirty state, platform artifactok, konfiguráció,
tesztparancsok, eredmények, ismert gapek._

## Átadási bizonyíték

_Kitöltendő: platform YAML, pilot videó/report, security/contract/UAT verdict,
következő biztonságos lépés._

