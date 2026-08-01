# Doorstar gyártási szakaszok, állapotok és dátumjelentések

- Document ID: `doorstar.production-stages-status-dates`
- Version: `1.0.0`
- Valid from: `2026-07-31`
- Review status: `READY_FOR_HUMAN_REVIEW`
- Owner: `doorstar-production`
- Sensitivity: `INTERNAL`

## Hatókör

A dokumentum a gyártási makroszakaszokat, a különálló állapotgépeket és az
időpontok üzleti jelentését választja szét. Nem tartalmaz projektidőpontot vagy
rendelési eseményt.

## Állítások

| Claim ID | Minősítés | Állítás | Forráshely és forráshash |
| --- | --- | --- | --- |
| PROD-001 | VERIFIED | A futó Doorstar backend hat rendezett gyártási makroszakasza: `SZABASZAT_ELOGYARTAS`, `MEGMUNKALAS`, `FELULETKEZELES`, `OSSZESZERELES`, `CSOMAGOLAS`, `KISZALLITASRA_MEGJELOLES`. | SRC-BACKEND-PRISMA-SCHEMA@sha256:5bbef71d70c258788d45ac290d313357da4d708f3f48d0bc206289aa4109a62b#workflow-step-name |
| PROD-002 | VERIFIED | A szabászat vagy előgyártás méretre darabolást és az ide sorolt előgyártást, a megmunkálás marást, fúrást és más forgácsoló vagy alakító műveletet jelent. | SRC-DOMAIN-DOORSTAR-TERMINOLOGY-MD@sha256:2e7c42717d8cc8c111fb98e8a5645d11bd519ec649bf0254aafad26a7a8e305a#gyartasi-folyamat-es-allapotok |
| PROD-003 | VERIFIED | A felületkezelési makroszakasz együtt kezelhet felület-előkészítést és bevonatképzést, de a csiszolás és az egyes kezelési műveletek külön műveletként és normaként maradnak; a fúrás nem felületkezelés. | SRC-DOMAIN-DOORSTAR-TERMINOLOGY-MD@sha256:2e7c42717d8cc8c111fb98e8a5645d11bd519ec649bf0254aafad26a7a8e305a#gyartasi-folyamat-es-allapotok |
| PROD-004 | VERIFIED | Az összeszerelés alkatrészek egységgé építése és vasalatszerelés; a csomagolás termékvédelem, egységképzés, jelölés és csomagadat-kezelés. | SRC-DOMAIN-DOORSTAR-TERMINOLOGY-MD@sha256:2e7c42717d8cc8c111fb98e8a5645d11bd519ec649bf0254aafad26a7a8e305a#gyartasi-folyamat-es-allapotok |
| PROD-005 | VERIFIED | A makroszakasz, a részletes technológiai művelet, a fizikai gép vagy munkaállomás és a készültségi állapot külön fogalom; egyik neve nem bizonyítja automatikusan a másikat. | SRC-DOMAIN-DOORSTAR-TERMINOLOGY-MD@sha256:2e7c42717d8cc8c111fb98e8a5645d11bd519ec649bf0254aafad26a7a8e305a#bevezetesi-szabalyok |
| PROD-006 | VERIFIED | A jelenlegi állomáskonfiguráció a Körfűrészt a szabászat vagy előgyártás, a CNC-t és Bürklét a megmunkálás, a Csiszolót és Fújót a felületkezelés, az Asztalost az összeszerelés, a Száll./Kész állomást a kiszállításra megjelölés makroszakaszához rendeli. | SRC-BACKEND-STATIONS-CONFIG@sha256:f7847485d21e91e25e7b90aa5c92dcbfbedee59a5cd9da8103db29fdc6e11899#stations |
| PROD-007 | VERIFIED | Az állomás workflow konfigurációvezérelt és tartalmazhat egyedi köztes oszlopokat; nem kanonizálható minden állomásra egyetlen univerzális háromállapotú folyamat. | SRC-BACKEND-STATIONS-CONFIG@sha256:f7847485d21e91e25e7b90aa5c92dcbfbedee59a5cd9da8103db29fdc6e11899#default-workflow |
| PROD-008 | OPEN | Az `Egyéb` állomás jelenleg technikailag a csomagolás makroszakaszhoz van konfigurálva, de neve nem hordoz szakmai műveletjelentést; a tényleges használati szabályt külön kell meghatározni. | SRC-BACKEND-STATIONS-CONFIG@sha256:f7847485d21e91e25e7b90aa5c92dcbfbedee59a5cd9da8103db29fdc6e11899#stations |
| PROD-009 | VERIFIED | A `KISZALLITASRA_MEGJELOLES` auditált állapotátmenet vagy makroszakasz, a `SHIPPING_READY` készültségi állapot, a tényleges kiszállítás pedig külön üzleti esemény. | SRC-BACKEND-PRISMA-SCHEMA@sha256:5bbef71d70c258788d45ac290d313357da4d708f3f48d0bc206289aa4109a62b#workflow-and-production-status; SRC-DOMAIN-DOORSTAR-TERMINOLOGY-MD@sha256:2e7c42717d8cc8c111fb98e8a5645d11bd519ec649bf0254aafad26a7a8e305a#gyartasi-folyamat-es-allapotok |
| PROD-010 | VERIFIED | A kiszállításra kész állapot nem bizonyít raktárba vételt, tényleges kiszállítást, beépítést, átadás-átvételt vagy teljesítést. | SRC-DOMAIN-DOORSTAR-TERMINOLOGY-MD@sha256:2e7c42717d8cc8c111fb98e8a5645d11bd519ec649bf0254aafad26a7a8e305a#gyartasi-folyamat-es-allapotok |
| PROD-011 | VERIFIED | A rendelésrevízió, az intake-folyamat, az evidence-review, a gyártási összesítő és az állomási munkakártya külön állapotterek; azonos felirat nem jogosít ezek összemosására. | SRC-BACKEND-PRISMA-SCHEMA@sha256:5bbef71d70c258788d45ac290d313357da4d708f3f48d0bc206289aa4109a62b#status-enums |
| PROD-012 | VERIFIED | A dátumjelentések külön típusok: vállalt vagy szerződéses határidő, várható kiszállítás, ütemezett kiszállítás, tényleges kiszállítás, tervezett gyártáskezdés és -befejezés, tervezett beépítés, valamint ténylegesen befejezett beépítés. | SRC-DOMAIN-DOORSTAR-TERMINOLOGY-JSON@sha256:198b53b18d846444a58c898e1622c9c32ee410aee1398d279ead47cf616be9eb#date-semantics |
| PROD-013 | VERIFIED | Vállalt vagy tervezett dátumból tényleges esemény nem következtethető; hiányzó kiszállítási vagy beépítési tény ismeretlen marad. | SRC-ORDER-IMPORT-PROCESS@sha256:e3ba31c16b7b71db5bd0d7c6afbb1694fc9049f16257d8355446b14c347a1e0d#process-deadlines-and-operational-events |
| PROD-014 | VERIFIED | Részleges kiszállítás vagy részleges beépítés `PARTIAL`; nem zárhatja le a teljes projektet. | SRC-ORDER-IMPORT-PROCESS@sha256:e3ba31c16b7b71db5bd0d7c6afbb1694fc9049f16257d8355446b14c347a1e0d#process-deadlines-and-operational-events |
| PROD-015 | VERIFIED | SharePoint módosítási idő csak dokumentumverzió-evidence; helyi szinkronizált fájldátum üzleti átfutási idő számításához nem használható. | SRC-ORDER-IMPORT-PROCESS@sha256:e3ba31c16b7b71db5bd0d7c6afbb1694fc9049f16257d8355446b14c347a1e0d#process-deadlines-and-operational-events |
| PROD-016 | OPEN | A teljes kanonikus dátumtaxonómia még nem mind külön első osztályú futó adatbázismező; kereséskor jelentést kell visszaadni, de nem szabad nem létező runtime mezőt állítani. | SRC-BACKEND-PRISMA-SCHEMA@sha256:5bbef71d70c258788d45ac290d313357da4d708f3f48d0bc206289aa4109a62b#deadline-models |

## Minősítési jelmagyarázat

- `VERIFIED`: dokumentált üzleti jelentés vagy jelenlegi runtime-konfiguráció.
- `INFERENCE`: több forrásból levezetett, de nem végrehajtható állítás.
- `OPEN`: konfigurációs vagy adatmodell-döntés hiányában nem végleges.
