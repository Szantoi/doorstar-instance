import type pino from "pino";

/**
 * HTTP request/response logs are deliberately metadata-only. In particular,
 * they must never retain headers, query strings, request bodies, response
 * headers, or raw Error objects: an M2 BFF will carry cookies, CSRF material,
 * OIDC callback parameters, and authorization headers through this process.
 */
export function serializeSafeHttpRequest(value: unknown): Readonly<Record<string, string | number>> {
  const request = asRecord(value);
  const result: Record<string, string | number> = {};
  const id = request?.id;
  const method = request?.method;
  const path = request?.url;

  if (typeof id === "string" || typeof id === "number") result.id = id;
  if (typeof method === "string") result.method = method.slice(0, 16);
  if (typeof path === "string") result.path = stripQueryAndFragment(path);
  return Object.freeze(result);
}

/** Response headers can contain Set-Cookie and Location, so retain only status. */
export function serializeSafeHttpResponse(value: unknown): Readonly<Record<string, number>> {
  const statusCode = asRecord(value)?.statusCode;
  const result: Record<string, number> = {};

  if (typeof statusCode === "number" && Number.isInteger(statusCode) && statusCode >= 100 && statusCode <= 999) {
    result.statusCode = statusCode;
  }

  return Object.freeze(result);
}

/** Error messages/stacks can be built from untrusted request material. */
export function serializeSafeError(_value: unknown): Readonly<{ readonly type: "redacted_error" }> {
  return Object.freeze({ type: "redacted_error" });
}

const redactedErrorMessage = "redacted error";

/**
 * Pino derives `msg` from an Error if a caller omits a message. Apply this hook
 * everywhere an error serializer is installed so that convenience behavior
 * cannot serialize the raw Error message before the serializer runs.
 */
export function redactErrorLogMessage(
  this: pino.Logger,
  args: Parameters<pino.LogFn>,
  method: pino.LogFn,
  _level: number,
): void {
  const firstArgument = args[0];

  if (firstArgument instanceof Error) {
    method.apply(this, [{ err: firstArgument }, redactedErrorMessage]);
    return;
  }

  if (hasOwnErrorField(firstArgument)) {
    method.apply(this, [firstArgument, redactedErrorMessage]);
    return;
  }

  method.apply(this, args);
}

function asRecord(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return typeof value === "object" && value !== null
    ? value as Readonly<Record<string, unknown>>
    : undefined;
}

function stripQueryAndFragment(value: string): string {
  const delimiter = value.search(/[?#]/u);
  return (delimiter < 0 ? value : value.slice(0, delimiter)).slice(0, 2_048);
}

function hasOwnErrorField(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && Object.prototype.hasOwnProperty.call(value, "err");
}
