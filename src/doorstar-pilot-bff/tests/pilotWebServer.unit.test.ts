import { createServer, request as nodeHttpRequest, type Server } from "node:http";
import { describe, expect, it, vi } from "vitest";
import {
  createPilotWebRequestHandler,
  loadPilotOfficeStaticAssets,
  startPilotWebServer,
  type PilotBffRuntime,
  type PilotHttpResponse,
  type PilotOfficeStaticAssets,
} from "../src/index.js";
import { testConfig } from "./testDoubles.js";

describe("pilot web composition", () => {
  it("allows only reviewed static assets and delegates the auth/admin namespaces", async () => {
    const assets = await loadPilotOfficeStaticAssets();
    const delegatedRequests: string[] = [];
    const listener = createServer(createPilotWebRequestHandler((request, response) => {
      delegatedRequests.push(request.url ?? "");
      response.writeHead(209, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ delegated: true }));
    }, assets));
    const port = await listenOnEphemeralLoopback(listener);

    try {
      const shell = await requestLoopback(port, "/");
      expect(shell.statusCode).toBe(200);
      expect(shell.headers["content-security-policy"]).toContain("connect-src 'self'");
      expect(shell.body).toContain('href="/auth/login"');
      expect(delegatedRequests).toEqual([]);

      const client = await requestLoopback(port, "/assets/office.js");
      expect(client.statusCode).toBe(200);
      expect(client.headers["content-type"]).toContain("text/javascript");
      expect(client.body).toContain('session: "/auth/session"');
      expect(client.body).toContain('users: "/admin/users"');
      expect(client.body).not.toContain("localStorage");
      expect(client.body).not.toContain("Authorization");
      expect(client.body).toContain("function clearAuthenticatedOfficeState()");
      expect(client.body).toContain('elements.principalName.textContent = ""');
      expect(client.body).toContain("elements.rosterList.replaceChildren()");
      expect(client.body).toContain("elements.updateDialog.close()");

      const auth = await requestLoopback(port, "/auth/session");
      expect(auth.statusCode).toBe(209);
      expect(delegatedRequests).toEqual(["/auth/session"]);

      const callback = "/auth/callback?code=approved-code&state=browser-state";
      const callbackResponse = await requestLoopback(port, callback);
      expect(callbackResponse.statusCode).toBe(209);
      expect(delegatedRequests).toContain(callback);

      const callbackWithExtraQuery = `${callback}&unexpected=must-reach-bff`;
      const extraQueryResponse = await requestLoopback(port, callbackWithExtraQuery);
      expect(extraQueryResponse.statusCode).toBe(209);
      expect(delegatedRequests).toContain(callbackWithExtraQuery);

      const unknown = await requestLoopback(port, "/not-an-asset");
      expect(unknown.statusCode).toBe(404);
      expect(delegatedRequests).toHaveLength(3);

      const traversalLike = await requestLoopback(port, "/%2e%2e/assets/office.js");
      expect(traversalLike.statusCode).toBe(404);
      expect(delegatedRequests).toHaveLength(3);

      const staticPost = await requestLoopback(port, "/", "POST");
      expect(staticPost.statusCode).toBe(405);
      expect(staticPost.headers.allow).toBe("GET, HEAD");

      const bodyBearingStaticRequest = await requestLoopback(port, "/", "GET", "not-allowed", {
        "content-length": "11",
      });
      expect(bodyBearingStaticRequest.statusCode).toBe(400);
      expect(bodyBearingStaticRequest.headers.connection).toBe("close");
      expect(delegatedRequests).toHaveLength(3);

      const transferEncodedStaticRequest = await requestLoopback(port, "/", "GET", "not-allowed", {
        "transfer-encoding": "chunked",
      });
      expect(transferEncodedStaticRequest.statusCode).toBe(400);
      expect(transferEncodedStaticRequest.headers.connection).toBe("close");

      const largeDeclaredStaticRequest = await requestLoopback(port, "/", "GET", "", {
        "content-length": "999999999",
      });
      expect(largeDeclaredStaticRequest.statusCode).toBe(400);
      expect(largeDeclaredStaticRequest.headers.connection).toBe("close");
    } finally {
      await closeServer(listener);
    }
  });

  it("validates configuration before composing the runtime or binding a listener", async () => {
    const createRuntime = vi.fn(async () => fakeRuntime().runtime);

    await expect(startPilotWebServer({
      environment: {},
      createRuntime,
      staticAssets: await loadPilotOfficeStaticAssets(),
    })).rejects.toThrow("missing_doorstar_pilot_listener_port");

    expect(createRuntime).not.toHaveBeenCalled();
  });

  it("does not bind when BFF composition/preflight fails", async () => {
    const port = await reserveLoopbackPort();
    const createRuntime = vi.fn(async (): Promise<PilotBffRuntime> => {
      throw new Error("runtime_preflight_failed");
    });

    await expect(startPilotWebServer({
      environment: { DOORSTAR_PILOT_LISTENER_PORT: String(port) },
      createRuntime,
      staticAssets: await loadPilotOfficeStaticAssets(),
    })).rejects.toThrow("runtime_preflight_failed");

    expect(createRuntime).toHaveBeenCalledOnce();
    const check = createServer();
    await listenOnPort(check, port);
    await closeServer(check);
  });

  it("binds the composed surface only to loopback and closes the runtime once", async () => {
    const port = await reserveLoopbackPort();
    const { runtime, close } = fakeRuntime();
    const logger = { info: vi.fn(), error: vi.fn() };
    const server = await startPilotWebServer({
      environment: { DOORSTAR_PILOT_LISTENER_PORT: String(port) },
      createRuntime: async () => runtime,
      staticAssets: await loadPilotOfficeStaticAssets(),
      logger,
    });

    try {
      expect(server.config).toEqual({ listenerHost: "127.0.0.1", listenerPort: port });
      const shell = await requestLoopback(port, "/");
      expect(shell.statusCode).toBe(200);
      expect(logger.info).toHaveBeenCalledWith("pilot_web_listener_started", {
        host: "127.0.0.1",
        port,
      });
    } finally {
      await server.close();
      await server.close();
    }

    expect(close).toHaveBeenCalledOnce();
  });

  it("closes the composed runtime when listener binding fails", async () => {
    const occupiedListener = createServer();
    const port = await listenOnEphemeralLoopback(occupiedListener);
    const { runtime, close } = fakeRuntime();

    try {
      await expect(startPilotWebServer({
        environment: { DOORSTAR_PILOT_LISTENER_PORT: String(port) },
        createRuntime: async () => runtime,
        staticAssets: await loadPilotOfficeStaticAssets(),
      })).rejects.toMatchObject({ code: "EADDRINUSE" });
    } finally {
      await closeServer(occupiedListener);
    }

    expect(close).toHaveBeenCalledOnce();
  });
});

function fakeRuntime(): Readonly<{
  runtime: PilotBffRuntime;
  close: ReturnType<typeof vi.fn>;
}> {
  const close = vi.fn(async (): Promise<void> => undefined);
  const response: PilotHttpResponse = {
    statusCode: 401,
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ error: "authentication_required" }),
  };
  return {
    runtime: {
      config: testConfig,
      handle: async () => response,
      close,
    },
    close,
  };
}

function listenOnEphemeralLoopback(server: Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen({ host: "127.0.0.1", port: 0, exclusive: true }, () => {
      server.off("error", reject);
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("loopback_address_unavailable"));
        return;
      }
      resolve(address.port);
    });
  });
}

async function reserveLoopbackPort(): Promise<number> {
  const server = createServer();
  const port = await listenOnEphemeralLoopback(server);
  await closeServer(server);
  return port;
}

function listenOnPort(server: Server, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen({ host: "127.0.0.1", port, exclusive: true }, () => {
      server.off("error", reject);
      resolve();
    });
  });
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

function requestLoopback(
  port: number,
  path: string,
  method = "GET",
  body = "",
  headers: Readonly<Record<string, string>> = {},
): Promise<Readonly<{
  statusCode: number;
  headers: import("node:http").IncomingHttpHeaders;
  body: string;
}>> {
  return new Promise((resolve, reject) => {
    const request = nodeHttpRequest({
      host: "127.0.0.1",
      port,
      path,
      method,
      headers,
    }, (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
      response.once("error", reject);
      response.once("end", () => resolve({
        statusCode: response.statusCode ?? 0,
        headers: response.headers,
        body: Buffer.concat(chunks).toString("utf8"),
      }));
    });
    request.once("error", reject);
    request.end(body);
  });
}
