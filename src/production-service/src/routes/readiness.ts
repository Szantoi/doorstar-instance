import { Router, type Request, type Response } from "express";
import { doorstarRoles, type DoorstarRole } from "../middleware/requester.js";
import {
  getOrderRevisionReadiness,
  getProjectWorkflow,
  OrderRevisionReadinessError,
} from "../services/orderRevisionReadiness.js";

export const readinessRouter = Router();

const messages: Record<string, string> = {
  invalid_revision: "Revision must be a positive integer.",
  role_not_authorized: "The declared role is not authorized for this read model.",
  project_not_found: "Project was not found.",
  order_revision_not_found: "Order revision was not found.",
  readiness_projection_conflict: "The readiness projection could not resolve a consistent exact revision.",
};

function requestId(req: Request) {
  const id = (req as Request & { id?: string | number }).id;
  return String(id ?? req.header("x-request-id") ?? "unknown");
}

function sendError(
  req: Request,
  res: Response,
  status: 400 | 403 | 404 | 409,
  code: string,
  details: Record<string, unknown> = {},
) {
  res.status(status).json({
    error: {
      code,
      message: messages[code] ?? code,
      details,
      requestId: requestId(req),
    },
  });
}

/** Preserve the existing header-only read boundary while emitting only
 * canonical roles. Missing headers remain read-only `reader`; transitional
 * role aliases map to their already-supported canonical capability. */
function canonicalReadRole(req: Request): DoorstarRole | null {
  const declared = req.header("x-role");
  if (declared === undefined) return "reader";
  if (declared === "vezeto") return "administrator";
  if (declared === "allomas") return "shop_floor";
  return (doorstarRoles as readonly string[]).includes(declared)
    ? declared as DoorstarRole
    : null;
}

async function project(
  req: Request,
  res: Response,
  run: (role: DoorstarRole) => Promise<unknown>,
) {
  const role = canonicalReadRole(req);
  if (!role) return void sendError(req, res, 403, "role_not_authorized", { role: req.header("x-role") });
  try {
    res.json(await run(role));
  } catch (error) {
    if (!(error instanceof OrderRevisionReadinessError)) throw error;
    sendError(req, res, error.status, error.code, error.details);
  }
}

readinessRouter.get(
  "/production-orders/:projectKey/revisions/:revision/readiness",
  async (req, res) => {
    const revision = Number(req.params.revision);
    if (!Number.isInteger(revision) || revision < 1) {
      return void sendError(req, res, 400, "invalid_revision", { revision: req.params.revision });
    }
    await project(req, res, (role) => getOrderRevisionReadiness(req.params.projectKey, revision, role));
  },
);

readinessRouter.get("/projects/:projectKey/workflow", async (req, res) => {
  await project(req, res, (role) => getProjectWorkflow(req.params.projectKey, role));
});
