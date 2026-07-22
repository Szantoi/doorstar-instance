import type { Request, Response } from "express";

/** Temporary role guard for the login-less shop-floor UI. It mirrors the
 * X-Role/X-Station values supplied by the frontend until real authentication
 * replaces these headers. */
export function getRequester(req: Request): { role: string; station: string } {
  return { role: req.header("x-role") ?? "vezeto", station: req.header("x-station") ?? "" };
}

/** Return false after producing the standard response for a manager-only
 * action requested by an operator account. */
export function requireManager(req: Request, res: Response): boolean {
  if (getRequester(req).role === "vezeto") return true;
  res.status(403).json({ error: "manager_role_required" });
  return false;
}
