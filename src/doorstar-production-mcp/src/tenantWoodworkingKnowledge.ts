import { createHash } from "node:crypto";

/**
 * Original, concise Doorstar woodworking cards. They are intentionally kept
 * as static tenant knowledge: no books, scans, file locations or external
 * content are loaded by the MCP runtime.
 */
export const DOORSTAR_TENANT_ID = "doorstar" as const;
export const WOODWORKING_SCOPE = "woodworking" as const;
export const TENANT_WOODWORKING_PROVENANCE = "doorstar-tenant-curated-static" as const;
export const TENANT_WOODWORKING_STATUS = "ready" as const;
export const TENANT_WOODWORKING_CURATED_AT = "2026-08-11T00:00:00.000Z";

export interface TenantWoodworkingKnowledgeCard {
  readonly id: string;
  readonly title: string;
  readonly section: string;
  readonly text: string;
  readonly keywords: readonly string[];
}

/** A stable, portable representation for private tenant index provisioning.
 * It contains the exact original summaries served locally, never source files
 * or source-document metadata. */
export interface TenantWoodworkingDocument {
  readonly id: string;
  readonly title: string;
  readonly section: string;
  readonly text: string;
  readonly markdown: string;
  readonly keywords: readonly string[];
  readonly domain: typeof WOODWORKING_SCOPE;
  readonly tenantId: typeof DOORSTAR_TENANT_ID;
  readonly scope: typeof WOODWORKING_SCOPE;
  readonly provenance: typeof TENANT_WOODWORKING_PROVENANCE;
  readonly status: typeof TENANT_WOODWORKING_STATUS;
  readonly sha256: string;
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/**
 * Every card is an original operational summary, not a transcription. The
 * fields are deliberately small enough that each retrieval result remains
 * reviewable in a production conversation.
 */
export const DOORSTAR_WOODWORKING_CARDS: readonly TenantWoodworkingKnowledgeCard[] = [
  {
    id: "ajtolap-fa-mozgas",
    title: "Ajtólap és faanyagmozgás",
    section: "Ajtólap",
    text:
      "Tömörfa ajtólapnál a páratartalom miatti méretváltozással számolni kell. A szimmetrikus felépítés, az azonos oldali felületkezelés és a száraz, sík tárolás csökkenti a vetemedés kockázatát.",
    keywords: ["ajtólap", "tömörfa", "nedvesség", "vetemedés", "faanyagmozgás"],
  },
  {
    id: "tok-falnyilas-ellenorzes",
    title: "Tok és falnyílás ellenőrzése",
    section: "Tok",
    text:
      "A tok gyártása és beépítése előtt a falnyílás szélességét, magasságát és átlóját több ponton kell ellenőrizni. A tok síkját, függőjét és a tervezett szerelési hézagot a munkalapon rögzített rendszer szerint kell tartani.",
    keywords: ["tok", "falnyílás", "beépítés", "hézag", "függő", "átló"],
  },
  {
    id: "boritas-csatlakozas",
    title: "Borítás és csatlakozási hézag",
    section: "Borítás",
    text:
      "A borítás feladata a tok és a fal találkozásának kulturált takarása. Méretét a kész fal- és tokhelyzethez kell igazítani; a borítás nem helyettesíti a pontatlan tokbeállítás vagy a hibás falnyílás javítását.",
    keywords: ["borítás", "tokborítás", "csatlakozás", "fal", "hézag"],
  },
  {
    id: "tomorfa-anyagvalasztas",
    title: "Tömörfa kiválasztása",
    section: "Anyagok",
    text:
      "Tömörfa alkatrészhez azonosítható fafaj, megfelelően kondicionált alapanyag és a látható felülethez illő rajzolat szükséges. A csomó, repedés, belső feszültség és nedvességi eltérés kockázatát már a darabolás előtt értékelni kell.",
    keywords: ["tömörfa", "fafaj", "kondicionálás", "csomó", "repedés", "nedvesség"],
  },
  {
    id: "lapanyag-valasztas",
    title: "Lapalapú anyag választása",
    section: "Anyagok",
    text:
      "MDF, rétegelt lemez és forgácslap eltérő élképzési, teherbírási és felületkezelési igényt ad. A választást az alkatrész szerepe, a látható él, a vasalat terhelése és a környezeti igénybevétel alapján kell dokumentálni.",
    keywords: ["MDF", "rétegelt lemez", "forgácslap", "lapanyag", "élképzés", "vasalat"],
  },
  {
    id: "muszaki-dokumentacio",
    title: "Gyártási műszaki dokumentáció",
    section: "Dokumentáció",
    text:
      "A gyártásra kiadott rajz, méretjegyzék és vasalatlista ugyanahhoz a munkalaphoz és revízióhoz tartozzon. Kétes méret, hiányzó anyagjel vagy egymásnak ellentmondó adat esetén a műveletet meg kell állítani és tisztázást kell kérni.",
    keywords: ["műszaki dokumentáció", "rajz", "méretjegyzék", "vasalatlista", "revízió", "munkalap"],
  },
  {
    id: "munkalap-azonositas",
    title: "Munkalap és tételazonosítás",
    section: "Dokumentáció",
    text:
      "Minden készülő ajtó-, tok- vagy borításelem maradjon visszaköthető a munkalaphoz, a revízióhoz és az anyagtételhez. Az azonosító kísérje az alkatrészt a darabolástól a csomagolásig, hogy eltérés esetén célzott vizsgálat indulhasson.",
    keywords: ["munkalap", "azonosító", "tétel", "revízió", "nyomonkövetés", "ajtó"],
  },
  {
    id: "szabaszat",
    title: "Szabászat",
    section: "1. Szabászat",
    text:
      "Szabászat előtt a darabjegyzéket, anyagazonosítót, rajzolatirányt és megmunkálási ráhagyást kell egyeztetni. A levágott elemet azonnal jelölni kell, a méretet pedig a következő művelet bázisfelületéhez igazítva kell ellenőrizni.",
    keywords: ["szabászat", "darabjegyzék", "anyagazonosító", "ráhagyás", "jelölés", "méret"],
  },
  {
    id: "megmunkalas",
    title: "Megmunkálás",
    section: "2. Megmunkálás",
    text:
      "Marás, fúrás és CNC-megmunkálás előtt a rajz szerinti bázisfelületet, szerszámot és befogást kell ellenőrizni. Az első darab mérésével igazolni kell a kritikus méreteket, majd a sorozat közben is szükséges az ismételt ellenőrzés.",
    keywords: ["megmunkálás", "marás", "fúrás", "CNC", "bázisfelület", "befogás"],
  },
  {
    id: "felulet-elokeszites",
    title: "Felület-előkészítés",
    section: "3. Felület-előkészítés",
    text:
      "Felületkezelés előtt a felület legyen egyenletes, pormentes és a hibák szempontjából ellenőrzött. A csiszolási nyom, élletörés, ragasztómaradvány és sérülés később láthatóvá válhat, ezért javításukat még a bevonat felhordása előtt kell elvégezni.",
    keywords: ["felület-előkészítés", "csiszolás", "poreltávolítás", "élletörés", "ragasztó", "hiba"],
  },
  {
    id: "feluletkezeles",
    title: "Felületkezelés",
    section: "4. Felületkezelés",
    text:
      "A felületkezelési tételhez rögzíteni kell a választott színt, bevonatrendszert és az ellenőrzött próbadarabot. A rétegek között csak a meghatározott állapotban szabad továbblépni; színeltérés, folyás vagy elégtelen fedés esetén a tételt el kell különíteni.",
    keywords: ["felületkezelés", "szín", "bevonat", "próbadarab", "réteg", "fedés"],
  },
  {
    id: "osszeszereles",
    title: "Összeszerelés",
    section: "5. Összeszerelés",
    text:
      "Összeszereléskor a szárazpróbával ellenőrizni kell az illesztéseket, az átlókat és a vasalat működését. A ragasztás, kötőelem és vasalat csak a jóváhagyott rajz szerint kerüljön be; a kész egységet működési próbával kell átvenni.",
    keywords: ["összeszerelés", "szárazpróba", "illesztés", "átló", "ragasztás", "vasalat"],
  },
  {
    id: "csomagolas",
    title: "Csomagolás",
    section: "6. Csomagolás",
    text:
      "Csomagolás előtt ellenőrizni kell a termékazonosítót, darabszámot, látható felületet és tartozékokat. Az éleket és sarkokat a szállítás várható igénybevételéhez kell védeni, a csomagon pedig a munkalaphoz köthető jelölés maradjon olvasható.",
    keywords: ["csomagolás", "élvédelem", "sarokvédelem", "tartozék", "termékazonosító", "szállítás"],
  },
  {
    id: "minoseg-es-eredet",
    title: "Minőség és igazolható előzmény",
    section: "Minőség",
    text:
      "Az átvételkor a munkalap szerinti méretet, működést, felületet és tartozékokat kell ellenőrizni. Az eltérést mért adattal és egyértelmű tételazonosítóval kell feljegyezni, hogy a javítás, elkülönítés vagy ismételt gyártás visszaellenőrizhető legyen.",
    keywords: ["minőség", "átvétel", "ellenőrzés", "eltérés", "tételazonosító", "visszaellenőrzés"],
  },
] as const;

/**
 * Deterministic tenant-index manifest. `markdown` and `text` describe the
 * same original card; the hash covers all retrieval-relevant fields so an
 * importer can verify it received the intended version.
 */
export const tenantWoodworkingDocuments: readonly TenantWoodworkingDocument[] = DOORSTAR_WOODWORKING_CARDS.map((card) => {
  const markdown = `## ${card.title}\n\n${card.text}`;
  return Object.freeze({
    id: card.id,
    title: card.title,
    section: card.section,
    text: card.text,
    markdown,
    keywords: card.keywords,
    domain: WOODWORKING_SCOPE,
    tenantId: DOORSTAR_TENANT_ID,
    scope: WOODWORKING_SCOPE,
    provenance: TENANT_WOODWORKING_PROVENANCE,
    status: TENANT_WOODWORKING_STATUS,
    sha256: sha256([card.id, card.title, card.section, markdown, ...card.keywords].join("\n")),
  });
});
