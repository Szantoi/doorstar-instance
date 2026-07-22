/**
 * Small, GET-only client for the Doorstar Production Service.
 *
 * The adapter deliberately does not expose a generic request method: every
 * public method maps to one approved read endpoint. This makes it impossible
 * for an MCP tool to turn into a write proxy by accepting a method or path
 * from an agent.
 */
export const DEFAULT_API_BASE_URL = "http://127.0.0.1:4610/api/production";

const DEFAULT_TIMEOUT_MS = 8_000;

export class ProductionApiError extends Error {
  constructor(public readonly kind: "not_found" | "unavailable" | "unexpected") {
    super(kind);
  }
}

export type FetchImplementation = typeof fetch;

export interface ProductionApiOptions {
  baseUrl?: string;
  fetchImplementation?: FetchImplementation;
  timeoutMs?: number;
}

/** Calculate the local Monday used by the Production Service as its default week. */
export function currentMonday(now = new Date()): string {
  const local = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = local.getDay();
  local.setDate(local.getDate() - (day === 0 ? 6 : day - 1));
  // Do not use toISOString(): at Hungarian midnight that would serialize the
  // preceding UTC day and ask the board for Sunday instead of Monday.
  const year = local.getFullYear();
  const month = String(local.getMonth() + 1).padStart(2, "0");
  const date = String(local.getDate()).padStart(2, "0");
  return `${year}-${month}-${date}`;
}

export class ProductionApi {
  private readonly baseUrl: URL;
  private readonly fetchImplementation: FetchImplementation;
  private readonly timeoutMs: number;

  constructor(options: ProductionApiOptions = {}) {
    const rawUrl = options.baseUrl ?? process.env.DOORSTAR_PRODUCTION_API_BASE_URL ?? DEFAULT_API_BASE_URL;
    try {
      this.baseUrl = new URL(rawUrl.endsWith("/") ? rawUrl : `${rawUrl}/`);
    } catch {
      throw new Error("DOORSTAR_PRODUCTION_API_BASE_URL must be a valid HTTP(S) URL.");
    }
    if (this.baseUrl.protocol !== "http:" && this.baseUrl.protocol !== "https:") {
      throw new Error("DOORSTAR_PRODUCTION_API_BASE_URL must use HTTP or HTTPS.");
    }
    this.fetchImplementation = options.fetchImplementation ?? fetch;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  getOverview(week = currentMonday()): Promise<unknown> {
    return Promise.all([this.getProjects(), this.getBoard(week)]).then(([projects, board]) => ({ week, projects, board }));
  }

  getProjects(): Promise<unknown> {
    return this.get("projects");
  }

  getProject(key: string): Promise<unknown> {
    return this.get(`projects/${encodeURIComponent(key)}`);
  }

  getBoard(week: string): Promise<unknown> {
    return this.get("board", { week });
  }

  getKanban(station: string, week: string): Promise<unknown> {
    return this.get("kanban", { station, week });
  }

  getLoad(week: string): Promise<unknown> {
    return this.get("load", { week });
  }

  getTask(id: string): Promise<unknown> {
    return this.get(`tasks/${encodeURIComponent(id)}`);
  }

  private async get(path: string, query: Record<string, string> = {}): Promise<unknown> {
    const url = new URL(path, this.baseUrl);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      // No headers are forwarded and this request is always an HTTP GET.
      const response = await this.fetchImplementation(url, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      if (response.status === 404) throw new ProductionApiError("not_found");
      if (!response.ok) throw new ProductionApiError("unexpected");
      return await response.json();
    } catch (error) {
      if (error instanceof ProductionApiError) throw error;
      throw new ProductionApiError("unavailable");
    } finally {
      clearTimeout(timeout);
    }
  }
}
