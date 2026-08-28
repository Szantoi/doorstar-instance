import { Buffer } from "node:buffer";
import type { IncomingMessage, OutgoingHttpHeaders, ServerResponse } from "node:http";
import type { PilotBff } from "../application/pilotBff.js";
import { pilotJsonBodyLimitBytes, type PilotHttpResponse } from "./contracts.js";

/**
 * Adapter only. It never calls `listen`; the approved composition root owns
 * listener lifecycle, TLS termination and the injected infrastructure ports.
 * Request bodies are bounded before they become a string and pass only as
 * UTF-8 text to the pure BFF route contract.
 */
export function createNodePilotBffHandler(bff: PilotBff): (request: IncomingMessage, response: ServerResponse) => void {
  return (request, response) => {
    void readNodeRequestBody(request).then(
      (body) => bff.handle({
        method: request.method,
        url: request.url,
        headers: request.headers,
        body,
      }).then(
        (result) => writeNodeResponse(response, result),
        () => writeNodeResponse(response, unavailableResponse()),
      ),
      (error) => writeNodeResponse(response, nodeBodyErrorResponse(error)),
    );
  };
}

async function readNodeRequestBody(request: IncomingMessage): Promise<string | undefined> {
  const declaredLength = request.headers["content-length"];
  if (declaredLength !== undefined) {
    if (typeof declaredLength !== "string" || !/^[0-9]+$/.test(declaredLength)) {
      request.resume();
      throw new NodeBodyError("invalid");
    }
    if (Number(declaredLength) > pilotJsonBodyLimitBytes) {
      request.resume();
      throw new NodeBodyError("too_large");
    }
  }

  const chunks: Buffer[] = [];
  let length = 0;
  try {
    for await (const chunk of request) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      length += bytes.byteLength;
      if (length > pilotJsonBodyLimitBytes) {
        request.resume();
        throw new NodeBodyError("too_large");
      }
      chunks.push(bytes);
    }
  } catch (error) {
    if (error instanceof NodeBodyError) {
      throw error;
    }
    throw new NodeBodyError("invalid");
  }
  if (length === 0) {
    return undefined;
  }
  const bytes = Buffer.concat(chunks, length);
  const body = bytes.toString("utf8");
  if (!Buffer.from(body, "utf8").equals(bytes)) {
    throw new NodeBodyError("invalid");
  }
  return body;
}

function nodeBodyErrorResponse(error: unknown): PilotHttpResponse {
  if (error instanceof NodeBodyError && error.kind === "too_large") {
    return {
      statusCode: 413,
      headers: safeErrorHeaders,
      body: JSON.stringify({ error: "invalid_request" }),
    };
  }
  return {
    statusCode: 400,
    headers: safeErrorHeaders,
    body: JSON.stringify({ error: "invalid_request" }),
  };
}

function unavailableResponse(): PilotHttpResponse {
  return {
    statusCode: 500,
    headers: safeErrorHeaders,
    body: JSON.stringify({ error: "authentication_unavailable" }),
  };
}

const safeErrorHeaders = Object.freeze({
  "Cache-Control": "no-store",
  Pragma: "no-cache",
  "Content-Type": "application/json; charset=utf-8",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'; base-uri 'none'; frame-ancestors 'none'",
});

class NodeBodyError extends Error {
  public constructor(public readonly kind: "too_large" | "invalid") {
    super("pilot_node_request_body_invalid");
    this.name = "NodeBodyError";
  }
}

function writeNodeResponse(response: ServerResponse, result: PilotHttpResponse): void {
  const headers: OutgoingHttpHeaders = {};
  for (const [name, value] of Object.entries(result.headers)) {
    headers[name] = typeof value === "string" ? value : [...value];
  }
  response.writeHead(result.statusCode, headers);
  response.end(result.body);
}
