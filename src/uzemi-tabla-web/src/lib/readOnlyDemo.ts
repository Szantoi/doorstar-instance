/**
 * Release-only presentation profile. Vite replaces this at build time, so the
 * normal product build remains unchanged unless it is explicitly enabled.
 */
export const isReadOnlyDemo = import.meta.env.VITE_READ_ONLY_DEMO === "true";

/**
 * Resolves the optional external Flow Lab demonstration URL. Configuration is
 * deliberately fail-closed: the browser only receives a link for an absolute
 * HTTPS URL that does not carry credentials.
 */
export function resolveFlowLabReadonlyUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;

  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}

export function getFlowLabReadonlyUrl(): string | null {
  if (import.meta.env.VITE_READ_ONLY_DEMO !== "true") return null;

  return resolveFlowLabReadonlyUrl(import.meta.env.VITE_FLOW_LAB_READONLY_URL);
}
