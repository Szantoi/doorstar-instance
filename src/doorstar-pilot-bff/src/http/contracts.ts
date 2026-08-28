export type PilotHttpHeaderValue = string | readonly string[] | undefined;

/** The largest JSON admin payload accepted by the pure route and Node adapter. */
export const pilotJsonBodyLimitBytes = 8_192;

export type PilotHttpRequest = Readonly<{
  method: string | undefined;
  url: string | undefined;
  headers: Readonly<Record<string, PilotHttpHeaderValue>>;
  /** UTF-8 JSON collected by a bounded adapter; never a stream or raw socket. */
  body?: string;
}>;

export type PilotHttpResponse = Readonly<{
  statusCode: number;
  headers: Readonly<Record<string, string | readonly string[]>>;
  body?: string;
}>;
