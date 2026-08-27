import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export const fixtureFunctionSignatures = [
  'pilot.doorstar_require_pilot_write_context(p_source pilot."BindingAuditSource")',
  "pilot.pilot_runtime_preflight_v1()",
  "pilot.pilot_bootstrap_preflight_v1()",
] as const;

export type DisposableScope = Readonly<{
  id: string;
  scopeKey: string;
}>;

export type TwoScopeFixtureInput = Readonly<{
  scopeA: DisposableScope;
  scopeB: DisposableScope;
}>;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const scopeKeyPattern = /^[a-z][a-z0-9-]{2,79}$/;
const fixturePlaceholders = [
  "__A03_SCOPE_A_ID__",
  "__A03_SCOPE_A_KEY__",
  "__A03_SCOPE_B_ID__",
  "__A03_SCOPE_B_KEY__",
] as const;

/**
 * Resolves to the package-root fixture in both tsx source execution and the
 * compiled CLI. The file is data, not a Prisma migration or a runtime import.
 */
export function twoScopeFixturePath(): string {
  return fileURLToPath(new URL("../../fixture/two-scope-preflight.fixture.sql", import.meta.url));
}

export async function loadTwoScopeFixtureTemplate(): Promise<string> {
  return readFile(twoScopeFixturePath(), "utf8");
}

/**
 * Renders two fresh, validated values into a deliberately closed fixture.
 * Values are never read from the production runtime environment and callers
 * must not persist this rendered SQL.
 */
export function renderTwoScopeFixture(template: string, input: TwoScopeFixtureInput): string {
  const scopeA = normalizeScope(input.scopeA, "scopeA");
  const scopeB = normalizeScope(input.scopeB, "scopeB");
  if (scopeA.id === scopeB.id || scopeA.scopeKey === scopeB.scopeKey) {
    throw new Error("a03_fixture_scope_pairs_must_be_distinct");
  }

  const replacementMap: Readonly<Record<(typeof fixturePlaceholders)[number], string>> = {
    __A03_SCOPE_A_ID__: scopeA.id,
    __A03_SCOPE_A_KEY__: scopeA.scopeKey,
    __A03_SCOPE_B_ID__: scopeB.id,
    __A03_SCOPE_B_KEY__: scopeB.scopeKey,
  };

  let rendered = template;
  for (const [placeholder, value] of Object.entries(replacementMap)) {
    if (!rendered.includes(placeholder)) {
      throw new Error(`a03_fixture_template_missing_${placeholder.toLowerCase()}`);
    }
    rendered = rendered.replaceAll(placeholder, value);
  }
  if (fixturePlaceholders.some((placeholder) => rendered.includes(placeholder))) {
    throw new Error("a03_fixture_template_contains_unresolved_placeholder");
  }
  return rendered;
}

export function fixturePlaceholdersForVerification(): readonly string[] {
  return fixturePlaceholders;
}

function normalizeScope(scope: DisposableScope, label: string): DisposableScope {
  const id = scope.id.toLowerCase();
  if (!uuidPattern.test(id)) {
    throw new Error(`a03_fixture_${label}_id_invalid`);
  }
  if (!scopeKeyPattern.test(scope.scopeKey)) {
    throw new Error(`a03_fixture_${label}_scope_key_invalid`);
  }
  return { id, scopeKey: scope.scopeKey };
}
