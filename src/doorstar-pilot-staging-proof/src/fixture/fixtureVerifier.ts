import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  fixtureFunctionSignatures,
  fixturePlaceholdersForVerification,
  loadTwoScopeFixtureTemplate,
  renderTwoScopeFixture,
} from "./twoScopeFixture.js";

export type FixtureVerificationReport = Readonly<{
  fixtureSha256: string;
  renderedFixtureSha256: string;
  functions: readonly string[];
}>;

const sampleFixtureInput = {
  scopeA: {
    id: "11111111-1111-4111-8111-111111111111",
    scopeKey: "a03-fixture-alpha",
  },
  scopeB: {
    id: "22222222-2222-4222-8222-222222222222",
    scopeKey: "a03-fixture-beta",
  },
} as const;

const fixtureGuardPattern = /\s*-- A03_TWO_SCOPE_GUARD_START[\s\S]*?-- A03_TWO_SCOPE_GUARD_END/;
const productionGuardPattern = /\s*SELECT count\(\*\) INTO v_scope_count FROM pilot\."PilotScope";\n  IF v_scope_count <> 1[\s\S]*?\n  END IF;/;

/** The sibling source is read only for comparison; no package import crosses the boundary. */
function productionPolicyMigrationPath(): string {
  return fileURLToPath(new URL(
    "../../../doorstar-pilot-foundation/prisma/migrations/20260827120000_pilot_a_phase_authorization_policy/migration.sql",
    import.meta.url,
  ));
}

export async function verifyTwoScopeFixtureSources(): Promise<FixtureVerificationReport> {
  const template = await loadTwoScopeFixtureTemplate();
  verifyFixtureDdlSurface(template);
  const rendered = renderTwoScopeFixture(template, sampleFixtureInput);
  verifyRenderedFixtureSurface(rendered);

  const productionMigration = await readFile(productionPolicyMigrationPath(), "utf8");
  for (const signature of fixtureFunctionSignatures) {
    const productionFunction = extractFunction(productionMigration, signature, false);
    const fixtureFunction = extractFunction(rendered, signature, true);
    const productionWithFixturePrefix = productionFunction.replace(/^CREATE FUNCTION/m, "CREATE OR REPLACE FUNCTION");
    const normalizedProduction = replaceExactlyOne(productionWithFixturePrefix, productionGuardPattern, "\n__A03_SCOPE_GUARD__");
    const normalizedFixture = replaceExactlyOne(fixtureFunction, fixtureGuardPattern, "\n__A03_SCOPE_GUARD__");
    if (normalizeSql(normalizedProduction) !== normalizeSql(normalizedFixture)) {
      throw new Error(`a03_fixture_changes_production_behavior_outside_scope_guard:${signature}`);
    }
  }

  return {
    fixtureSha256: sha256(template),
    renderedFixtureSha256: sha256(rendered),
    functions: fixtureFunctionSignatures,
  };
}

export function verifyFixtureDdlSurface(template: string): void {
  const createMatches = [...template.matchAll(/^CREATE OR REPLACE FUNCTION\s+([^\s(]+)\s*\(/gm)];
  const discoveredFunctions = createMatches.map((match) => match[1]);
  const expectedFunctions = fixtureFunctionSignatures.map((signature) => signature.slice(0, signature.indexOf("(")));
  if (JSON.stringify(discoveredFunctions) !== JSON.stringify(expectedFunctions)) {
    throw new Error("a03_fixture_must_replace_exactly_the_three_approved_functions");
  }

  // This is deliberately an allow-list, not a growing DDL/DML blacklist.
  // After removing the three approved function definitions, a fixture may
  // contain only comments and whitespace. Therefore an added CREATE VIEW,
  // TRUNCATE, or any other top-level statement fails closed.
  const approvedRanges = fixtureFunctionSignatures
    .map((signature) => locateFunction(template, signature, true))
    .sort((left, right) => left.start - right.start);
  if (approvedRanges.some((range, index) => index > 0 && range.start < approvedRanges[index - 1]!.end)) {
    throw new Error("a03_fixture_approved_function_blocks_overlap");
  }
  let previousEnd = 0;
  const residualParts: string[] = [];
  for (const range of approvedRanges) {
    residualParts.push(template.slice(previousEnd, range.start));
    previousEnd = range.end;
  }
  residualParts.push(template.slice(previousEnd));
  if (stripSqlComments(residualParts.join("")).trim() !== "") {
    throw new Error("a03_fixture_contains_unapproved_top_level_statement");
  }
  if (/\bSECURITY\s+DEFINER\b/i.test(template) || /\bSET\s+row_security\b/i.test(template)) {
    throw new Error("a03_fixture_must_not_change_security_definer_or_row_security");
  }
  if ((template.match(/-- A03_TWO_SCOPE_GUARD_START/g) ?? []).length !== 3
    || (template.match(/-- A03_TWO_SCOPE_GUARD_END/g) ?? []).length !== 3) {
    throw new Error("a03_fixture_requires_one_closed_guard_per_replaced_function");
  }
  for (const placeholder of fixturePlaceholdersForVerification()) {
    if ((template.match(new RegExp(escapeRegex(placeholder), "g")) ?? []).length < 3) {
      throw new Error(`a03_fixture_placeholder_not_present_in_each_guard:${placeholder}`);
    }
  }
  if (/\b(?:format|quote_ident|quote_literal)\s*\(/i.test(template)) {
    throw new Error("a03_fixture_must_not_construct_dynamic_sql");
  }
}

function verifyRenderedFixtureSurface(rendered: string): void {
  if (/__A03_SCOPE_[AB]_(?:ID|KEY)__/i.test(rendered)) {
    throw new Error("a03_fixture_render_leaves_placeholder");
  }
  if ((rendered.match(/VALUES\s*\(/gi) ?? []).length !== 3) {
    throw new Error("a03_fixture_requires_exactly_two_literal_values_per_guard");
  }
  if ((rendered.match(/SET search_path = pg_catalog, pilot, pg_temp/g) ?? []).length !== 3) {
    throw new Error("a03_fixture_search_path_drift");
  }
  if ((rendered.match(/SECURITY INVOKER/g) ?? []).length !== 3) {
    throw new Error("a03_fixture_security_invoker_drift");
  }
}

function extractFunction(sql: string, signature: string, fixture: boolean): string {
  const range = locateFunction(sql, signature, fixture);
  return sql.slice(range.start, range.end);
}

function locateFunction(sql: string, signature: string, fixture: boolean): Readonly<{ start: number; end: number }> {
  const functionName = signature.slice(0, signature.indexOf("("));
  const startPattern = fixture
    ? new RegExp(`^CREATE OR REPLACE FUNCTION\\s+${escapeRegex(functionName)}\\s*\\(`, "m")
    : new RegExp(`^CREATE FUNCTION\\s+${escapeRegex(functionName)}\\s*\\(`, "m");
  const startMatch = startPattern.exec(sql);
  if (startMatch?.index === undefined) {
    throw new Error(`a03_fixture_function_missing:${functionName}`);
  }
  const endIndex = sql.indexOf("$$;", startMatch.index);
  if (endIndex < 0) {
    throw new Error(`a03_fixture_function_unterminated:${functionName}`);
  }
  return { start: startMatch.index, end: endIndex + 3 };
}

function replaceExactlyOne(value: string, pattern: RegExp, replacement: string): string {
  const matches = value.match(pattern);
  if (matches === null || matches.length !== 1) {
    throw new Error("a03_fixture_scope_guard_not_exactly_once");
  }
  return value.replace(pattern, replacement);
}

function normalizeSql(value: string): string {
  return value
    .replaceAll("\r\n", "\n")
    .replace(/--[^\n]*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function stripSqlComments(value: string): string {
  return value
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/--[^\n]*/g, "");
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sha256(value: string): string {
  return createHash("sha256").update(value.replaceAll("\r\n", "\n"), "utf8").digest("hex");
}
