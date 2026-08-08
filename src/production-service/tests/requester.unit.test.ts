import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { requireExplicitRole } from "../src/middleware/requester.js";

function requesterWithRole(role: string | undefined): Request {
  return {
    header: vi.fn((name: string) => name.toLowerCase() === "x-role" ? role : undefined),
  } as unknown as Request;
}

function responseRecorder() {
  const json = vi.fn();
  const status = vi.fn();
  const response = { status, json } as unknown as Response;
  status.mockReturnValue(response);
  return { response, status, json };
}

describe("explicit declared-role guard", () => {
  const permitted = ["sales", "administrator"] as const;

  it.each([
    ["missing", undefined],
    ["blank", "   "],
  ])("returns the stable 401 for a %s X-Role", (_label, role) => {
    const { response, status, json } = responseRecorder();

    expect(requireExplicitRole(
      requesterWithRole(role),
      response,
      permitted,
      "authenticated_sales_principal_required",
    )).toBe(false);
    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith({ error: "authenticated_sales_principal_required" });
  });

  it.each(["vezeto", "allomas", "reader", "technical_preparation", "unknown"])(
    "returns the stable 403 for declared role %s",
    (role) => {
      const { response, status, json } = responseRecorder();

      expect(requireExplicitRole(
        requesterWithRole(role),
        response,
        permitted,
        "authenticated_sales_principal_required",
      )).toBe(false);
      expect(status).toHaveBeenCalledWith(403);
      expect(json).toHaveBeenCalledWith({ error: "role_not_permitted" });
    },
  );

  it.each(["sales", "administrator"])("allows explicit role %s", (role) => {
    const { response, status, json } = responseRecorder();

    expect(requireExplicitRole(
      requesterWithRole(role),
      response,
      permitted,
      "authenticated_sales_principal_required",
    )).toBe(true);
    expect(status).not.toHaveBeenCalled();
    expect(json).not.toHaveBeenCalled();
  });
});
