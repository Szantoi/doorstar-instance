const scopeKeyPattern = /^[a-z][a-z0-9-]{2,79}$/;

/** Pilot scope keys are configuration, not request parameters. Keeping the
 * validator here makes the future deployment preflight deterministic. */
export function isValidPilotScopeKey(value: string): boolean {
  return scopeKeyPattern.test(value);
}

export function requirePilotScopeKey(value: string | undefined): string {
  if (!value || !isValidPilotScopeKey(value)) {
    throw new Error("doorstar_pilot_scope_key_invalid");
  }
  return value;
}

/** Production may start only when its configured scope is the sole persisted
 * scope. Disposable staging proofs deliberately exercise more than one scope
 * and must not use this production preflight. */
export function requireSingleProductionPilotScope(
  configuredScopeKey: string | undefined,
  persistedScopeKeys: readonly string[],
): string {
  const scopeKey = requirePilotScopeKey(configuredScopeKey);
  if (persistedScopeKeys.length !== 1 || persistedScopeKeys[0] !== scopeKey) {
    throw new Error("doorstar_pilot_scope_cardinality_invalid");
  }
  return scopeKey;
}
