const importTestSchemaPattern = /^doorstar_test_vitest_[a-z0-9_]+$/;

/**
 * Legacy import writes remain forbidden outside the named review schema.
 * Ephemeral Vitest schemas are accepted solely to exercise the same guarded
 * HTTP workflow without ever touching reviewable test data.
 */
export function isImportTestSchema(schema: string | null): boolean {
  return schema === "doorstar_test" || Boolean(schema && importTestSchemaPattern.test(schema));
}
