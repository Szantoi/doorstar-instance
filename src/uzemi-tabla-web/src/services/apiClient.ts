/** Thin typed fetch wrapper, mirroring joinerytech-portal's
 * src/services/apiClient.ts (apiFetch<T>(path, {method, query, body})). */
import { useUiStore } from "@/store/uiStore";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface ApiFetchOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  /**
   * Flow Lab's read workspace must not promote browser-selected role or
   * station state into an authority header. A gateway session may still add
   * authenticated context outside this client.
   */
  identityHeaders?: "default" | "omit";
  /** The Flow Lab contract is independently versioned, so read it fresh. */
  cache?: RequestCache;
}

function buildQuery(query?: ApiFetchOptions["query"]): string {
  if (!query) return "";
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  // Default requests retain the legacy UI safety rail. Flow Lab GETs opt out:
  // the local picker is never browser-side identity or authorization.
  const { role, myStation } = useUiStore.getState();
  const identityHeaders: Record<string, string> = options.identityHeaders === "omit"
    ? {}
    : { "X-Role": role, "X-Station": myStation };

  const res = await fetch(`${path}${buildQuery(options.query)}`, {
    method: options.method ?? "GET",
    cache: options.cache,
    headers: {
      ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...identityHeaders,
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  if (!res.ok) {
    let details: unknown;
    try {
      details = await res.json();
    } catch {
      details = undefined;
    }
    throw new ApiError(res.status, `${options.method ?? "GET"} ${path} failed (${res.status})`, details);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
