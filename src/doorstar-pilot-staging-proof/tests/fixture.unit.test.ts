import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  fixtureFunctionSignatures,
  loadTwoScopeFixtureTemplate,
  renderTwoScopeFixture,
} from "../src/fixture/twoScopeFixture.js";
import { verifyFixtureDdlSurface, verifyTwoScopeFixtureSources } from "../src/fixture/fixtureVerifier.js";

const fixtureInput = {
  scopeA: {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    scopeKey: "a03-unit-alpha",
  },
  scopeB: {
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    scopeKey: "a03-unit-beta",
  },
} as const;

describe("two-scope A-03 fixture", () => {
  it("renders a closed pair into each of the exact three replacements", async () => {
    const rendered = renderTwoScopeFixture(await loadTwoScopeFixtureTemplate(), fixtureInput);
    expect(rendered).not.toContain("__A03_SCOPE_");
    expect((rendered.match(/CREATE OR REPLACE FUNCTION/g) ?? [])).toHaveLength(3);
    expect((rendered.match(/a03-unit-alpha/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect((rendered.match(/a03-unit-beta/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect(rendered).not.toMatch(/\b(?:ALTER|DROP|GRANT|REVOKE|CREATE\s+TABLE)\b/i);
  });

  it("rejects duplicate or invalid disposable scope pairs", async () => {
    const template = await loadTwoScopeFixtureTemplate();
    expect(() => renderTwoScopeFixture(template, {
      scopeA: fixtureInput.scopeA,
      scopeB: { ...fixtureInput.scopeA, scopeKey: fixtureInput.scopeB.scopeKey },
    })).toThrow("a03_fixture_scope_pairs_must_be_distinct");
    expect(() => renderTwoScopeFixture(template, {
      scopeA: { ...fixtureInput.scopeA, id: "not-a-uuid" },
      scopeB: fixtureInput.scopeB,
    })).toThrow("a03_fixture_scopeA_id_invalid");
  });

  it("source-verifies that only the production one-scope guard changes", async () => {
    const report = await verifyTwoScopeFixtureSources();
    expect(report.fixtureSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(report.renderedFixtureSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(report.functions).toEqual(fixtureFunctionSignatures);
  });

  it("keeps fixture data outside the production Prisma migration tree", async () => {
    const template = await loadTwoScopeFixtureTemplate();
    const packageManifest = await readFile(new URL("../package.json", import.meta.url), "utf8");
    expect(template).toContain("A-03 disposable proof fixture");
    expect(packageManifest).toContain("@doorstar/pilot-staging-proof");
    expect(template).not.toContain("CREATE TABLE");
  });

  it("fails closed when any unapproved top-level statement is appended", async () => {
    const template = await loadTwoScopeFixtureTemplate();
    expect(() => verifyFixtureDdlSurface(`${template}\nCREATE VIEW pilot.a03_unapproved AS SELECT 1;\n`))
      .toThrow("a03_fixture_contains_unapproved_top_level_statement");
    expect(() => verifyFixtureDdlSurface(`${template}\nTRUNCATE pilot.\"PilotScope\";\n`))
      .toThrow("a03_fixture_contains_unapproved_top_level_statement");
  });
});
