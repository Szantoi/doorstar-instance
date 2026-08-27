import type { IncomingMessage, OutgoingHttpHeaders, ServerResponse } from "node:http";
import type { PilotBff } from "../application/pilotBff.js";
import type { PilotHttpResponse } from "./contracts.js";

/**
 * Adapter only. It never calls `listen`; the approved composition root owns
 * listener lifecycle, TLS termination and the injected infrastructure ports.
 */
export function createNodePilotBffHandler(bff: PilotBff): (request: IncomingMessage, response: ServerResponse) => void {
  return (request, response) => {
    request.resume();
    void bff.handle({
      method: request.method,
      url: request.url,
      headers: request.headers,
    }).then(
      (result) => writeNodeResponse(response, result),
      () => writeNodeResponse(response, {
        statusCode: 500,
        headers: {
          "Cache-Control": "no-store",
          "Content-Type": "application/json; charset=utf-8",
        },
        body: JSON.stringify({ error: "authentication_unavailable" }),
      }),
    );
  };
}

function writeNodeResponse(response: ServerResponse, result: PilotHttpResponse): void {
  const headers: OutgoingHttpHeaders = {};
  for (const [name, value] of Object.entries(result.headers)) {
    headers[name] = typeof value === "string" ? value : [...value];
  }
  response.writeHead(result.statusCode, headers);
  response.end(result.body);
}
