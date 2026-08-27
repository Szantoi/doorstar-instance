export type PilotHttpHeaderValue = string | readonly string[] | undefined;

export type PilotHttpRequest = Readonly<{
  method: string | undefined;
  url: string | undefined;
  headers: Readonly<Record<string, PilotHttpHeaderValue>>;
}>;

export type PilotHttpResponse = Readonly<{
  statusCode: number;
  headers: Readonly<Record<string, string | readonly string[]>>;
  body?: string;
}>;
