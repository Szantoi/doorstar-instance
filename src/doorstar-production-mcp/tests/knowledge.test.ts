import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { containsSecretPattern, loadKnowledgeCorpus, searchKnowledge, tokenize } from "../src/knowledge.js";

const repositoryRoot = path.resolve(import.meta.dirname, "../../..");

test("tokenize normalizes Hungarian accents", () => {
  assert.deepEqual(tokenize("Fűrész megmunkálás"), ["furesz", "megmunkalas"]);
});

test("rejects quoted and unquoted credential-shaped text", () => {
  assert.equal(containsSecretPattern(["password:", "notreal123"].join(" ")), true);
  assert.equal(containsSecretPattern(["https://user:", "notreal123@example.test"].join("")), true);
  assert.equal(containsSecretPattern("token: <provided-at-runtime>"), false);
});

test("loads only the curated, clean Doorstar documentation corpus", async () => {
  const corpus = await loadKnowledgeCorpus(repositoryRoot);
  assert.ok(corpus.documentCount > 0);
  assert.ok(corpus.sources.every((source) => source.path.startsWith("docs/knowledge/") || source.path === "docs/FEDERATION_PROTOCOL.md" || source.path.endsWith("README.md")));
  assert.ok(corpus.sources.every((source) => !source.path.includes("doorstar-spaceos-convergence")));
});

test("retrieves a relevant manufacturing workflow excerpt", async () => {
  const corpus = await loadKnowledgeCorpus(repositoryRoot);
  const results = searchKnowledge(corpus, "szabászat csomagolás", 3);
  assert.ok(results.length > 0);
  assert.ok(results.some((result) => result.source.path.includes("6-STAGE_WORKFLOW")));
});
