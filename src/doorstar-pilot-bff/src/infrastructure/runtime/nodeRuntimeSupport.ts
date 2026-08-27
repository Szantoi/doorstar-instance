import type { Clock } from "../../ports/clock.js";
import type { PilotAuthLogger } from "../../ports/logger.js";

export const systemClock: Clock = Object.freeze({
  now: () => new Date(),
});

/**
 * The application layer supplies only reviewed safe fields to this logger.
 * Keep it deliberately tiny: secret-bearing values never reach console output.
 */
export const consolePilotAuthLogger: PilotAuthLogger = Object.freeze({
  info: (event: string, context: Readonly<Record<string, string | number | boolean>>) => console.info(JSON.stringify({ level: "info", event, ...context })),
  warn: (event: string, context: Readonly<Record<string, string | number | boolean>>) => console.warn(JSON.stringify({ level: "warn", event, ...context })),
  error: (event: string, context: Readonly<Record<string, string | number | boolean>>) => console.error(JSON.stringify({ level: "error", event, ...context })),
});
