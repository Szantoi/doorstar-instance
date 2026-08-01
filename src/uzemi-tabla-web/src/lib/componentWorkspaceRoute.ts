export const componentWorkspaceRoutePattern =
  "orders/:projectKey/revisions/:revision/calculator";

export function componentWorkspacePath(projectKey: string, revision: number | string) {
  return `/orders/${encodeURIComponent(projectKey)}/revisions/${encodeURIComponent(String(revision))}/calculator`;
}
