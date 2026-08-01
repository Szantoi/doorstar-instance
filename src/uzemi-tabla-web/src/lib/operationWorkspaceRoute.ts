export const operationWorkspaceRoutePattern =
  "orders/:projectKey/revisions/:revision/operations";

/** Exact-revision path for the office-facing operation-definition handoff. */
export function operationWorkspacePath(projectKey: string, revision: number | string) {
  return `/orders/${encodeURIComponent(projectKey)}/revisions/${encodeURIComponent(String(revision))}/operations`;
}
