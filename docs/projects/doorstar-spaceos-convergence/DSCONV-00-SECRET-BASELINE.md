# DSCONV-00 — credential hygiene és valós Doorstar baseline

- **Szerep:** root/security
- **Prioritás:** P0
- **Státusz:** blocked — dokumentációs redakció és credential-rotáció emberi
  döntést igényel
- **Mutációs határ:** tracked dokumentáció redakciója, secret inventory és baseline-riport
- **Tiltott scope:** automatikus credential-rotáció, git history rewrite, deploy,
  üzleti kód

## Cél

A convergence ne induljon ismert credential-szivárgással vagy elavult
állapotképből. A tracked tudásindexben talált credential-anyag kerüljön
redaktálásra, használata legyen feltérképezve, a rotáció pedig explicit emberi
kapuval történjen. Ezzel együtt készüljön valós runtime- és tesztbaseline.

## Megvalósítási lépések

1. `git grep` segítségével leltározd a tracked secret/token/credential mintákat;
   az értékeket ne másold tasklogba.
2. Redaktáld a dokumentációt placeholderre és secret-kezelési hivatkozásra.
3. Állapítsd meg, mely tokenek aktívak; készíts rotációs listát ownerrel.
4. Root jóváhagyás után rotáld az aktív credentialt; history rewrite külön döntés.
5. Rögzítsd a backend/FE HEAD-et, verziókat, route-számot, DB-migrációt,
   build/testet, staging/prod health-et és deploymechanikát.
6. Egyeztesd a régi `docs/projects/TASKS.yaml` állításait a valós állapottal.

## Teszt- és bizonyítékterv

```powershell
git grep -l -I -E "token|secret|api[_-]?key|password"
cd src/production-service; npm run build; npm test
cd ../uzemi-tabla-web; npm run build; npm test; npm run lint
```

Az éles health ellenőrzés read-only; a secretrotáció kifelé ható művelet, ezért
root jóváhagyását a taskban rögzíteni kell.

## Elfogadási kritériumok

- [ ] Tracked dokumentumban nincs plaintext credential.
- [ ] Az érintett credential aktív/inaktív státusza és ownerje ismert.
- [ ] Az aktív credential rotációja bizonyított vagy `human_blocked`.
- [ ] A valós build/test/deploy baseline fájl- és HEAD-hivatkozással rögzített.
- [ ] A legacy softlaunch taskok elavult állításai tételesen jelöltek.

## Stop / eszkaláció

History rewrite, credential revoke/rotate és production restart csak emberi
jóváhagyással. Értéket logba vagy chatbe írni tilos.

## Végrehajtási napló

### 2026-07-18 — kezdeti baseline, redaktált bizonyítékokkal

**Munkafa és verziók**

- Lokális Doorstar HEAD: `f51419eeb902b194e32aa63897e24263bda2f88a`
  (`docs(datahaven): update EPIC-DOORSTAR-SOFTLAUNCH status + record TODOs`).
- Az induláskor már jelen volt módosított `docs/knowledge/INDEX.md`, valamint
  az `AGENTS.md`, a brief/design és a convergence dokumentációk untracked
  állapotban. Ezeket nem formáztuk vagy mozgattuk; a baseline-futtatás nem
  tett hozzá új alkalmazáskód-módosítást.
- Lokális toolchain: Node `v24.13.0`, npm `11.6.2`.
- Backend: `@doorstar/production-service@0.1.0`, Prisma migration:
  `20260715210936_init`; a `prisma migrate status` szerint az adatbázis séma
  naprakész.
- Frontend: `@doorstar/uzemi-tabla-web@0.1.0`.

**Redaktált secret inventory**

| Tétel | Bizonyíték | Állapot | Felelős / következő lépés |
|---|---|---|---|
| Tracked dokumentációs credentialek | `docs/knowledge/INDEX.md` és 3 Knowledge Service dokumentum redaktálva; értékkiírás nélküli scan PASS | `redacted` | Technikai felelős: Doorstar root/security. A dokumentáció csak runtime secret hivatkozást tartalmaz. |
| Knowledge-service futásidejű credential-konfiguráció | `src/knowledge-service/config/agents.yaml`: 1 plaintext master-token minta; a forrás módosítása ezen task tiltott scope-ja | `active_unverified` | Technikai felelős: Doorstar root/security; jóváhagyó: emberi projekt-owner. Rotáció és config-migráció külön, jóváhagyott security change legyen. A 3460-as health endpoint `200`, de credential-értéket nem küldtünk vagy naplóztunk; ezért aktív/inaktív döntés nincs kimondva. |
| Keycloak mintaparancs | `docs/projects/KEYCLOAK_DOORSTAR_CONFIG.md`: 1 `{SECURE_RANDOM_32}` placeholder | `inactive_placeholder` | nincs rotációs teendő; placeholder marad. |

Nem került credentialérték tasklogba vagy parancskimenetbe. History rewrite,
credential revoke/rotate és éles restart nem történt.

### 2026-07-18 — dokumentációs redakció és rotációs change-előkészítés

- A jóváhagyott dokumentációs redakció elkészült a tudásindexben, a Knowledge
  Service MCP auth leírásában és két történeti migrációs példában.
- A tracked dokumentáció értékkiírás nélküli secret scan-je: **PASS**.
- Elkészült a külön, emberi kapus végrehajtási terv:
  [`DSCONV-00-CREDENTIAL-ROTATION-PLAN.md`](DSCONV-00-CREDENTIAL-ROTATION-PLAN.md).
- Futtatásidejű credential, secrets-store, szolgáltatáskonfiguráció és deploy
  változatlan; a tényleges rotáció továbbra is `human_approval_required`.

**Build, teszt és runtime bizonyíték**

| Ellenőrzés | Eredmény |
|---|---|
| `production-service: npm run build` | PASS |
| `production-service: npm test` | PASS — 1 fájl, 3 teszt |
| `uzemi-tabla-web: npm run build` | PASS |
| `uzemi-tabla-web: npm run lint` | PASS |
| `uzemi-tabla-web: npm test` | FAIL — nincs tesztfájl; ez ismert coverage-gap, nem rejtett zöld eredmény |
| Lokális PostgreSQL | PASS — `doorstar-production-db` fut, `5462` porton |
| Lokális API health | `UNAVAILABLE` — a backend nincs lokálisan elindítva, csak a DB fut |
| Production API health | PASS — `http://127.0.0.1:4610/healthz` `200` |
| Production process identity | PASS — systemd `MainPID=1733150`, a `:4610` listenert ugyanaz a Node PID szolgálja ki |
| Production deploy HEAD | `4d0d1458eb4f5692637a50946b6763a42148e77d`; eltér a lokális HEAD-től |

Reprodukciós parancsok (a futtatás napja: 2026-07-18, Europe/Budapest):

```powershell
cd src/production-service; npm run build; npm test; npx prisma migrate status
cd ../uzemi-tabla-web; npm run build; npm test; npm run lint
ssh doorstar-vps 'systemctl is-active doorstar-production-service.service'
ssh doorstar-vps 'systemctl show -p MainPID --value doorstar-production-service.service'
ssh doorstar-vps 'sudo ss -tlnp | grep :4610'
ssh doorstar-vps 'curl -fsS -o /dev/null -w "%{http_code}" http://127.0.0.1:4610/healthz'
```

**Észlelt eltérések és legacy-egyeztetés**

1. A 4610-as production listener minden interfészre (`*:4610`) bindol. Ez
   eltér az `AGENTS.md` localhost/nginx-only állításától; a tűzfal-szabályt
   nem módosítottuk. A DSCONV-07 deployment hardening során ellenőrizendő.
2. A régi `docs/projects/TASKS.yaml` M1–M6 lánca Keycloak/Kernel/Joinery
   platformtulajdonú feladatokat állít pendingnek. A `docs/projects/EPICS.yaml`
   ezt már helyesen `blocked` legacy epic-ként kezeli; Doorstar repositoryban
   nem diszpécselhető és nem implementálható.
3. A régi M6 „production deployment pending” állítása nem írja le a jelenlegi
   Üzemi Tábla valós állapotát: a Doorstar production-service éles és health
   checkje zöld. A legacy által említett külön platformszolgáltatások állapotát
   ez a mérés nem igazolja.

**Leállási feltétel / átadás**

Ez a task a dokumentációs credentialek redakciója és az aktív runtime
credentialek emberileg jóváhagyott rotációs döntése nélkül nem zárható. A
következő saját repositorybeli fejlesztési feladat ettől függetlenül a
read-only `DSCONV-01` capability mapping lehet; a platform gate-ek zárva
maradnak.

### 2026-07-18 — független review

**Verdict: BLOCKED megerősítve.** A külön reviewer változtatás nélkül
ellenőrizte a naplót és nem talált credentialértéket benne. A reviewer
megerősítette a lokális és production HEAD-et, az 4610-as MainPID/listener
egyezést és a health `200` eredményt. Nyitva hagyta a két plaintext
dokumentációs érték redakcióját, valamint a runtime credential tényleges
aktivitásának emberi owner-döntését; ezek nélkül a task nem minősíthető késznek.

### 2026-07-21 — rotáció-mechanika feltárás, root döntés: elhalasztva

- Megerősítve: `src/knowledge-service/config/agents.yaml` továbbra is
  plaintext tartalmazza a master_token-t és mind a 7 terminál tokent — csak a
  *dokumentáció* (`MCP_AUTH_TOKENS.md`) lett redaktálva 07-18-án, a tényleges
  futó konfig nem.
- Új felismerés, ami nem szerepelt a korábbi bejegyzésekben: a fájl saját
  kommentje szerint ennek a master_token-nek egyeznie kell a
  `~/.claude/settings.json` `MCP_AUTH_TOKEN` értékével — ez viszont **géphez
  kötött, repo-független, globális** Claude Code beállítás, amit a gépen futó
  összes terminál-session használ MCP-hitelesítésre, nem csak a Doorstar
  szigeté. A rotáció blast radius-a tehát nagyobb, mint amit a 07-18-i
  bejegyzések feltételeztek.
- Root döntés: a rotációt **nem indítjuk el most**. A `DSCONV-00` `blocked`
  marad; a `DSCONV-00-CREDENTIAL-ROTATION-PLAN.md` szerinti előfeltételek
  (secrets-store hely, jóváhagyott karbantartási ablak, titkosított backup,
  health-baseline) egyike sem teljesült, és a fenti globális-config-függőség
  miatt ezeket külön kell megtervezni, mielőtt bármilyen generálás/írás/
  restart történne.
- Nem történt credential-generálás, fájlírás vagy service-restart.

## Átadási bizonyíték

Secret scan: **PASS a tracked dokumentációra**. A runtime credential rotációja
és aktív státuszának igazolása továbbra is emberi kapun blokkolt — a 07-21-i
feltárás szerint a blokkoló ok most már a globális
`~/.claude/settings.json`-fal megosztott master_token, nem csak a hiányzó
secrets-store terv. A redaktált inventory, a HEAD-ek és a build/test/health
bizonyíték a végrehajtási naplóban szerepel.
