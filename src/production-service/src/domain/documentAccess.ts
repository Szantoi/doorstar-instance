/** Stable source identity; a display path is never used as an authorization key. */
export interface SharePointDocumentIdentity {
  driveId: string;
  itemId: string;
  versionId: string;
}

export interface RetrievalPrincipalSet {
  /** Identity/role labels resolved by the application, never supplied by the LLM. */
  labels: readonly string[];
}

export interface DocumentAccessPolicy {
  /** "all" is reserved for documents intentionally visible to every signed-in Doorstar user. */
  allowedLabels: readonly string[];
}

/**
 * Retrieval-time ACL gate used before a document chunk enters either a search
 * result or an LLM context. Empty ACL is fail-closed.
 */
export function mayRetrieveDocument(viewer: RetrievalPrincipalSet, policy: DocumentAccessPolicy): boolean {
  if (policy.allowedLabels.includes("all")) return true;
  const permitted = new Set(policy.allowedLabels);
  return viewer.labels.some((label) => permitted.has(label));
}
