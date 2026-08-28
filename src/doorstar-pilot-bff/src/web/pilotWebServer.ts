import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import {
  createPilotBffRuntime,
  type PilotBffRuntime,
} from "../infrastructure/runtime/createPilotBffRuntime.js";
import { createNodePilotBffHandler } from "../http/nodeHandler.js";
import {
  loadPilotOfficeStaticAssets,
  servePilotOfficeStaticRequest,
  type PilotOfficeStaticAssets,
} from "./officeStatic.js";
import {
  loadPilotWebConfig,
  PilotWebConfigurationError,
  type PilotWebConfig,
} from "./pilotWebConfig.js";

export type PilotWebLogger = Readonly<{
  info(event: string, context: Readonly<Record<string, string | number | boolean>>): void;
  error(event: string, context: Readonly<Record<string, string | number | boolean>>): void;
}>;

export const consolePilotWebLogger: PilotWebLogger = Object.freeze({
  info: (event, context) => console.info(JSON.stringify({ level: "info", event, ...context })),
  error: (event, context) => console.error(JSON.stringify({ level: "error", event, ...context })),
});

export type StartPilotWebServerOptions = Readonly<{
  environment?: NodeJS.ProcessEnv;
  createRuntime?: () => Promise<PilotBffRuntime>;
  staticAssets?: PilotOfficeStaticAssets;
  loadStaticAssets?: () => Promise<PilotOfficeStaticAssets>;
  logger?: PilotWebLogger;
}>;

export type PilotWebServer = Readonly<{
  config: PilotWebConfig;
  /** Stops accepting HTTP connections, then closes the BFF-owned pg pool. */
  close(): Promise<void>;
}>;

/**
 * Composition root for the real pilot web surface. Configuration, static
 * assets and BFF/database preflight all complete before `listen` is reached.
 * The listener is permanently loopback-only; ingress/TLS are external gates.
 */
export async function startPilotWebServer(
  options: StartPilotWebServerOptions = {},
): Promise<PilotWebServer> {
  const config = loadPilotWebConfig(options.environment ?? process.env);
  const staticAssets = options.staticAssets
    ?? await (options.loadStaticAssets ?? loadPilotOfficeStaticAssets)();
  const runtime = await (options.createRuntime ?? createPilotBffRuntime)();
  const nodeBffHandler = createNodePilotBffHandler(runtime);
  const listener = createServer(createPilotWebRequestHandler(nodeBffHandler, staticAssets));

  try {
    await listenLoopback(listener, config);
  } catch (error) {
    await closeAfterFailedListen(listener, runtime);
    throw error;
  }

  const logger = options.logger ?? consolePilotWebLogger;
  logger.info("pilot_web_listener_started", {
    host: config.listenerHost,
    port: config.listenerPort,
  });
  return createManagedPilotWebServer(listener, runtime, config);
}

/**
 * Process entrypoint only. Library consumers can use `startPilotWebServer`
 * and own their own lifecycle; this entrypoint handles normal service stops.
 */
export async function runPilotWebServer(
  options: StartPilotWebServerOptions = {},
): Promise<void> {
  const logger = options.logger ?? consolePilotWebLogger;
  let server: PilotWebServer;
  try {
    server = await startPilotWebServer({ ...options, logger });
  } catch (error) {
    logger.error("pilot_web_startup_failed", {
      reason: safeStartupFailureReason(error),
    });
    process.exitCode = 1;
    return;
  }

  let shuttingDown = false;
  const shutdown = (signal: "SIGINT" | "SIGTERM") => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    logger.info("pilot_web_shutdown_requested", { signal });
    void server.close().then(
      () => logger.info("pilot_web_shutdown_complete", { signal }),
      () => {
        process.exitCode = 1;
        logger.error("pilot_web_shutdown_failed", { signal });
      },
    );
  };

  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
}

/** Routes only the approved BFF namespaces to its adapter. */
export function createPilotWebRequestHandler(
  nodeBffHandler: (request: IncomingMessage, response: ServerResponse) => void,
  staticAssets: PilotOfficeStaticAssets,
): (request: IncomingMessage, response: ServerResponse) => void {
  return (request, response) => {
    if (isBffRequestTarget(request.url)) {
      nodeBffHandler(request, response);
      return;
    }
    servePilotOfficeStaticRequest(request, response, staticAssets);
  };
}

function isBffRequestTarget(target: string | undefined): boolean {
  if (!target || !target.startsWith("/") || target.startsWith("//")) {
    return false;
  }
  const requestPath = target.split(/[?#]/, 1)[0];
  return requestPath === "/auth"
    || requestPath.startsWith("/auth/")
    || requestPath === "/admin"
    || requestPath.startsWith("/admin/");
}

function listenLoopback(listener: Server, config: PilotWebConfig): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error) => {
      listener.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      listener.off("error", onError);
      resolve();
    };
    listener.once("error", onError);
    listener.once("listening", onListening);
    listener.listen({
      host: config.listenerHost,
      port: config.listenerPort,
      exclusive: true,
    });
  });
}

function createManagedPilotWebServer(
  listener: Server,
  runtime: PilotBffRuntime,
  config: PilotWebConfig,
): PilotWebServer {
  let closePromise: Promise<void> | undefined;
  return Object.freeze({
    config,
    close: () => {
      closePromise ??= (async () => {
        await closeListener(listener);
        await runtime.close();
      })();
      return closePromise;
    },
  });
}

async function closeAfterFailedListen(listener: Server, runtime: PilotBffRuntime): Promise<void> {
  try {
    await closeListener(listener);
  } catch {
    // The original bind error remains the actionable failure.
  }
  try {
    await runtime.close();
  } catch {
    // The original bind error remains the actionable failure.
  }
}

function closeListener(listener: Server): Promise<void> {
  if (!listener.listening) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    listener.close((error) => error ? reject(error) : resolve());
  });
}

function safeStartupFailureReason(error: unknown): string {
  if (error instanceof PilotWebConfigurationError) {
    return error.code;
  }
  return "startup_preflight_failed";
}
