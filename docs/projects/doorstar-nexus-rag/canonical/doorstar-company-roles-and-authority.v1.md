# Doorstar szerepkörök és döntési authority

- Document ID: `doorstar.roles-authority`
- Version: `1.0.0`
- Valid from: `2026-07-31`
- Review status: `READY_FOR_HUMAN_REVIEW`
- Owner: `doorstar-root`
- Sensitivity: `INTERNAL`

## Hatókör

Ez a dokumentum kizárólag általános Doorstar szerep- és döntési határokat
rögzít. Nem tartalmaz személynevet, ügyféladatot vagy rendelési rekordot.

## Állítások

| Claim ID | Minősítés | Állítás | Forráshely és forráshash |
| --- | --- | --- | --- |
| ROLE-001 | VERIFIED | A jogosultságot együtt határozza meg a szerepkör, a projekthez vagy rendeléshez való hozzárendelés és a revízió állapota; a szerepkör önmagában nem ad korlátlan módosítási jogot. | SRC-ORDER-ROLE-MATRIX@sha256:1cfb3e5313c558bc23ef85746148da83ec5979c6b325af2bf622b6ce3fa70ad0#alapelv |
| ROLE-002 | VERIFIED | A Sales új projektet és rendelési piszkozatot kezdeményez, üzleti adatot és dokumentumcsomagot ad át, de végleges gyártási adatot nem állapít meg. | SRC-ORDER-SALES-SURVEY-WORKFLOW@sha256:f0a29a6d6dc310be25077586ba47b37d7a670a845e0a83d764d8aadb5e413414#uzleti-dontesek |
| ROLE-003 | VERIFIED | A műszaki előkészítő az ajtópozíciók, a műszaki specifikáció és a dokumentum-előkészítés felelőse, de a saját revízióját nem hagyhatja jóvá. | SRC-ORDER-ROLE-MATRIX@sha256:1cfb3e5313c558bc23ef85746148da83ec5979c6b325af2bf622b6ce3fa70ad0#jovahagyasi-elvalasztas |
| ROLE-004 | VERIFIED | A szerepköri szabály szerint a rendelési revízió jóváhagyása elkülönített vezetői művelet; az audit megőrzi a döntéshozót, az időpontot, a tartalmi hash-t és az indoklást. | SRC-ORDER-ROLE-MATRIX@sha256:1cfb3e5313c558bc23ef85746148da83ec5979c6b325af2bf622b6ce3fa70ad0#jovahagyasi-elvalasztas |
| ROLE-005 | VERIFIED | A termeléstervező csak jóváhagyott adatokból készít tervjavaslatot, kapacitás- és gyártási előkészítést. | SRC-ORDER-ROLE-MATRIX@sha256:1cfb3e5313c558bc23ef85746148da83ec5979c6b325af2bf622b6ce3fa70ad0#muveleti-matrix |
| ROLE-006 | VERIFIED | Az üzemi állomáskezelő kiadott munkacsomagot hajt végre; rendelési vagy jóváhagyott műszaki adatot nem ír át. | SRC-ORDER-ROLE-MATRIX@sha256:1cfb3e5313c558bc23ef85746148da83ec5979c6b325af2bf622b6ce3fa70ad0#muveleti-matrix |
| ROLE-007 | VERIFIED | A beépítő csak a hozzárendelt, kiadott beépítési csomagot és annak konkrét dokumentumverzióit látja; helyszíni állapotot és bizonyítékot rögzíthet, de jóváhagyott rendelést, méretet, kalkulációt vagy tervet nem módosíthat. | SRC-ORDER-ROLE-MATRIX@sha256:1cfb3e5313c558bc23ef85746148da83ec5979c6b325af2bf622b6ce3fa70ad0#beepitoi-korlatok |
| ROLE-008 | VERIFIED | A beépítéskor talált eltérés review-feladatot indít; a szükséges változtatás új rendelésrevízión és a szokásos jóváhagyási láncon halad át. | SRC-ORDER-ROLE-MATRIX@sha256:1cfb3e5313c558bc23ef85746148da83ec5979c6b325af2bf622b6ce3fa70ad0#beepitoi-korlatok |
| ROLE-009 | VERIFIED | A raktár és kiszállítás szerepkör a csomagolás, a kiszállítás és az átadási bizonyíték kezelésében vesz részt; ez nem ad rendelésmódosítási jogot. | SRC-ORDER-ROLE-MATRIX@sha256:1cfb3e5313c558bc23ef85746148da83ec5979c6b325af2bf622b6ce3fa70ad0#alapelv |
| ROLE-010 | VERIFIED | A rendszergazdai vészjog auditált, és normál üzleti jóváhagyóként nem használható. | SRC-ORDER-ROLE-MATRIX@sha256:1cfb3e5313c558bc23ef85746148da83ec5979c6b325af2bf622b6ce3fa70ad0#jovahagyasi-elvalasztas |
| ROLE-011 | VERIFIED | A csak olvasó szerepkör kizárólag a számára jogosult projektek aktuális, nem érzékeny nézetét kapja. | SRC-ORDER-ROLE-MATRIX@sha256:1cfb3e5313c558bc23ef85746148da83ec5979c6b325af2bf622b6ce3fa70ad0#alapelv |
| ROLE-012 | OPEN | Az élő SharePoint/Nexus dokumentum-hozzáférés végleges Entra-csoport és Doorstar-szerepkör megfeleltetése még nincs jóváhagyva; valódi OIDC, szerveroldali RBAC és megnevezett üzleti reviewer szükséges. | SRC-ADR-SHAREPOINT-READONLY-SOURCE-CATALOG@sha256:46bf388043b5699cd2e7f032a8e6f9de197f81eb55adede5f14fb8c4590d807e#dontes |
| ROLE-013 | OPEN | A jelenlegi opcionális `X-Role` fejléc nem valódi hitelesítés, ezért a szerepmátrix önmagában nem bizonyít futó felhasználóazonosságot, projekt-hozzárendelést vagy dokumentum-ACL-t. | SRC-ADR-SHAREPOINT-READONLY-SOURCE-CATALOG@sha256:46bf388043b5699cd2e7f032a8e6f9de197f81eb55adede5f14fb8c4590d807e#kovetkezmenyek |

## Minősítési jelmagyarázat

- `VERIFIED`: a hivatkozott Doorstar-szabály vagy elfogadott döntés közvetlenül rögzíti.
- `INFERENCE`: forrásból levezetett, de még nem normatív következtetés.
- `OPEN`: emberi vagy szervezeti döntés nélkül nem tekinthető lezártnak.
