# Doorstar kontrollált Nexus RAG-csomag

Ez a könyvtár a Doorstar adatleltárból képzett kontrollált, kereshető
tudáscsomag verzióit tartalmazza. Nem nyers dokumentumfeltöltés és nem
importfutás. A v1.0 2026-08-01-én kontrolláltan betöltésre került; a v1.1 csak
offline retrieval-candidate, élő írásra nincs jóváhagyva.

## Biztonsági határ

- Cél-sziget kizárólag `doorstar`.
- A manifest módja `dry-run`; `nexusWrite` és `chromaWrite` kötelezően `false`.
- A forrásleltár auditmelléklet és `ragIndexable:false`.
- Nyers PDF, XLSX, XLSM, DWG, kép és nagy import-preview nincs a csomagban.
- A kanonikus dokumentumok nem tartalmazhatnak ügyfélnevet, címet,
  telefonszámot, e-mailt vagy rendelés-specifikus értéket.
- Az `OPEN` és `INFERENCE` állítás nem emelhető `VERIFIED` tudássá.
- A validátor nem tartalmaz Nexus-, ChromaDB-, adatbázis- vagy hálózati klienst.

## Tartalom

- `SOURCE_INVENTORY.json`: korlátozott, nem indexelhető forrás- és
  érzékenységi leltár.
- `canonical/*.md`: állítás-szintű, PII-mentes kanonikus tudásanyag.
- `doorstar-rag-manifest.v1.json`: dokumentumverziók, források, teljes
  SHA-256 értékek és chunking policy.
- `RAG_EVAL_QUESTIONS.json`: 35 ellenőrző kérdés elvárt dokumentum-, forrás-
  és claim-hivatkozással.
- `DRY_RUN_REPORT.json`: determinisztikusan generált, tartalommentes ellenőrzési
  jelentés.
- `RAG_REVIEW_REPORT.md`: emberi jóváhagyási összefoglaló és nyitott kapuk.
- `SOURCE_INVENTORY.v1.1.json`, `RAG_EVAL_QUESTIONS.v1.1.json` és
  `doorstar-rag-manifest.v1.1.json`: a változatlan v1.0-tól elkülönített v1.1
  bemenetek.
- `DRY_RUN_REPORT.v1.1.0.json`: 98 claim chunk + 6 overview tartalommentes
  csomagriportja.
- `CANDIDATE_EVAL_SUMMARY.v1.1.0.json` és `RAG_REVIEW_REPORT.v1.1.md`: az
  offline exact-model retrieval eredménye és a kötelező új approval-kapu.

## Determinisztikus dry-run

A repository gyökeréből:

```powershell
python scripts/prepareDoorstarNexusRag.py `
  --manifest docs/projects/doorstar-nexus-rag/doorstar-rag-manifest.v1.json `
  --inventory docs/projects/doorstar-nexus-rag/SOURCE_INVENTORY.json `
  --output docs/projects/doorstar-nexus-rag/DRY_RUN_REPORT.json
```

A futás ellenőrzi a cél-szigetet és írástilalmat, a relatív útvonalakat, a
forrás- és kanonikus hash-eket, a claim-citációkat, az eval-hivatkozásokat,
a tiltott bináris/preview osztályokat, az érzékeny adatminta-tilalmat és az
idempotencia-kulcsokat. A jelentés nem tartalmaz futásidőt vagy abszolút
gépútvonalat.

A v1.1 reprodukciója ugyanazzal a validátorral, de a verziózott manifesttel és
inventoryval fut. A claim-szöveget igénylő offline eval kizárólag stdout→stdin
raw-byte csatornán használja a
`scripts/prepareDoorstarNexusRagCandidateEval.py` generátort; candidate-payload
nem marad a repositoryban.

## Idempotencia

A dokumentumazonosság bemenete:

```text
sha256(id | version | canonicalSha256 | policyVersion)
```

- azonos `id` + verzió + hash: `SKIP_IDENTICAL`;
- azonos `id` + verzió, eltérő hash: `BLOCK_VERSION_DRIFT`;
- új dokumentumverzió: `CREATE` terv, de dry-runban nincs írás.

Az offline csomag nem kérdezi le a Nexust. Az összevetéshez jóváhagyott helyi
baseline adható a manifest `idempotency.baselineDocuments` listájában. Az első
dry-run üres baseline mellett minden dokumentumot tervezett `CREATE` műveletnek
jelöl; ez nem jelent tényleges betöltést.

## Kötelező leállási kapu

A v1.1 `DRY_RUN_REPORT.v1.1.0.json` és `RAG_REVIEW_REPORT.v1.1.md` elkészülte
után a folyamat megáll. Nexus- vagy ChromaDB-betöltéshez külön, dokumentált
emberi jóváhagyás, jóváhagyott reviewer és új, hash-pinnelt végrehajtási lépés
szükséges. A jelenlegi review döntése: `HOLD_FOR_RETRIEVAL_TUNING`.
