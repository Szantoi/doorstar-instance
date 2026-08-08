import path from "node:path";

/** Server-side directory configuration for the explicit, audited Flow Lab
 * import. The HTTP API never accepts artifact bytes or a caller-controlled
 * path; dispatcher/promotion transport remains outside this demo release. */
export class FlowLabExchangeConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FlowLabExchangeConfigurationError";
  }
}

export function requireFlowLabPlanInboxDirectory(environment = process.env): string {
  const configured = environment.FLOW_LAB_PLAN_INBOX_DIR?.trim();
  if (!configured) {
    throw new FlowLabExchangeConfigurationError("FLOW_LAB_PLAN_INBOX_DIR is required for Flow Lab plan import");
  }
  return path.resolve(configured);
}
