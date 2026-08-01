# ADR — Claude terminálsémák Codex-agent és Nexus-identitás leképezése

- Dátum: 2026-07-31
- Státusz: elfogadva és élőben igazolva
- Érintett rendszer: Doorstar Codex, Doorstar Nexus RAG, Nexus-dev 3466

## Kontextus

A Doorstar terminálok szerepei korábban `CLAUDE.md` fájlokban éltek. A Codex
ezeket nem kezeli automatikusan külön custom agentként, és egyetlen közös Nexus
token nem ad szerepenként visszavonható vagy naplózható identitást. A Nexus
legacy tool-policy ráadásul `default: all` volt, így a lokálisan egytoolos bridge
megkerülésével a bearer token szélesebb eszközfelületet ért volna el.

## Döntés

Három külön réteget tartunk fenn:

1. `.codex/agents/*.toml`: Codex custom agent neve, leírása, utasítása,
   sandboxa és saját MCP credential-változója.
2. `terminals/<role>/AGENTS.md`: a terminál tartós, közvetlen Codex-szabályai;
   a `CLAUDE.md` kompatibilitási háttéranyag marad.
3. Nexus principal: külön bearer token és szerveroldali `agent_islands`
   leképezés, valamint fail-closed tool-policy.

| Terminál | Codex `name` | Nexus principal | Credential env | Sandbox |
| --- | --- | --- | --- | --- |
| root | `doorstar_root` | `doorstar-root-codex` | `DOORSTAR_NEXUS_ROOT_TOKEN` | workspace-write |
| conductor | `doorstar_conductor` | `doorstar-conductor-codex` | `DOORSTAR_NEXUS_CONDUCTOR_TOKEN` | workspace-write |
| monitor | `doorstar_monitor` | `doorstar-monitor-codex` | `DOORSTAR_NEXUS_MONITOR_TOKEN` | read-only |
| backend | `doorstar_backend` | `doorstar-backend-codex` | `DOORSTAR_NEXUS_BACKEND_TOKEN` | workspace-write |
| frontend | `doorstar_frontend` | `doorstar-frontend-codex` | `DOORSTAR_NEXUS_FRONTEND_TOKEN` | workspace-write |
| import-discovery | `doorstar_import_discovery` | `doorstar-import-discovery-codex` | `DOORSTAR_NEXUS_IMPORT_DISCOVERY_TOKEN` | workspace-write |

A bridge a `DOORSTAR_NEXUS_PRINCIPAL` nem titkos selectorból, belső fix
allowlisttel választ credential-változót. Ismeretlen principal, hiányzó saját
token vagy másik szerep tokenje esetén fail-closed; nincs közös fallback. A
Windows HKCU lookup csak allowlistből származó pontos változónevet olvas.

Mind a hat szerep egyedi MCP szerverkulcsot kap
(`doorstar_knowledge_<role>`). A telepített Codex CLI a custom instrukciót
betölti, de a child-only MCP additiont nem, az azonos kulcsú parent MCP-t pedig
nem írja felül. Ezért a hat szerepszerver a projekt alapszintű
`.codex/config.toml` fájlban is regisztrált; a custom TOML ugyanezt a contractot
őrzi a frissebb kliensekhez. Az explicit „csak a saját role-server” utasítás
megőrzi a helyes caller-attribúciót.

Mivel egy Codex task a hat alapszintű bridge-et technikailag látja, ez azonos
Windows user alatt nem kemény impersonation-védelem. Az összes token ugyanarra
a Doorstar szigetre és ugyanarra az egy read-only toolra korlátozott, ezért
rossz role-server választása nem jelent privilege- vagy adatscope-emelkedést,
csak auditcímke-hibát. Kemény client isolationhoz külön OS identity/secret
broker vagy olyan új Codex kliens kell, amely ténylegesen alkalmazza a
child-only MCP config layert.

A Nexus policyben a korábbi globális `all` és default `all` helyett a meglévő
standard Nexus-identitások explicit allowlistje áll. A hat Doorstar principal
egyetlen explicit engedélye a `search_knowledge`; az unlisted/default tool is
tiltott. Egyik principal neve sem `root`, mert az a legacy Nexusban RBAC-bypass.

Az indulási hibautat két réteg zárja. A Nexus TypeScript policy-evaluátora
hiányzó, olvashatatlan vagy hiányos első betöltéskor `none` alapértékkel indul,
és az ismeretlen runtime permission-értéket is tiltja. Az élő systemd unit
`ExecStartPre` validátora a szolgáltatás elindítása előtt ellenőrzi a YAML-t,
a globális `all` hiányát, a hat customer principal pontos knowledge-only
elhelyezését, a régi közös principal hiányát és a standard identitások
alap-hozzáférését. A validátor telepítése nem indította újra a szolgáltatást.

## Credential-életciklus

- Hat egymástól független, 32 random bájtból képzett token készült.
- A tokenek csak a Windows HKCU user environmentben és az élő, 0600 módú
  Nexus `agents.yaml` fájlban vannak.
- Az atomikus regisztráló stdinről olvas, tokenértéket nem logol, ütközést és
  formátumot ellenőriz, a backupot repón kívül 0600 móddal készíti.
- A régi közös `doorstar-codex` identitás és HKCU credential a sikeres hatos
  cutover után vissza lett vonva; a régi token live válasza HTTP 403.

## Codex-verzió megjegyzés

A projekt nem állít globális agent-concurrency kulcsot. A telepített
`codex-cli 0.144.5` még a régebbi `[agents.<role>]` sémát várja a gyökér
configban, miközben a friss manual már a
`agents.max_concurrent_threads_per_session` kulcsot dokumentálja. A custom
agentek önálló `.codex/agents/*.toml` sémája marad; a párhuzamosságot a runtime
alapértéke kezeli, amíg a kliensverziók egyeznek.

## Bizonyíték és újrafuttatás

```powershell
python scripts/validateCodexAgents.py
cd src/doorstar-production-mcp
npm test
npm run build
npm run verify:nexus-identities
```

Az élő mátrix mind a hat principalnál igazolta:

- `tools/list`: pontosan `search_knowledge`;
- `write_memory`, `complete_task`, `delete_skill`: HTTP 403 / JSON-RPC -32003;
- keresés: HTTP 200, `island=doorstar`, forrás-proveniencia;
- szerverlog: mind a hat caller külön néven jelenik meg;
- token nélkül 401, hibás vagy visszavont tokennel 403;
- Nexus processz restart nélkül, azonos PID-del hot-reloadolt.
- A restart-preflight a valós policyvel PASS; hiányzó policyvel fail-closed,
  az effektív systemd unitban `ignore_errors=no`, a PID továbbra is `1733284`.
- Nexus célzott policy/auth regresszió: 49/49; regisztráló + preflight
  admin-szkript: 7/7; TypeScript build és production audit zöld.

Egy új, izolált Codex task dinamikusan felfedezte és spawnolta a
`doorstar_monitor` custom agentet; az agent a konfigurált name/principal/
read-only sandbox értékeket adta vissza és nem végzett fájl- vagy MCP-műveletet.
A helyi Windows sandbox helper read-only indítása külön `os error 5` gépi hibát
adott, ezért a discovery-smoke sandbox nélküli CLI override-dal futott; a
projekt TOML `read-only` invariánsát a determinisztikus validator bizonyítja.

A role-MCP kompatibilitási javítás után külön E2E spawnolta a
`doorstar_frontend` agentet, amely pontosan a
`mcp__doorstar_knowledge_frontend__search_knowledge` toolt hívta. A válasz
`island=doorstar`, forrás jelen; ugyanebben az időablakban a Nexus
`doorstar-frontend-codex` caller-számlálója pontosan eggyel nőtt.

## Következmény és rollback

Új Codex task szükséges ahhoz, hogy a custom agent-lista és a módosított MCP
konfiguráció betöltődjön. Azonos Windows user alatt a külön token naplózható és
egyenként visszavonható, de nem operációsrendszer-szintű titokizoláció; ehhez
később külön OS-fiók vagy secret broker kellene.

Nem blokkoló defense-in-depth követés: az általános Nexus runtime parser a
legacy `all` permission-típust továbbra is ismeri, míg a Doorstar-sziget szigorú
contract-validátora jelenleg systemd-indulás előtt fut. A lokális és élő policy
nem tartalmaz `all` ágat, és csak jogosult operátor írhatja; később ugyanazt a
customer-contract ellenőrzést az automatikus hot-reload csere előtt is le kell
futtatni, hogy egy túl tág, de szintaktikailag érvényes kézi policy se töltődjön
be restart nélkül.

Rollbacknél először az érintett agent tokenjét kell eltávolítani az
`agents.yaml` backupjával, majd igazolni a 403-at. A tágabb régi tool-policy
visszaállítása csak ezután történhet, hogy ne nyíljon fail-open ablak.
Az `ExecStartPre` guard eltávolítása önálló visszaállítási lépés, és csak akkor
engedhető, ha a futó build már bizonyítottan ugyanazt a fail-closed indulási
invariánst tartalmazza.
