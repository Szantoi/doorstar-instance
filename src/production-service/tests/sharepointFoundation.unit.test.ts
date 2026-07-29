import { describe, expect, it } from "vitest";
import { mayRetrieveDocument } from "../src/domain/documentAccess.js";
import { loadSharePointConfig } from "../src/services/sharepoint/config.js";
import { SharePointGraphClient } from "../src/services/sharepoint/graphClient.js";

describe("SharePoint and GraphRAG security foundation", () => {
  it("remains disabled until every required identifier is configured", () => {
    expect(loadSharePointConfig({})).toEqual({ mode: "disabled" });
    expect(() => loadSharePointConfig({ SHAREPOINT_TENANT_ID: "tenant" })).toThrow("incomplete_sharepoint_configuration");
  });

  it("filters GraphRAG retrieval before content reaches a model", () => {
    expect(mayRetrieveDocument({ labels: ["station:CNC"] }, { allowedLabels: ["role:manager"] })).toBe(false);
    expect(mayRetrieveDocument({ labels: ["station:CNC"] }, { allowedLabels: ["station:CNC"] })).toBe(true);
    expect(mayRetrieveDocument({ labels: [] }, { allowedLabels: [] })).toBe(false);
  });

  it("does not follow a delta link outside Microsoft Graph", async () => {
    const client = new SharePointGraphClient(
      { mode: "read_only", tenantId: "tenant", clientId: "client", siteId: "site", driveId: "allowed-drive" },
      { getAccessToken: async () => "token" },
      async () => new Response(JSON.stringify({ value: [] }), { status: 200 }),
    );
    await expect(client.getDelta("https://example.invalid/delta")).rejects.toThrow("untrusted_graph_delta_link");
    await expect(client.getVersionMetadata({ driveId: "another-drive", itemId: "item", versionId: "version" })).rejects.toThrow("outside_configured_drive");
  });
});
