/** Closed, server-side pilot roles. Never deserialize this from a request. */
export const pilotOfficeRoles = [
  "SALES",
  "TECHNICAL_PREPARATION",
  "ORDER_APPROVER",
  "PRODUCTION_PLANNER",
  "INSTALLER",
  "WAREHOUSE_DISPATCH",
  "ADMINISTRATOR",
  "READER",
  "SHOP_FLOOR",
] as const;

export type PilotOfficeRole = typeof pilotOfficeRoles[number];

const effectiveRosterManagerRoles = new Set<PilotOfficeRole>([
  "SALES",
  "TECHNICAL_PREPARATION",
  "ORDER_APPROVER",
  "PRODUCTION_PLANNER",
  "INSTALLER",
  "WAREHOUSE_DISPATCH",
  "ADMINISTRATOR",
  "READER",
]);

export type PilotRosterAuthority = Readonly<{
  active: boolean;
  role: PilotOfficeRole;
  canManagePilotRoster: boolean;
}>;

/** Canonical source predicate that the A-phase PostgreSQL helper must mirror.
 * `SHOP_FLOOR` is intentionally deny-by-default even if a historical flag is
 * present, so a future role cannot silently become a roster manager. */
export function isEffectivePilotRosterManager(authority: PilotRosterAuthority): boolean {
  return authority.active
    && authority.canManagePilotRoster
    && effectiveRosterManagerRoles.has(authority.role);
}
