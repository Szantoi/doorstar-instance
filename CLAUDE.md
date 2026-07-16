# CLAUDE.md — Doorstar Sziget (Ügyfél)

> A Doorstar sziget a **Doorstar Kft. specifikus implementációja**.
> JoineryTech platformra épül, ajtógyártás-specifikus testreszabásokkal.

---

## SZIGET IDENTITY

**Név:** Doorstar
**Szerep:** Customer-specific Implementation
**Ügyfél:** Doorstar Kft. (ajtógyártó)
**Port range:** 3460-3461
**tmux prefix:** ds-

---

## FELELŐSSÉGI KÖR

| Feladat | Leírás |
|---------|--------|
| 6-STAGE Production | Szabászat → Megmunkálás → Felületkezelés → Összeszerelés → Csomagolás → Kiszállítható |
| Doorstar OpenAPI | Production workflow REST API |
| Cabinet-VPS Bridge | Federation kommunikáció |
| Custom UI | Doorstar-specifikus dashboard |

---

## TERMINÁLOK

| Terminál | Szerep |
|----------|--------|
| **root** | Ügyfél-specifikus döntések, Cabinet kommunikáció |
| **conductor** | Production koordináció |
| **monitor** | Health-monitoring, eszkaláció-figyelés |
| **backend** | 6-STAGE workflow implementáció |
| **frontend** | Doorstar UI testreszabás |

---

## 6-STAGE PRODUCTION WORKFLOW

```
1. SZABÁSZAT (Cutting)
   │
   ▼
2. MEGMUNKÁLÁS (Machining)
   │
   ▼
3. FELÜLETKEZELÉS (Surface Treatment)
   │
   ▼
4. ÖSSZESZERELÉS (Assembly)
   │
   ▼
5. CSOMAGOLÁS (Packaging)
   │
   ▼
6. KISZÁLLÍTHATÓ (Ready for Delivery)
```

---

## KAPCSOLAT MÁS SZIGETEKKEL

```
JoineryTech (platform)
    │
    │ platform modules
    ▼
Doorstar (ügyfél)
    │
    │ federation
    ▼
Cabinet VPS (partner)
```

**Federation inbox:** `terminals/federation/inbox/`
**Federation outbox:** `terminals/federation/outbox/`

---

## SERVICES

| Service | Port | Leírás |
|---------|------|--------|
| Knowledge Service | 3460 | MCP API (frozen) |
| Üzemi Tábla (uzemi-tabla-web) | 4611 | Production whiteboard UI |

> Port 3461 (`config/federation.yaml`'s `datahaven` slot) marad szabadon a
> fleet-szintű Datahaven agent-management dashboardnak — az Üzemi Tábla nem
> azonos vele és nem foglalja el a portját (korábban tévedésből
> `datahaven-web` néven futott, 3461-en; ez javítva lett).

---

## VPS-HOZZÁFÉRÉS (PUBLIKÁLÁS)

SSH-alias: `doorstar-vps` (már be van állítva a `~/.ssh/config`-ban).
Kulcs: `~/.ssh/doorstar_deploy_key` — dedikált deploy-kulcs, csak ehhez a
projekthez (projektenkénti kulcs → egyenként visszavonható).

Belépés / távoli parancs:
```bash
ssh doorstar-vps '<parancs>'
```

VPS: 109.122.222.198 (Debian 13, 6 vCPU / 15 GB RAM), user `gabor`,
passwordless sudo. Tailneten is elérhető: 100.82.133.87 (privát, ha a
Tailscale fut).

### A projekt a VPS-en
- Repo: `/opt/doorstar` (`git@github.com:Szantoi/doorstar-instance.git`, `main`)
- A VPS-nek van GitHub SSH-hozzáférése → `git pull` közvetlenül megy a szerveren.
- A doorstar sziget nexus-service-e külön fut: `/opt/nexus-doorstar` (port 3460).

**Státusz (2026-07-16):** `/opt/doorstar/src` a szerveren jelenleg üres, és
nincs se nginx site-ja, se systemd unitja — a doorstar még nincs publikálva,
ez lesz a projekt első valódi deployja.

### Publikálás a gépen: nginx
Élő minták: `/etc/nginx/sites-available/{datahaven,joinerytech,spaceos,nexus-knowledge}`
```bash
sudo nano /etc/nginx/sites-available/doorstar
sudo ln -s /etc/nginx/sites-available/doorstar /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```
Doorstarnak MÉG NINCS nginx site-ja — ezt kell létrehozni.

### Port-választás
Foglalt: 22, 80, 443, 3000, 3456, 3458, 3460, 3466, 5050, 5173, 5174,
5432, 5433, 6379, 8001, 8080, 9000, 9001, 11434, 49222.
Ellenőrzés indítás előtt:
```bash
ssh doorstar-vps 'ss -tln | grep <port>'
```

### FONTOS (drágán tanult lecke)
Deploy után ellenőrizd, hogy tényleg az ÚJ kód fut — egy bennragadt régi
processz csendben tovább szolgálhat ki:
```bash
ssh doorstar-vps 'sudo ss -tlnp | grep <port>'   # a PID egyezzen a service MainPID-jével
```

A tűzfal (ufw) alapból zárt: publikus eléréshez a 80/443 megy nginxen át,
saját portot külön engedélyezni kell (`sudo ufw allow <port>/tcp`).

### Élesítve (2026-07-16): Üzemi Tábla első deploy
- **URL:** https://doorstar.asztalostech.hu és https://doorstar.joinerytech.hu
  (mindkettő ugyanazt az appot szolgálja ki, wildcard DNS már be volt állítva).
- **SSL:** a megosztott `joinerytech.hu` Let's Encrypt tanúsítvány bővítve
  (`certbot certonly --expand`) a két új aldomainnel — NEM külön cert.
- **Backend:** `/opt/doorstar/src/production-service`, systemd unit
  `doorstar-production-service.service`, port 4610 (csak localhost-ról/
  nginxről érhető el, ufw nem engedi kívülről).
- **DB:** dedikált Postgres 16 Docker-konténer (`doorstar-production-db`,
  `docker-compose.prod.yml`), port 5462, `127.0.0.1`-re kötve, saját
  generált jelszóval (`.env`-ben, nincs repóban).
- **Frontend:** `/opt/doorstar/src/uzemi-tabla-web`, `npm run build` →
  statikus fájlok, nginx szolgálja ki közvetlenül (`root` direktíva),
  `/api/` proxyzva a backendre.
- **nginx site:** `/etc/nginx/sites-available/doorstar`.
- **FONTOS — jogosultság csapda:** `/opt/doorstar` alapból `750`
  (csak `gabor` olvashatja) — az `nginx` (`www-data` user) nem tudott
  belépni, `500`-at adott, amíg `chmod o+x` nem lett rárakva
  `doorstar`/`src`/`uzemi-tabla-web`-re és `chmod -R o+rX` a `dist/`-re.
  **Minden újra-buildnél (`npm run build`) ellenőrizni kell, hogy ez a
  jogosultság megmaradt-e** — a Vite build új fájlokat hoz létre, amik
  nem feltétlenül öröklik ezt.
- Demo adatokkal (`prisma:seed`) él, ahogy az ügyfél igényelte.

---

## EPIC STÁTUSZ

**EPIC-DOORSTAR-SOFTLAUNCH:**
- Target: 2026-09-30
- Progress: 85%
- Frissítve: 2026-07-16

| Milestone | Státusz |
|-----------|---------|
| Domain spec | ✅ APPROVED |
| Architecture | ✅ APPROVED |
| OpenAPI draft | ⏳ Nincs formális OpenAPI dokumentum (a REST API maga kész és fut) |
| Implementation | ✅ Üzemi Tábla (production board) — tábla, kanban, terhelés, projektek/munkalap, mind kész, mock-audittal ellenőrizve |
| Testing | ⏳ Backend vitest suite fut (3 teszt) + kiterjedt Playwright-alapú manuális ellenőrzés minden funkción; nincs formális teszt-lefedettségi cél |
| Soft Launch | ⏳ Első éles deploy megtörtént (lásd lent) demó adatokkal, megrendelőnek elküldve — a valós ügyféladatra állás még hátravan |

### Élő állapot (2026-07-16)
Az Üzemi Tábla éles, a megrendelőnek elküldve:
- https://doorstar.asztalostech.hu
- https://doorstar.joinerytech.hu

Részletek a VPS-HOZZÁFÉRÉS szekcióban fent.

### KÖVETKEZŐ LÉPÉSEK (TODO)
- [ ] Megrendelői visszajelzés bevárása, majd döntés: mikor váltunk demó
      adatról valós ügyféladatra (jelenleg Koroknai/Derby/LFA/Tormay/Matyi
      demó projektekkel fut).
- [ ] Formális OpenAPI spec/dokumentum a production-service REST API-hoz
      (a FELELŐSSÉGI KÖR szerint ez a sziget egyik felelőssége).
- [ ] Munkamenet-oldal elmaradt részletei (alacsony prioritás, tudatosan
      elhalasztva a gap-remediation során): per-lépés Kiadás/Munkalap/
      Visszavon/sorrendezés gombok, "(epik nélkül)" virtuális sor.
- [ ] `myStation`/szerepkör-ellenőrzés jelenleg csak egy egyszerű
      `X-Role`/`X-Station` fejléc-alapú védőháló, nem valódi
      authentikáció — ha a sziget valaha bejelentkezést kap, ezt le kell
      cserélni.
- [ ] Minden jövőbeli frontend rebuildnél a VPS-en ellenőrizni kell az
      `/opt/doorstar/.../dist` jogosultságát (lásd a VPS-HOZZÁFÉRÉS
      szekció "FONTOS — jogosultság csapda" pontját).

---

_Doorstar Sziget — Ajtógyártás Production Workflow_

## MINŐSÉGI ELVÁRÁSOK

Kötelező: **[QUALITY.md](QUALITY.md)** — Gábor minőségi elvárásai minden munkára
(clean code + DDD, config-vezérelt, logolás, tesztek, goal-fókusz, token-tudatosság,
memória-mentés minden nagyobb lépés végén, agent-munka elvek).
