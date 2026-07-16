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

interface ApiFetchOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
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
  // Sent so the backend can apply the same "Vezető vs. Állomás" restriction
  // the UI does. This is not real auth — a shop-floor tool with no login —
  // just a safety rail against the app itself letting a station touch
  // another station's work; a direct API call could still spoof these.
  const { role, myStation } = useUiStore.getState();

  const res = await fetch(`${path}${buildQuery(options.query)}`, {
    method: options.method ?? "GET",
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      "X-Role": role,
      "X-Station": myStation,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
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
