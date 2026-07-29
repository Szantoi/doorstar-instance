import type { SharePointReadConfig } from "./config.js";
import type { SharePointDocumentIdentity } from "../../domain/documentAccess.js";

const GRAPH_ROOT = "https://graph.microsoft.com/v1.0";

export interface GraphAccessTokenProvider {
  getAccessToken(): Promise<string>;
}

export interface SharePointDeltaPage {
  value: Array<{ id: string; name?: string; deleted?: unknown; eTag?: string; parentReference?: { id?: string } }>;
  "@odata.nextLink"?: string;
  "@odata.deltaLink"?: string;
}

/** Read-only Graph client. It intentionally exposes neither upload nor delete methods. */
export class SharePointGraphClient {
  constructor(
    private readonly config: SharePointReadConfig,
    private readonly tokens: GraphAccessTokenProvider,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async getDelta(deltaLink?: string): Promise<SharePointDeltaPage> {
    const url = deltaLink ?? `${GRAPH_ROOT}/drives/${encodeURIComponent(this.config.driveId)}/root/delta`;
    if (!url.startsWith(`${GRAPH_ROOT}/`)) throw new Error("untrusted_graph_delta_link");
    return this.getJson<SharePointDeltaPage>(url);
  }

  async getVersionMetadata(identity: SharePointDocumentIdentity): Promise<unknown> {
    this.assertDrive(identity);
    return this.getJson(`${GRAPH_ROOT}/drives/${encodeURIComponent(identity.driveId)}/items/${encodeURIComponent(identity.itemId)}/versions/${encodeURIComponent(identity.versionId)}`);
  }

  private assertDrive(identity: SharePointDocumentIdentity): void {
    if (identity.driveId !== this.config.driveId) throw new Error("sharepoint_document_outside_configured_drive");
  }

  private async getJson<T>(url: string): Promise<T> {
    const token = await this.tokens.getAccessToken();
    const response = await this.fetchImpl(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error(`sharepoint_graph_read_failed:${response.status}`);
    return response.json() as Promise<T>;
  }
}
