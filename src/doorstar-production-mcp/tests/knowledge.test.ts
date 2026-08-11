import assert from "node:assert/strict";
import test from "node:test";
import { containsSecretPattern, loadKnowledgeCorpus, searchKnowledge, tokenize } from "../src/knowledge.js";
import { tenantWoodworkingDocuments } from "../src/tenantWoodworkingKnowledge.js";

test("tokenize normalizes Hungarian accents", () => {
  assert.deepEqual(tokenize("Fűrész megmunkálás"), ["furesz", "megmunkalas"]);
});

test("rejects quoted and unquoted credential-shaped text", () => {
  assert.equal(containsSecretPattern(["password:", "notreal123"].join(" ")), true);
  assert.equal(containsSecretPattern(["https://user:", "notreal123@example.test"].join("")), true);
  assert.equal(containsSecretPattern("token: <provided-at-runtime>"), false);
});

test("loads only the static Doorstar tenant woodworking corpus", async () => {
  const corpus = await loadKnowledgeCorpus("a-root-that-is-never-read");

  assert.equal(corpus.tenantId, "doorstar");
  assert.equal(corpus.scope, "woodworking");
  assert.equal(corpus.provenance, "doorstar-tenant-curated-static");
  assert.equal(corpus.status, "ready");
  assert.match(corpus.corpusVersion, /^doorstar-woodworking-v1-[a-f0-9]{16}$/);
  assert.ok(corpus.documentCount >= 15);
  assert.equal(corpus.documentCount, corpus.chunkCount);
  assert.ok(
    corpus.sources.every(
      (source) =>
        source.tenantId === "doorstar" &&
        source.scope === "woodworking" &&
        source.kind === "tenant_woodworking" &&
        source.provenance === "doorstar-tenant-curated-static" &&
        source.status === "ready"
    )
  );
  assert.ok(corpus.sources.every((source) => source.path.startsWith("tenant:doorstar;scope:woodworking;card:")));
  assert.ok(corpus.sources.every((source) => !/[\\/]/.test(source.path) && !/^[A-Za-z]:/.test(source.path)));
  assert.deepEqual(
    corpus.sources.map((source) => source.sha256),
    tenantWoodworkingDocuments.map((document) => document.sha256)
  );
});

test("exports a deterministic safe manifest for private tenant indexing", () => {
  assert.ok(tenantWoodworkingDocuments.length >= 15);
  assert.ok(
    tenantWoodworkingDocuments.every(
      (document) =>
        document.domain === "woodworking" &&
        document.tenantId === "doorstar" &&
        document.scope === "woodworking" &&
        document.provenance === "doorstar-tenant-curated-static" &&
        document.status === "ready" &&
        /^[a-z0-9-]+$/.test(document.id) &&
        /^[a-f0-9]{64}$/.test(document.sha256) &&
        document.markdown === `## ${document.title}\n\n${document.text}`
    )
  );
  assert.ok(tenantWoodworkingDocuments.every((document) => !/[\\/]/.test(document.id)));
});

test("keeps the canonical six-stage Doorstar production sequence", () => {
  const numberedStages = tenantWoodworkingDocuments
    .map((document) => document.section)
    .filter((section) => /^[1-6]\. /.test(section));

  assert.deepEqual(numberedStages, [
    "1. Szabászat",
    "2. Megmunkálás",
    "3. Felületkezelés",
    "4. Összeszerelés",
    "5. Csomagolás",
    "6. Kiszállítható",
  ]);
  assert.equal(
    tenantWoodworkingDocuments.find((document) => document.id === "felulet-elokeszites")?.section,
    "Felületkezelés előkészítése"
  );
});

test("development and code queries return no local knowledge or implementation details", async () => {
  const corpus = await loadKnowledgeCorpus();
  const results = searchKnowledge(corpus, "fejlesztői forráskód repository API konfiguráció", 5);

  assert.deepEqual(results, []);
});

test("retrieves relevant Doorstar woodworking guidance", async () => {
  const corpus = await loadKnowledgeCorpus();
  const results = searchKnowledge(corpus, "ajtótok falnyílás borítás felületkezelés", 5);

  assert.ok(results.length > 0);
  assert.ok(results.some((result) => result.source.path.endsWith("card:tok-falnyilas-ellenorzes")));
  assert.ok(results.some((result) => result.source.path.endsWith("card:boritas-csatlakozas")));
  assert.ok(results.every((result) => result.source.tenantId === "doorstar" && result.source.scope === "woodworking"));
  assert.ok(results.every((result) => !/[\\/]/.test(result.source.path)));
});
