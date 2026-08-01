# Doorstar RAG executor — végső felülvizsgálati bizonyíték

- Dátum: 2026-08-01
- Eredmény: `PASS`, P0/P1/P2 finding nincs
- Executor SHA-256: `bcbbdff382492a6c121d944c8c29b416dce47d1167df283efa79e5b751e1904b`
- Teszt SHA-256: `d6e6339a1307b3af7922007a7e161af2abb0e96b23a501e6ca20e33d6b9c0ce9`
- Fókuszált teszt: 103/103 PASS
- TypeScript typecheck: PASS
- Build: PASS

## Biztonsági eredmény

Az executor csak az exact `doorstar` / `doorstar-knowledge` célt nyitja meg,
exact ID-ket ír és töröl, repositoryn kívüli 0600 mentést készít, majd minden
írási eltérésnél exact rollbacket hajt végre. A tartalommentes diagnosztika csak
zárt műveletnevet és statikus hibakódot közöl; nyers hibaüzenetet, stack trace-t,
dokumentumtartalmat vagy backup-tartalmat nem.

Az élő próba feltárta, hogy a Chroma f32 vektort rövidebb JSON-számként adhatja
vissza. A végső ellenőrzés ezért minden visszaolvasott számot `Math.fround`
kanonikus f32 értékre képez, majd az elvárt f32 értékkel és külön byte-hash-sel
is összeveti. Ez kizárólag ugyanazon float32 eltérő JavaScript-decimális
reprezentációját fogadja el; dimenzióhiba, nem véges érték, előjelhelyes nulla-
eltérés vagy valódi vektorkorrupció továbbra is hibát és rollbacket okoz.

## Runtime-pin

- `chromadb`: 3.5.0
- embedding: `Xenova/all-MiniLM-L6-v2`, 384 dimenzió
- model artifact set: `4f429104fcaa08f366e27ab44917d046d455ead6526d6e074b9633c465ae9a14`
- text runtime set: `2a7985c3ead935c16872ed538a8012bd30c9293d3adf8d804236b16b41106ad8`
- ONNX Runtime: 1.14.0
- ONNX entry SHA-256: `d6f7e42a0ef6c3d67028cf481ebce6ea047c58853b5d25ff3f4bb37d3384b406`

Az alkalmazás, backup, idempotencia, eval és principal-smoke részletes,
tartalommentes eredményei a könyvtár `LIVE_*_2026-08-01.json` fájljaiban vannak.
