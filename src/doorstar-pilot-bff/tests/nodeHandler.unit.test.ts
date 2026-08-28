import { PassThrough } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import {
  createNodePilotBffHandler,
  pilotJsonBodyLimitBytes,
  type PilotBff,
  type PilotHttpRequest,
  type PilotHttpResponse,
} from "../src/index.js";
import { testConfig } from "./testDoubles.js";

describe("Node BFF HTTP adapter", () => {
  it("collects a bounded UTF-8 body and forwards it to the pure request contract", async () => {
    let received: PilotHttpRequest | undefined;
    const bff: PilotBff = {
      config: testConfig,
      handle: async (request) => {
        received = request;
        return jsonResponse(201);
      },
    };

    const result = await invoke(createNodePilotBffHandler(bff), {
      method: "POST",
      url: "/admin/users",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName: "Person" }),
    });

    expect(result.statusCode).toBe(201);
    expect(received).toMatchObject({
      method: "POST",
      url: "/admin/users",
      body: JSON.stringify({ displayName: "Person" }),
    });
  });

  it("rejects an oversized body before it reaches the BFF", async () => {
    const handle = vi.fn(async () => jsonResponse(200));
    const bff: PilotBff = { config: testConfig, handle };
    const body = "x".repeat(pilotJsonBodyLimitBytes + 1);

    const result = await invoke(createNodePilotBffHandler(bff), {
      method: "POST",
      url: "/admin/users",
      headers: {
        "content-type": "application/json",
        "content-length": String(Buffer.byteLength(body, "utf8")),
      },
      body,
    });

    expect(result.statusCode).toBe(413);
    expect(result.body).toBe(JSON.stringify({ error: "invalid_request" }));
    expect(handle).not.toHaveBeenCalled();
  });
});

async function invoke(
  handler: ReturnType<typeof createNodePilotBffHandler>,
  input: Readonly<{
    method: string;
    url: string;
    headers: Record<string, string>;
    body: string;
  }>,
): Promise<Readonly<{ statusCode: number; body: string | undefined }>> {
  const request = new PassThrough() as unknown as import("node:http").IncomingMessage;
  Object.assign(request, {
    method: input.method,
    url: input.url,
    headers: input.headers,
  });
  let resolveResult: ((value: Readonly<{ statusCode: number; body: string | undefined }>) => void) | undefined;
  const result = new Promise<Readonly<{ statusCode: number; body: string | undefined }>>((resolve) => {
    resolveResult = resolve;
  });
  const response = {
    writeHead: (statusCode: number) => ({ statusCode }),
    end: (body: string | undefined) => resolveResult?.({
      statusCode: (response as { statusCode?: number }).statusCode ?? 0,
      body,
    }),
  } as unknown as import("node:http").ServerResponse;
  const originalWriteHead = response.writeHead.bind(response);
  response.writeHead = ((statusCode: number, ...args: unknown[]) => {
    (response as unknown as { statusCode: number }).statusCode = statusCode;
    return originalWriteHead(statusCode, ...args as []);
  }) as typeof response.writeHead;

  handler(request, response);
  request.end(input.body);
  return result;
}

function jsonResponse(statusCode: number): PilotHttpResponse {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ok: true }),
  };
}
