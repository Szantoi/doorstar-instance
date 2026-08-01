import type { Request, Response } from "express";

/** Stable Doorstar application roles. `vezeto` / `allomas` remain accepted
 * while the login-less UI transitions to the more precise role codes. */
export const doorstarRoles = [
  "sales", "technical_preparation", "order_approver", "production_planner",
  "shop_floor", "installer", "warehouse_dispatch", "administrator", "reader",
] as const;
export type DoorstarRole = typeof doorstarRoles[number];
export type RequestRole = DoorstarRole | "vezeto" | "allomas";

/** Temporary role guard for the login-less shop-floor UI. It mirrors the
 * X-Role/X-Station values supplied by the frontend until real authentication
 * replaces these headers. */
export function getRequester(req: Request): { role: RequestRole; station: string } {
  const candidate = req.header("x-role") ?? "vezeto";
  const role: RequestRole = candidate === "vezeto" || candidate === "allomas" || (doorstarRoles as readonly string[]).includes(candidate)
    ? candidate as RequestRole
    : "reader";
  return { role, station: req.header("x-station") ?? "" };
}

/** Capture a stable declared actor identifier for audit rows. Real identity
 * authentication is intentionally outside this transitional header boundary;
 * callers without X-Principal receive an explicit compatibility identifier
 * instead of a fabricated person name. */
export function getRequesterPrincipal(req: Request): string {
  const declared = req.header("x-principal")?.trim();
  if (declared) return declared.slice(0, 200);
  return `legacy-role:${getRequester(req).role}`;
}

/** Compatibility maps the historic leader header to administrator capability. */
export function hasRole(req: Request, permitted: readonly DoorstarRole[]): boolean {
  const { role } = getRequester(req);
  return role === "vezeto" || role === "administrator" || permitted.includes(role as DoorstarRole);
}

export function requireRole(req: Request, res: Response, permitted: readonly DoorstarRole[]): boolean {
  if (hasRole(req, permitted)) return true;
  res.status(403).json({ error: "role_not_permitted" });
  return false;
}

/** Return false after producing the standard response for a manager-only
 * action requested by an operator account. */
export function requireManager(req: Request, res: Response): boolean {
  if (hasRole(req, [])) return true;
  res.status(403).json({ error: "manager_role_required" });
  return false;
}
