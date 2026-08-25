import pino from "pino";
import { redactErrorLogMessage, serializeSafeError } from "./observability/httpLogSerializers.js";

const defaultLevel = process.env.LOG_LEVEL ?? "info";
const defaultIsDevelopment = process.env.NODE_ENV !== "production";

export interface ApplicationLoggerOptions {
  /** Dependency-injection seam used only to capture a redacted logger in tests. */
  readonly destination?: pino.DestinationStream;
  readonly isDevelopment?: boolean;
  readonly level?: string;
}

/**
 * Creates the process logger with a single error-redaction policy. HTTP logs
 * add their own request/response allowlists in app.ts; direct operational
 * logger calls must still never serialize an Error's message, stack, or cause.
 */
export function createApplicationLogger(options: ApplicationLoggerOptions = {}): pino.Logger {
  const loggerOptions: pino.LoggerOptions = {
    level: options.level ?? defaultLevel,
    serializers: { err: serializeSafeError },
    hooks: {
      logMethod: redactErrorLogMessage,
    },
  };

  if (options.isDevelopment ?? defaultIsDevelopment) {
    return pino({
      ...loggerOptions,
      transport: { target: "pino-pretty", options: { colorize: true, translateTime: "HH:MM:ss" } },
    });
  }

  return pino(loggerOptions, options.destination);
}

export const logger = createApplicationLogger();
